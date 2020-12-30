/* @flow */

/**
 * 组件 v-model 的跨平台代码生成
 * Cross-platform code generation for component v-model
 */
export function genComponentModel (
  el: ASTElement,
  value: string,
  modifiers: ?ASTModifiers
): ?boolean {
  // v-model修饰符中的 number 和 trim
  // .number 输入字符串转为有效的数字 .trim 过滤掉输入的首尾空格
  const { number, trim } = modifiers || {}

  // $$v 什么意思 ???
  const baseValueExpression = '$$v'
  let valueExpression = baseValueExpression
  // 有.trim 需要修剪掉首尾空格
  if (trim) {
    // 值表达式 的 字符串
    valueExpression =
      `(typeof ${baseValueExpression} === 'string'` +
      `? ${baseValueExpression}.trim()` +
      `: ${baseValueExpression})`
  }
  // 有.number 需要转成有效的数字
  if (number) {
    // 值表达式 的 字符串
    // target._n = toNumber  将输入值转换为数字来保存, 如果转换失败, 返回原始的字符串
    valueExpression = `_n(${valueExpression})`
  }
  // 生成v-model赋值代码 生成callback代码
  const assignment = genAssignmentCode(value, valueExpression)

  // 为el的model赋值
  el.model = {
    value: `(${value})`, // 转成字符串 用括号括起来
    expression: JSON.stringify(value),
    callback: `function (${baseValueExpression}) {${assignment}}`
  }
}

/**
 * Cross-platform codegen helper for generating v-model value assignment code.
 * 跨平台代码生成工具, 生成v-model赋值代码
 */
export function 
genAssignmentCode (
  value: string,
  assignment: string
): string {
  
  // 解析v-model 解析的结果是一个包含 表达式 和 key的对象
  const res = parseModel(value)
  if (res.key === null) {
    // res没有key 直接返回辅助语句
    return `${value}=${assignment}`
  } else {
    // 向响应式对象中添加一个property, 并确保这个新property同样是响应式的，且触发试图更新
    return `$set(${res.exp}, ${res.key}, ${assignment})`
  }
}

/** 将v-model表达式解析成一个 基础路径 和 一个最终的 键段
 * 同时处理 点路径 和 方括号
 * Parse a v-model expression into a base path and a final key segment.
 * Handles both dot-path and possible square brackets.
 *
 * 可能的情况如下:
 * Possible cases:
 *
 * - test
 * - test[key]
 * - test[test1[key]]
 * - test["a"][key]
 * - xxx.test[a[a].test1[key]]
 * - test.xxx.a["asa"][test1[key]]
 *
 */

 // 定义的全局变量
let len, str, chr, index, expressionPos, expressionEndPos

// 解析的结果是一个包含 表达式 和 key的对象
type ModelParseResult = {
  exp: string,
  key: string | null
}

// 解析v-model的值, 返回一个包含属性exp 和 key 的对象 ModelParseResult
export function parseModel (val: string): ModelParseResult {
  // Fix https://github.com/vuejs/vue/pull/7730
  // allow v-model="obj.val " (trailing whitespace)
  val = val.trim()
  len = val.length
  // value中没有[, 或者 ]不是最后一个字符 直接以最后一个.切分, 前面的是exp 后面的是key 函数直接返回
  if (val.indexOf('[') < 0 || val.lastIndexOf(']') < len - 1) {
    index = val.lastIndexOf('.')
    // 有 .
    if (index > -1) {
      // 假如value是a.b.c.d  exp是a.b.c   key是 "d"
      return {
        exp: val.slice(0, index),
        key: '"' + val.slice(index + 1) + '"'
      }
    } else {
      // 没有 .   key为null exp为value
      return {
        exp: val,
        key: null
      }
    }
  }

  // str 赋值 为 val
  str = val
  // 初始化为0
  index = expressionPos = expressionEndPos = 0

  // 循环遍历str
  while (!eof()) {
    chr = next()
    /* istanbul ignore if */
    if (isStringStart(chr)) { // ' 或者 "
      // 解析字符串
      parseString(chr)
    } else if (chr === 0x5B) { // [
      // 解析方括号
      parseBracket(chr)
    }
  }

  return {
    exp: val.slice(0, expressionPos), // [0, expressionPos)
    key: val.slice(expressionPos + 1, expressionEndPos) // [expressionPos + 1, expressionEndPos)
  }
}

// 返回下一个字符串中下一个位置的字符的Unicode编码
// 例: 'abc'.charCodeAt(1) 98
function next (): number {
  return str.charCodeAt(++index)
}

// 已经到了字符串的末尾 遍历已结束
function eof (): boolean {
  return index >= len
}

// 判断是否是字符串的开始 0x22 代表双引号 "  0x27 代表单引号 '
// String.fromCharCode(0x22)
function isStringStart (chr: number): boolean {
  // 是双引号 或 单引号 代表字符串的开始
  return chr === 0x22 || chr === 0x27
}

// 解析方括号 []
function parseBracket (chr: number): void {
  let inBracket = 1
  expressionPos = index
  // 循环遍历字符串的每个字符 直至结束
  while (!eof()) {
    // 获取下一个字符的Unicode码
    chr = next()
    // 如果是字符串的开始 ' 或者 "
    if (isStringStart(chr)) {
      // 解析字符串
      parseString(chr)
      continue
    }
    // 方括号数 +1
    if (chr === 0x5B) inBracket++ // [
    // 方括号数 -1
    if (chr === 0x5D) inBracket-- // ]
    // 中括号都已闭合
    if (inBracket === 0) {
      // 设置 expressionEndPos 为当前index
      expressionEndPos = index
      break
    }
  }
}

// 解析字符串
function parseString (chr: number): void {
  // 引号
  const stringQuote = chr
  // 往下寻找 直到遇到相同的引号 代表字符串结束
  while (!eof()) {
    // next的时候 全局变量index在递增
    chr = next()
    if (chr === stringQuote) {
      break
    }
  }
}
