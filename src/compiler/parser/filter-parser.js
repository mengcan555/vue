/* @flow */

// 如果有过滤器对过滤器进行解析后返回, 如果没有过滤器返回字符串

// 有效的分隔符正则
const validDivisionCharRE = /[\w).+\-_$\]]/

export function parseFilters (exp: string): string {
  // 单引号
  let inSingle = false
  // 双引号
  let inDouble = false
  // 模板符号
  let inTemplateString = false
  // 正则符号 \
  let inRegex = false
  // 花括号
  let curly = 0
  // 方括号
  let square = 0
  // 圆括号
  let paren = 0
  
  let lastFilterIndex = 0
  let c, prev, i, expression, filters

  for (i = 0; i < exp.length; i++) {
    prev = c
    // exp第i个字符的ASCII码
    // charCodeAt 的反操作是 String.fromCharCode()
    c = exp.charCodeAt(i)
    if (inSingle) {
      // 单引号闭合了''
      if (c === 0x27 && prev !== 0x5C) inSingle = false // c是单引号' pre不是反斜线 \
    } else if (inDouble) {
      // 双引号闭合了 ”“
      if (c === 0x22 && prev !== 0x5C) inDouble = false // c是双引号 " pre不是反斜线 \
    } else if (inTemplateString) {
      // 模板符合闭合了 ``
      if (c === 0x60 && prev !== 0x5C) inTemplateString = false // c是模板符号` pre不是反斜线 \
    } else if (inRegex) {
      // 正则结束了 //
      if (c === 0x2f && prev !== 0x5C) inRegex = false // c是斜杠 / pre不是反斜线 \
    } else if (
      // 0x7c === 124 指代管道符 | vue的过滤器filter
      c === 0x7C && // pipe
      // 前后都不是| 确定不是或运算 ||
      exp.charCodeAt(i + 1) !== 0x7C &&
      exp.charCodeAt(i - 1) !== 0x7C &&
      // 不在各种括弧内
      !curly && !square && !paren
    ) {
      if (expression === undefined) {
        // first filter, end of expression
        lastFilterIndex = i + 1
        // 从下标0到i（不包括i）的子串 过滤器前的表达式
        // 去除字符串的头尾空格
        expression = exp.slice(0, i).trim()
      } else {
        // 表达式只会有一个 expression
        // 把过滤器存入filters数组
        pushFilter()
      }
    } else {
      switch (c) {
        case 0x22: inDouble = true; break         // "
        case 0x27: inSingle = true; break         // '
        case 0x60: inTemplateString = true; break // `  es6的模板字符
        case 0x28: paren++; break                 // (
        case 0x29: paren--; break                 // )
        case 0x5B: square++; break                // [
        case 0x5D: square--; break                // ]
        case 0x7B: curly++; break                 // {
        case 0x7D: curly--; break                 // }
      }
      if (c === 0x2f) { // 斜杠 /
        let j = i - 1
        let p
        // 找到前面第一个非空格的字符
        // find first non-whitespace prev char
        for (; j >= 0; j--) {
          // charAt(index) 返回字符串指定下标位置的字符
          p = exp.charAt(j)
          if (p !== ' ') break
        }
        if (!p || !validDivisionCharRE.test(p)) {
          // 在正则中
          inRegex = true
        }
      }
    }
  }

  if (expression === undefined) {
    expression = exp.slice(0, i).trim()
  } else if (lastFilterIndex !== 0) {
    pushFilter()
  }

  function pushFilter () {
    (filters || (filters = [])).push(exp.slice(lastFilterIndex, i).trim())
    lastFilterIndex = i + 1
  }
  // 循环处理所有过滤器,类似于顺序函数调用
  if (filters) {
    for (i = 0; i < filters.length; i++) {
      expression = wrapFilter(expression, filters[i])
    }
  }
  // 返回所有filter处理过后的表达式值
  return expression
}
// 过滤器执行
function wrapFilter (exp: string, filter: string): string {
  const i = filter.indexOf('(')
  if (i < 0) {
    // 没有括号,只接收唯一参数exp表达式
    // _f: resolveFilter
    // 假设过滤器是 capitalize 表达式是'aBc'
    // _f("capitalize")（'abc'）
    return `_f("${filter}")(${exp})`
  } else {
    // 接收多个参数 带括号 capitalize(arg1, arg2)
    const name = filter.slice(0, i) // capitalize
    const args = filter.slice(i + 1) // arg1, arg2)
    // _f("capitalize")('aBc',arg1, arg2)
    return `_f("${name}")(${exp}${args !== ')' ? ',' + args : args}`
  }
}
