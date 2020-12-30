// 错误检测器
/* @flow */

// 指令正则 和 on正则
import { dirRE, onRE } from './parser/index'

type Range = { start?: number, end?: number };

// these keywords should not appear inside expressions, but operators like
// typeof, instanceof and in are allowed
// 这些关键字不能出现在表达式中, 但是像 typeof instanceof in 这些操作是允许的

// '\bdo\b|\bif\b'  \b匹配单词的开头和结尾 "ido" 不匹配  "i do"匹配
const prohibitedKeywordRE = new RegExp('\\b' + (
  'do,if,for,let,new,try,var,case,else,with,await,break,catch,class,const,' +
  'super,throw,while,yield,delete,export,import,return,switch,default,' +
  'extends,finally,continue,debugger,function,arguments'
).split(',').join('\\b|\\b') + '\\b')

// these unary operators should not be used as property/method names
// 这些一元操作符不可以用作 属性/方法 名
const unaryOperatorsRE = new RegExp('\\b' + (
  'delete,typeof,void'
).split(',').join('\\s*\\([^\\)]*\\)|\\b') + '\\s*\\([^\\)]*\\)')

// strip strings in expressions
// 删除表达式中的字符串
const stripStringRE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g

// detect problematic expressions in a template
// 检测模板中有问题的表达式
export function detectErrors (ast: ?ASTNode, warn: Function) {
  if (ast) {
    checkNode(ast, warn)
  }
}

// 检测抽象语法树中的所有节点
function checkNode (node: ASTNode, warn: Function) {
  // 1 节点
  if (node.type === 1) {
    // 循环节点的所有属性
    for (const name in node.attrsMap) {
      // 是指令
      if (dirRE.test(name)) {
        const value = node.attrsMap[name]
        if (value) {
          const range = node.rawAttrsMap[name]
          if (name === 'v-for') {
            // for
            checkFor(node, `v-for="${value}"`, warn, range)
          } else if (name === 'v-slot' || name[0] === '#') {
            // slot
            checkFunctionParameterExpression(value, `${name}="${value}"`, warn, range)
          } else if (onRE.test(name)) {
            // on
            checkEvent(value, `${name}="${value}"`, warn, range)
          } else {
            // 表达式
            checkExpression(value, `${name}="${value}"`, warn, range)
          }
        }
      }
    }
    // 检查所有子节点
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        checkNode(node.children[i], warn)
      }
    }
    // 2 表达式
  } else if (node.type === 2) {
    checkExpression(node.expression, node.text, warn, node)
  }
}

// 事件
function checkEvent (exp: string, text: string, warn: Function, range?: Range) {
  const stripped = exp.replace(stripStringRE, '')
  const keywordMatch: any = stripped.match(unaryOperatorsRE)
  if (keywordMatch && stripped.charAt(keywordMatch.index - 1) !== '$') {
    // 避免使用JavaScript一元运算符作为属性名
    warn(
      `avoid using JavaScript unary operator as property name: ` +
      `"${keywordMatch[0]}" in expression ${text.trim()}`,
      range
    )
  }
  checkExpression(exp, text, warn, range)
}

// 检查 for
function checkFor (node: ASTElement, text: string, warn: Function, range?: Range) {
  checkExpression(node.for || '', text, warn, range)
  checkIdentifier(node.alias, 'v-for alias', text, warn, range)
  checkIdentifier(node.iterator1, 'v-for iterator', text, warn, range)
  checkIdentifier(node.iterator2, 'v-for iterator', text, warn, range)
}

// 检查标识符
function checkIdentifier (
  ident: ?string,
  type: string,
  text: string,
  warn: Function,
  range?: Range
) {
  if (typeof ident === 'string') {
    try {
      // 通过创建一个 赋值语句 的函数 来检测
      new Function(`var ${ident}=_`)
    } catch (e) {
      warn(`invalid ${type} "${ident}" in expression: ${text.trim()}`, range)
    }
  }
}

// 检查表达式
function checkExpression (exp: string, text: string, warn: Function, range?: Range) {
  try {
    new Function(`return ${exp}`)
  } catch (e) {
    const keywordMatch = exp.replace(stripStringRE, '').match(prohibitedKeywordRE)
    if (keywordMatch) {
      warn(
        `avoid using JavaScript keyword as property name: ` +
        `"${keywordMatch[0]}"\n  Raw expression: ${text.trim()}`,
        range
      )
    } else {
      warn(
        `invalid expression: ${e.message} in\n\n` +
        `    ${exp}\n\n` +
        `  Raw expression: ${text.trim()}\n`,
        range
      )
    }
  }
}

function checkFunctionParameterExpression (exp: string, text: string, warn: Function, range?: Range) {
  try {
    new Function(exp, '')
  } catch (e) {
    warn(
      `invalid function parameter expression: ${e.message} in\n\n` +
      `    ${exp}\n\n` +
      `  Raw expression: ${text.trim()}\n`,
      range
    )
  }
}
