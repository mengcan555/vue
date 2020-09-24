/**
 * Not type-checking this file because it's mostly vendor code.
 */

/*!
 * HTML Parser By John Resig (ejohn.org)
 * Modified by Juriy "kangax" Zaytsev
 * Original code by Erik Arvidsson (MPL-1.1 OR Apache-2.0 OR GPL-2.0-or-later)
 * http://erik.eae.net/simplehtmlparser/simplehtmlparser.js
 */

import { makeMap, no } from 'shared/util'
import { isNonPhrasingTag } from 'web/compiler/util'
import { unicodeRegExp } from 'core/util/lang'

// Regular Expressions for parsing tags and attributes
// 解析标签和属性的正则表达式
const attribute = /^\s*([^\s"'<>\/=]+)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const dynamicArgAttribute = /^\s*((?:v-[\w-]+:|@|:|#)\[[^=]+\][^\s"'<>\/=]*)(?:\s*(=)\s*(?:"([^"]*)"+|'([^']*)'+|([^\s"'=<>`]+)))?/
const ncname = `[a-zA-Z_][\\-\\.0-9_a-zA-Z${unicodeRegExp.source}]*` // 返回正则表达式的源文本内容，不包括标志, 比如/g等
const qnameCapture = `((?:${ncname}\\:)?${ncname})`
const startTagOpen = new RegExp(`^<${qnameCapture}`)
const startTagClose = /^\s*(\/?)>/
const endTag = new RegExp(`^<\\/${qnameCapture}[^>]*>`)
const doctype = /^<!DOCTYPE [^>]+>/i
// #7298: escape - to avoid being passed as HTML comment when inlined in page
// HTML中的注释 <!--  -->
const comment = /^<!\--/
// 条件注释
// <![if IE]>
// <![endif]>
const conditionalComment = /^<!\[/

// Special Elements (can contain anything)
// 纯文本元素
export const isPlainTextElement = makeMap('script,style,textarea', true) // expectsLowerCase为true
const reCache = {}

// 解码映射
const decodingMap = {
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&amp;': '&',
  '&#10;': '\n',
  '&#9;': '\t',
  '&#39;': "'"
}
// 已编码属性的正则表达式
const encodedAttr = /&(?:lt|gt|quot|amp|#39);/g
// 包括 \n 和 \t
const encodedAttrWithNewLines = /&(?:lt|gt|quot|amp|#39|#10|#9);/g

// #5992
// <pre> <textarea> 忽略\n
const isIgnoreNewlineTag = makeMap('pre,textarea', true)
// 是pre 或者 textarea标签, 且第一个字符是 \n
const shouldIgnoreFirstNewline = (tag, html) => tag && isIgnoreNewlineTag(tag) && html[0] === '\n'

// 解码操作, 比如: 将 &lt 解码成 <
function decodeAttr (value, shouldDecodeNewlines) {
  const re = shouldDecodeNewlines ? encodedAttrWithNewLines : encodedAttr
  // 把value中与正则表达式re匹配的子串match 替换成 decodingMap[match] 因为re有/g 会替换所有匹配的子串，否则只替换第一个匹配的子串
  return value.replace(re, match => decodingMap[match])
}

// HTML解析函数
export function parseHTML (html, options) {
  // stack中存在的是开始标签
  const stack = []
  const expectHTML = options.expectHTML
  const isUnaryTag = options.isUnaryTag || no // unary tag 一元标签
  // 可以缺失闭合标签, 自己可以闭合
  const canBeLeftOpenTag = options.canBeLeftOpenTag || no
  // 全局索引变量
  let index = 0
  // lastTag代表stack中的最后一个标签
  let last, lastTag
  // 循环遍历html的每个字符
  while (html) {
    last = html
    // Make sure we're not in a plaintext content element like script/style
    if (!lastTag || !isPlainTextElement(lastTag)) {
      // < 标志文本的结束, <之前的是文本
      let textEnd = html.indexOf('<')
      // 以 < 开始, 没有text文本
      if (textEnd === 0) {
        // Comment: 注释
        // RegExp.test(str) 如果str中包含与RegExp匹配的文本返回true，否则返回false
        if (comment.test(html)) {
          const commentEnd = html.indexOf('-->')

          if (commentEnd >= 0) {
            if (options.shouldKeepComment) {
              // <!--   --> 分别是4个字符和3个字符
              // 为注释新建一个ASTText, 并添加到抽象语法树中 options.comment定义在./index.js中
              options.comment(html.substring(4, commentEnd), index, index + commentEnd + 3)
            }
            // advance(n), index右移n html赋值为[n, 末尾]
            advance(commentEnd + 3)
            continue
          }
        }

        // http://en.wikipedia.org/wiki/Conditional_comment#Downlevel-revealed_conditional_comment
        // downlevel revealed conditional comment
        if (conditionalComment.test(html)) {
          const conditionalEnd = html.indexOf(']>')
          // 右移2位
          if (conditionalEnd >= 0) {
            advance(conditionalEnd + 2)
            continue
          }
        }

        // Doctype: 文档类型
        // match(substr or reg) 返回 null 或 数组 数组[0]是匹配的文本
        const doctypeMatch = html.match(doctype)
        // 非null, 表示匹配成功
        if (doctypeMatch) {
          // 向右移动匹配子串的长度
          advance(doctypeMatch[0].length)
          continue
        }

        // End tag:
        const endTagMatch = html.match(endTag)
        if (endTagMatch) {
          const curIndex = index
          advance(endTagMatch[0].length)
          // 解析闭合标签
          parseEndTag(endTagMatch[1], curIndex, index)
          continue
        }

        // Start tag:
        const startTagMatch = parseStartTag()
        if (startTagMatch) {
          // ?
          handleStartTag(startTagMatch)
          if (shouldIgnoreFirstNewline(startTagMatch.tagName, html)) {
            advance(1)
          }
          continue
        }
      }
      // 有text文本内容
      let text, rest, next
      if (textEnd >= 0) {
        // 获取剩余的html内容 [textEnd ...]
        rest = html.slice(textEnd)
        while (
          !endTag.test(rest) &&
          !startTagOpen.test(rest) &&
          !comment.test(rest) &&
          !conditionalComment.test(rest)
        ) {
          // < in plain text, be forgiving and treat it as text
          // 纯文本中的字符'<' 被视为文本
          next = rest.indexOf('<', 1) // 从位置1开始查找
          if (next < 0) break
          textEnd += next
          rest = html.slice(textEnd)
        }
        // 文本字符串
        text = html.substring(0, textEnd)
      }
      // 整个html是文本
      if (textEnd < 0) {
        text = html
      }

      if (text) {
        advance(text.length)
      }

      // 解析文本节点
      if (options.chars && text) {
        options.chars(text, index - text.length, index)
      }
    } else {
      // 
      let endTagLength = 0
      const stackedTag = lastTag.toLowerCase()
      const reStackedTag = reCache[stackedTag] || (reCache[stackedTag] = new RegExp('([\\s\\S]*?)(</' + stackedTag + '[^>]*>)', 'i'))
      const rest = html.replace(reStackedTag, function (all, text, endTag) {
        endTagLength = endTag.length
        if (!isPlainTextElement(stackedTag) && stackedTag !== 'noscript') {
          text = text
            .replace(/<!\--([\s\S]*?)-->/g, '$1') // #7298
            .replace(/<!\[CDATA\[([\s\S]*?)]]>/g, '$1')
        }
        if (shouldIgnoreFirstNewline(stackedTag, text)) {
          text = text.slice(1)
        }
        // 为text创建 ASTNode
        if (options.chars) {
          options.chars(text)
        }
        return ''
      })
      index += html.length - rest.length
      html = rest
      parseEndTag(stackedTag, index - endTagLength, index)
    }

    if (html === last) {
      options.chars && options.chars(html)
      if (process.env.NODE_ENV !== 'production' && !stack.length && options.warn) {
        options.warn(`Mal-formatted tag at end of template: "${html}"`, { start: index + html.length })
      }
      break
    }
  }

  // Clean up any remaining tags
  // 将stack中存在的未闭合的标签处理完毕
  parseEndTag()

  function advance (n) {
    index += n
    // substring(start, end) 从[start end)的子串, 缺省end代表到末尾
    html = html.substring(n)
  }
  // 解析开始标签, 包括标签名 属性数组 等 返回一个match对象
  function parseStartTag () {
    const start = html.match(startTagOpen)
    if (start) {
      // 开始标签 属性
      const match = {
        tagName: start[1],
        attrs: [],
        start: index
      }
      advance(start[0].length)
      let end, attr
      // 获取标签的属性
      while (!(end = html.match(startTagClose)) && (attr = html.match(dynamicArgAttribute) || html.match(attribute))) {
        attr.start = index
        advance(attr[0].length)
        attr.end = index
        match.attrs.push(attr)
      }
      // 到开始标签的最后了
      if (end) {
        match.unarySlash = end[1] // 一元 斜杠  <br />
        advance(end[0].length)
        match.end = index
        return match
      }
    }
  }
  // 处理开始标签
  function handleStartTag (match) {
    const tagName = match.tagName
    const unarySlash = match.unarySlash

    if (expectHTML) {
      if (lastTag === 'p' && isNonPhrasingTag(tagName)) {
        parseEndTag(lastTag)
      }
      if (canBeLeftOpenTag(tagName) && lastTag === tagName) {
        parseEndTag(tagName)
      }
    }

    const unary = isUnaryTag(tagName) || !!unarySlash

    const l = match.attrs.length
    const attrs = new Array(l)
    // 循环处理开始标签的每个属性
    for (let i = 0; i < l; i++) {
      const args = match.attrs[i]
      const value = args[3] || args[4] || args[5] || ''
      const shouldDecodeNewlines = tagName === 'a' && args[1] === 'href'
        ? options.shouldDecodeNewlinesForHref
        : options.shouldDecodeNewlines
      attrs[i] = {
        name: args[1],
        value: decodeAttr(value, shouldDecodeNewlines)
      }
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        attrs[i].start = args.start + args[0].match(/^\s*/).length
        attrs[i].end = args.end
      }
    }
    // 如果不是一元标签,将此标签信息存入stack,并将其设置为lastTag
    if (!unary) {
      stack.push({ tag: tagName, lowerCasedTag: tagName.toLowerCase(), attrs: attrs, start: match.start, end: match.end })
      lastTag = tagName
    }
    // 生成 ASTElement
    if (options.start) {
      options.start(tagName, attrs, unary, match.start, match.end)
    }
  }

  // 解析结束标签,
  function parseEndTag (tagName, start, end) {
    let pos, lowerCasedTagName
    if (start == null) start = index
    if (end == null) end = index

    // Find the closest opened tag of the same type
    // 在stack中查询最近的相同类型的未闭合标签
    // stack中存在的是开始标签
    if (tagName) {
      lowerCasedTagName = tagName.toLowerCase()
      for (pos = stack.length - 1; pos >= 0; pos--) {
        if (stack[pos].lowerCasedTag === lowerCasedTagName) {
          break
        }
      }
    } else {
      // If no tag name is provided, clean shop
      // 没有提供标签名
      pos = 0
    }

    if (pos >= 0) {
      // 沿着堆栈 关闭所有未闭合的标签
      // Close all the open elements, up the stack
      for (let i = stack.length - 1; i >= pos; i--) {
        // stack[i]标签没有闭合,也没有机会闭合了
        if (process.env.NODE_ENV !== 'production' &&
          (i > pos || !tagName) &&
          options.warn
        ) {
          // 给出标签未闭合错误信息
          options.warn(
            `tag <${stack[i].tag}> has no matching end tag.`,
            { start: stack[i].start, end: stack[i].end }
          )
        }
        if (options.end) {
          // 闭合标签 stack[i].tag, 组装抽象语法树AST
          options.end(stack[i].tag, start, end)
        }
      }

      // Remove the open elements from the stack
      // 将未闭合的标签从stack中移除
      stack.length = pos
      // stack中的最后一个标签
      lastTag = pos && stack[pos - 1].tag
    } else if (lowerCasedTagName === 'br') { // <br> <br /> 没有闭合标签 </br>是错误的
      if (options.start) {
        // br是一元标签 生成一个ASTElement 然后调用closeElement(element) 闭合标签
        options.start(tagName, [], true, start, end) // tagname attrs unary start end
      }
    } else if (lowerCasedTagName === 'p') {
      // p不是一元标签，先调用start生成ASTElement, 再调用end组装抽象语法树AST
      if (options.start) {
        options.start(tagName, [], false, start, end)
      }
      if (options.end) {
        options.end(tagName, start, end)
      }
    }
  }
}
