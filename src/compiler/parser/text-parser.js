/* @flow */
// 将text里的文本内容 和 {{}}插值内容一并存入TextParseResult类型的对象中并返回, 插值里的内容先进行过滤器解析

import { cached } from 'shared/util'
import { parseFilters } from './filter-parser'

const defaultTagRE = /\{\{((?:.|\r?\n)+?)\}\}/g
const regexEscapeRE = /[-.*+?^${}()|[\]\/\\]/g

const buildRegex = cached(delimiters => {
  const open = delimiters[0].replace(regexEscapeRE, '\\$&')
  const close = delimiters[1].replace(regexEscapeRE, '\\$&')
  return new RegExp(open + '((?:.|\\n)+?)' + close, 'g')
})

type TextParseResult = {
  expression: string,
  tokens: Array<string | { '@binding': string }>
}

// 文本解析
export function parseText (
  text: string,
  delimiters?: [string, string] // 纯文本的插入分隔符, 默认为["{{", "}}"], {{expression}}  可以设置成比如['@{{', '}}']  @{{expression}}
): TextParseResult | void {
  const tagRE = delimiters ? buildRegex(delimiters) : defaultTagRE
  // 不是文本插值{{exp}} 函数直接返回
  if (!tagRE.test(text)) {
    return
  }
  const tokens = []
  const rawTokens = []
  // 下一次匹配的起始位置
  let lastIndex = tagRE.lastIndex = 0
  let match, index, tokenValue
  // 循环执行多次匹配 match[1]是匹配的第一个子表达式
  // "{{ message | capitalize | size }} {{ aaa | bbb | ccc }}"
  // 第一次match: index:0 match[0]: "{{ message | capitalize | size }}" match[1]: " message | capitalize | size "
  // 第二次match: index: 34 match[0]: "{{ aaa | bbb | ccc }}" match[1]: " aaa | bbb | ccc "
  while ((match = tagRE.exec(text))) {
    // 匹配成功的位置
    index = match.index
    // push text token
    // 存储文本标记
    // "123 {{ message | capitalize | size }}" tokenValue就是123
    if (index > lastIndex) {
      rawTokens.push(tokenValue = text.slice(lastIndex, index))// {{ message | capitalize | size }}
      tokens.push(JSON.stringify(tokenValue)) // 转换成JSON字符串
    }
    // tag token
    // 过滤器表达式
    const exp = parseFilters(match[1].trim())
    // _s: toString
    tokens.push(`_s(${exp})`)
    rawTokens.push({ '@binding': exp })
    lastIndex = index + match[0].length
  }
  // 匹配结束后, 剩余的text内容
  if (lastIndex < text.length) {
    rawTokens.push(tokenValue = text.slice(lastIndex))
    tokens.push(JSON.stringify(tokenValue))
  }
  return {
    expression: tokens.join('+'), // {{ message | capitalize | size }} + {{ aaa | bbb | ccc }}
    tokens: rawTokens
  }
}
