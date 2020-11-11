/* @flow */

import he from 'he'
import { parseHTML } from './html-parser'
import { parseText } from './text-parser'
import { parseFilters } from './filter-parser'
import { genAssignmentCode } from '../directives/model'
import { extend, cached, no, camelize, hyphenate } from 'shared/util'
import { isIE, isEdge, isServerRendering } from 'core/util/env'

import {
  addProp,
  addAttr,
  baseWarn,
  addHandler,
  addDirective,
  getBindingAttr,
  getAndRemoveAttr,
  getRawBindingAttr,
  pluckModuleFunction,
  getAndRemoveAttrByRegex
} from '../helpers'

// <button v-on:click="doThis"></button>
// <button @click="doThis"></button>
// 事件侦听正则表达式
export const onRE = /^@|^v-on:/

// 指令正则表达式
// <img v-bind:src="imageSrc">
// <img :src="imageSrc">
// v-slot缩写: #
// .xxx v-bind属性简写
export const dirRE = process.env.VBIND_PROP_SHORTHAND
  ? /^v-|^@|^:|^\.|^#/
  : /^v-|^@|^:|^#/ 

// <div v-for="item in items">
// <div v-for="item of items">
export const forAliasRE = /([\s\S]*?)\s+(?:in|of)\s+([\s\S]*)/
// v-for迭代器的正则表达式
export const forIteratorRE = /,([^,\}\]]*)(?:,([^,\}\]]*))?$/
const stripParensRE = /^\(|\)$/g
// 动态参数正则[]
const dynamicArgRE = /^\[.*\]$/

const argRE = /:(.*)$/
// v-bind  :  .三种 ?
export const bindRE = /^:|^\.|^v-bind:/
// 
const propBindRE = /^\./
// 修饰符正则
const modifierRE = /\.[^.\]]+(?=[^\]]*$)/g

// 插槽正则
const slotRE = /^v-slot(:|$)|^#/

const lineBreakRE = /[\r\n]/
const whitespaceRE = /\s+/g

const invalidAttributeRE = /[\s"'<>\/=]/

const decodeHTMLCached = cached(he.decode)

export const emptySlotScopeToken = `_empty_`

// configurable state
export let warn: any
let delimiters
let transforms
let preTransforms
let postTransforms
let platformIsPreTag
let platformMustUseProp
let platformGetTagNamespace
let maybeComponent

// 创建抽象语法树AST元素
export function createASTElement (
  tag: string,
  attrs: Array<ASTAttr>,
  parent: ASTElement | void
): ASTElement {
  return {
    type: 1,
    tag,
    attrsList: attrs,
    attrsMap: makeAttrsMap(attrs),
    rawAttrsMap: {},
    parent,
    children: []
  }
}

/**
 * Convert HTML string to AST.
 * 将HTML字符串转换成抽象语法树 AST
 */

export function parse (
  template: string,
  options: CompilerOptions
): ASTElement | void {
  warn = options.warn || baseWarn

  platformIsPreTag = options.isPreTag || no
  platformMustUseProp = options.mustUseProp || no
  platformGetTagNamespace = options.getTagNamespace || no
  // 是否是保留标签
  const isReservedTag = options.isReservedTag || no
  // el.component非空 或者 不是预留的标签  就认为是组件
  maybeComponent = (el: ASTElement) => !!el.component || !isReservedTag(el.tag)

  // pluckModuleFunction 从options.modules中摘出函数transformNode, 返回值是一个 函数数组
  transforms = pluckModuleFunction(options.modules, 'transformNode')
  preTransforms = pluckModuleFunction(options.modules, 'preTransformNode')
  postTransforms = pluckModuleFunction(options.modules, 'postTransformNode')

  // 分隔符
  delimiters = options.delimiters

  const stack = []
  const preserveWhitespace = options.preserveWhitespace !== false
  const whitespaceOption = options.whitespace
  let root
  let currentParent
  // v-pre 跳过这个元素及其子元素的编译过程
  // <span v-pre>{{this will not be compiled}}</span>
  let inVPre = false
  // 在<pre>标签中
  let inPre = false
  // 已经警告过
  let warned = false

  // 警告一次
  function warnOnce (msg, range) {
    if (!warned) {
      warned = true
      warn(msg, range)
    }
  }
  // 对待闭合标签元素处理
  function closeElement (element) {
    trimEndingWhitespace(element)
    // 不在v-pre中且未被处理过
    if (!inVPre && !element.processed) {
      element = processElement(element, options)
    }
    // tree management
    if (!stack.length && element !== root) {
      // allow root elements with v-if, v-else-if and v-else
      if (root.if && (element.elseif || element.else)) {
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(element)
        }
        addIfCondition(root, {
          exp: element.elseif,
          block: element
        })
      } else if (process.env.NODE_ENV !== 'production') {
        warnOnce(
          `Component template should contain exactly one root element. ` +
          `If you are using v-if on multiple elements, ` +
          `use v-else-if to chain them instead.`,
          { start: element.start }
        )
      }
    }
    if (currentParent && !element.forbidden) {
      if (element.elseif || element.else) {
        processIfConditions(element, currentParent)
      } else {
        if (element.slotScope) {
          // scoped slot
          // keep it in the children list so that v-else(-if) conditions can
          // find it as the prev node.
          const name = element.slotTarget || '"default"'
          ;(currentParent.scopedSlots || (currentParent.scopedSlots = {}))[name] = element
        }
        currentParent.children.push(element)
        element.parent = currentParent
      }
    }

    // final children cleanup
    // filter out scoped slots
    element.children = element.children.filter(c => !(c: any).slotScope)
    // remove trailing whitespace node again
    trimEndingWhitespace(element)

    // check pre state
    if (element.pre) {
      inVPre = false
    }
    if (platformIsPreTag(element.tag)) {
      inPre = false
    }
    // apply post-transforms
    for (let i = 0; i < postTransforms.length; i++) {
      postTransforms[i](element, options)
    }
  }

  // 去除尾部的空白节点
  function trimEndingWhitespace (el) {
    // remove trailing whitespace node
    // 不在pre标签中, 因为<pre>标签会保留空格和换行符
    if (!inPre) {
      let lastNode
      while (
        (lastNode = el.children[el.children.length - 1]) &&
        lastNode.type === 3 && // 文本节点
        lastNode.text === ' '
      ) {
        // 删除最后一个元素
        el.children.pop()
      }
    }
  }

  function checkRootConstraints (el) {
    if (el.tag === 'slot' || el.tag === 'template') {
      warnOnce(
        `Cannot use <${el.tag}> as component root element because it may ` +
        'contain multiple nodes.',
        { start: el.start }
      )
    }
    if (el.attrsMap.hasOwnProperty('v-for')) {
      warnOnce(
        'Cannot use v-for on stateful component root element because ' +
        'it renders multiple elements.',
        el.rawAttrsMap['v-for']
      )
    }
  }

  parseHTML(template, {
    warn,
    expectHTML: options.expectHTML,
    isUnaryTag: options.isUnaryTag,
    canBeLeftOpenTag: options.canBeLeftOpenTag,
    shouldDecodeNewlines: options.shouldDecodeNewlines,
    shouldDecodeNewlinesForHref: options.shouldDecodeNewlinesForHref,
    shouldKeepComment: options.comments,
    outputSourceRange: options.outputSourceRange,
    //
    start (tag, attrs, unary, start, end) {
      // check namespace.
      // inherit parent ns if there is one
      const ns = (currentParent && currentParent.ns) || platformGetTagNamespace(tag)

      // handle IE svg bug
      /* istanbul ignore if */
      if (isIE && ns === 'svg') {
        attrs = guardIESVGBug(attrs)
      }

      let element: ASTElement = createASTElement(tag, attrs, currentParent)
      if (ns) {
        element.ns = ns
      }

      if (process.env.NODE_ENV !== 'production') {
        if (options.outputSourceRange) {
          element.start = start
          element.end = end
          element.rawAttrsMap = element.attrsList.reduce((cumulated, attr) => {
            cumulated[attr.name] = attr
            return cumulated
          }, {})
        }
        attrs.forEach(attr => {
          if (invalidAttributeRE.test(attr.name)) {
            warn(
              `Invalid dynamic argument expression: attribute names cannot contain ` +
              `spaces, quotes, <, >, / or =.`,
              {
                start: attr.start + attr.name.indexOf(`[`),
                end: attr.start + attr.name.length
              }
            )
          }
        })
      }

      if (isForbiddenTag(element) && !isServerRendering()) {
        element.forbidden = true
        process.env.NODE_ENV !== 'production' && warn(
          'Templates should only be responsible for mapping the state to the ' +
          'UI. Avoid placing tags with side-effects in your templates, such as ' +
          `<${tag}>` + ', as they will not be parsed.',
          { start: element.start }
        )
      }

      // apply pre-transforms
      for (let i = 0; i < preTransforms.length; i++) {
        element = preTransforms[i](element, options) || element
      }

      if (!inVPre) {
        processPre(element)
        if (element.pre) {
          inVPre = true
        }
      }
      if (platformIsPreTag(element.tag)) {
        inPre = true
      }
      if (inVPre) {
        processRawAttrs(element)
      } else if (!element.processed) {
        // structural directives
        processFor(element)
        processIf(element)
        processOnce(element)
      }

      if (!root) {
        root = element
        if (process.env.NODE_ENV !== 'production') {
          checkRootConstraints(root)
        }
      }

      if (!unary) {
        currentParent = element
        stack.push(element)
      } else {
        closeElement(element)
      }
    },
    // 闭合一个标签
    end (tag, start, end) {
      const element = stack[stack.length - 1]
      // pop stack
      stack.length -= 1
      currentParent = stack[stack.length - 1]
      if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
        element.end = end
      }
      // 闭合标签元素
      closeElement(element)
    },

    chars (text: string, start: number, end: number) {
      // text文本没有父节点,给出错误信息
      if (!currentParent) {
        if (process.env.NODE_ENV !== 'production') {
          if (text === template) {
            warnOnce(
              'Component template requires a root element, rather than just text.',
              { start }
            )
          } else if ((text = text.trim())) {
            warnOnce(
              `text "${text}" outside root element will be ignored.`,
              { start }
            )
          }
        }
        return
      }
      // IE textarea placeholder bug
      /* istanbul ignore if */
      if (isIE &&
        currentParent.tag === 'textarea' &&
        currentParent.attrsMap.placeholder === text
      ) {
        return
      }
      const children = currentParent.children
      if (inPre || text.trim()) {
        text = isTextTag(currentParent) ? text : decodeHTMLCached(text)
      } else if (!children.length) {
        // remove the whitespace-only node right after an opening tag
        text = ''
      } else if (whitespaceOption) {
        if (whitespaceOption === 'condense') {
          // in condense mode, remove the whitespace node if it contains
          // line break, otherwise condense to a single space
          text = lineBreakRE.test(text) ? '' : ' '
        } else {
          text = ' '
        }
      } else {
        text = preserveWhitespace ? ' ' : ''
      }
      if (text) {
        if (!inPre && whitespaceOption === 'condense') {
          // condense consecutive whitespaces into single space
          text = text.replace(whitespaceRE, ' ')
        }
        // 为text创建ASTNode
        let res
        let child: ?ASTNode
        if (!inVPre && text !== ' ' && (res = parseText(text, delimiters))) {
          child = {
            type: 2,
            expression: res.expression,
            tokens: res.tokens,
            text
          }
        } else if (text !== ' ' || !children.length || children[children.length - 1].text !== ' ') {
          child = {
            type: 3,
            text
          }
        }
        if (child) {
          if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
            child.start = start
            child.end = end
          }
          children.push(child)
        }
      }
    },
    comment (text: string, start, end) {
      // adding anything as a sibling to the root node is forbidden
      // comments should still be allowed, but ignored
      if (currentParent) {
        const child: ASTText = {
          type: 3,
          text,
          isComment: true
        }
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          child.start = start
          child.end = end
        }
        currentParent.children.push(child)
      }
    }
  })
  return root
}

function processPre (el) {
  if (getAndRemoveAttr(el, 'v-pre') != null) {
    el.pre = true
  }
}

function processRawAttrs (el) {
  const list = el.attrsList
  const len = list.length
  if (len) {
    const attrs: Array<ASTAttr> = el.attrs = new Array(len)
    for (let i = 0; i < len; i++) {
      attrs[i] = {
        name: list[i].name,
        value: JSON.stringify(list[i].value)
      }
      if (list[i].start != null) {
        attrs[i].start = list[i].start
        attrs[i].end = list[i].end
      }
    }
  } else if (!el.pre) {
    // non root node in pre blocks with no attributes
    el.plain = true
  }
}

// 处理元素
export function processElement (
  element: ASTElement,
  options: CompilerOptions
) {
  // 获取el的key值,赋值给element.key, 在非生产环境下给出错误提示
  processKey(element)

  // determine whether this is a plain element after
  // removing structural attributes
  // 判断元素是不是一个纯元素(没有key scopedSlot attr)
  element.plain = (
    !element.key &&
    !element.scopedSlots &&
    !element.attrsList.length
  )
  // 获取元素的ref属性值
  processRef(element)
  // 
  processSlotContent(element)
  processSlotOutlet(element)
  processComponent(element)
  for (let i = 0; i < transforms.length; i++) {
    element = transforms[i](element, options) || element
  }
  processAttrs(element)
  return element
}

// 获取el的key值, 在非生产环境下给出错误提示
function processKey (el) {
  // 获取key的表达式
  const exp = getBindingAttr(el, 'key')
  if (exp) {
    if (process.env.NODE_ENV !== 'production') {
      // 非生产环境
      if (el.tag === 'template') {
        // template上不能带key
        warn(
          `<template> cannot be keyed. Place the key on real elements instead.`,
          // 获取el的key属性
          getRawBindingAttr(el, 'key')
        )
      }
      if (el.for) {
        // v-for的解析结果中包含这两个迭代器
        const iterator = el.iterator2 || el.iterator1
        const parent = el.parent
        // el父元素是<transition-group>, 它是vue内置的组件
        if (iterator && iterator === exp && parent && parent.tag === 'transition-group') {
          // <transition-group> 的子节点不能用v-for的index作为key
          warn(
            `Do not use v-for index as key on <transition-group> children, ` +
            `this is the same as not using keys.`,
            getRawBindingAttr(el, 'key'),
            true /* tip */
          )
        }
      }
    }
    // 为el.key赋值
    el.key = exp
  }
}

function processRef (el) {
  // 获取el的ref属性值
  const ref = getBindingAttr(el, 'ref')
  if (ref) {
    el.ref = ref
    // 如果el或其父节点有for, el.refInFor为true
    el.refInFor = checkInFor(el)
  }
}

export function processFor (el: ASTElement) {
  let exp
  if ((exp = getAndRemoveAttr(el, 'v-for'))) {
    const res = parseFor(exp)
    if (res) {
      extend(el, res)
    } else if (process.env.NODE_ENV !== 'production') {
      warn(
        `Invalid v-for expression: ${exp}`,
        el.rawAttrsMap['v-for']
      )
    }
  }
}

type ForParseResult = {
  for: string;
  alias: string;
  iterator1?: string;
  iterator2?: string;
};

export function parseFor (exp: string): ?ForParseResult {
  const inMatch = exp.match(forAliasRE)
  if (!inMatch) return
  const res = {}
  res.for = inMatch[2].trim()
  const alias = inMatch[1].trim().replace(stripParensRE, '')
  const iteratorMatch = alias.match(forIteratorRE)
  if (iteratorMatch) {
    res.alias = alias.replace(forIteratorRE, '').trim()
    res.iterator1 = iteratorMatch[1].trim()
    if (iteratorMatch[2]) {
      res.iterator2 = iteratorMatch[2].trim()
    }
  } else {
    res.alias = alias
  }
  return res
}

function processIf (el) {
  const exp = getAndRemoveAttr(el, 'v-if')
  if (exp) {
    el.if = exp
    addIfCondition(el, {
      exp: exp,
      block: el
    })
  } else {
    if (getAndRemoveAttr(el, 'v-else') != null) {
      el.else = true
    }
    const elseif = getAndRemoveAttr(el, 'v-else-if')
    if (elseif) {
      el.elseif = elseif
    }
  }
}

function processIfConditions (el, parent) {
  const prev = findPrevElement(parent.children)
  if (prev && prev.if) {
    addIfCondition(prev, {
      exp: el.elseif,
      block: el
    })
  } else if (process.env.NODE_ENV !== 'production') {
    warn(
      `v-${el.elseif ? ('else-if="' + el.elseif + '"') : 'else'} ` +
      `used on element <${el.tag}> without corresponding v-if.`,
      el.rawAttrsMap[el.elseif ? 'v-else-if' : 'v-else']
    )
  }
}

function findPrevElement (children: Array<any>): ASTElement | void {
  let i = children.length
  while (i--) {
    if (children[i].type === 1) {
      return children[i]
    } else {
      if (process.env.NODE_ENV !== 'production' && children[i].text !== ' ') {
        warn(
          `text "${children[i].text.trim()}" between v-if and v-else(-if) ` +
          `will be ignored.`,
          children[i]
        )
      }
      children.pop()
    }
  }
}

export function addIfCondition (el: ASTElement, condition: ASTIfCondition) {
  if (!el.ifConditions) {
    el.ifConditions = []
  }
  el.ifConditions.push(condition)
}

function processOnce (el) {
  const once = getAndRemoveAttr(el, 'v-once')
  if (once != null) {
    el.once = true
  }
}

// handle content being passed to a component as slot,
// 处理传递给组件的插槽内容
// e.g. <template v-slot:name>
// v-slot取代了 被废弃但未被移除的 slot 和 slot-scope <template slot="xxx">, <div slot-scope="xxx">
function processSlotContent (el) {
  let slotScope
  // scope只能用在<template>标签中 slot-scope可以用在其他普通元素
  if (el.tag === 'template') {
    slotScope = getAndRemoveAttr(el, 'scope')
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && slotScope) {
      warn(
        `the "scope" attribute for scoped slots have been deprecated and ` +
        `replaced by "slot-scope" since 2.5. The new "slot-scope" attribute ` +
        `can also be used on plain elements in addition to <template> to ` +
        `denote scoped slots.`,
        el.rawAttrsMap['scope'],
        true
      )
    }
    el.slotScope = slotScope || getAndRemoveAttr(el, 'slot-scope')
  } else if ((slotScope = getAndRemoveAttr(el, 'slot-scope'))) {
    /* istanbul ignore if */
    // v-for 与 slot-scope 同时使用
    if (process.env.NODE_ENV !== 'production' && el.attrsMap['v-for']) {
      warn(
        `Ambiguous combined usage of slot-scope and v-for on <${el.tag}> ` +
        `(v-for takes higher priority). Use a wrapper <template> for the ` +
        `scoped slot to make it clearer.`,
        el.rawAttrsMap['slot-scope'],
        true
      )
    }
    // 为元素赋值 插槽作用域 属性
    el.slotScope = slotScope
  }

  // slot="xxx"
  // slot属性已废弃, v-slot替代
  const slotTarget = getBindingAttr(el, 'slot')
  if (slotTarget) {
    el.slotTarget = slotTarget === '""' ? '"default"' : slotTarget
    // 动态slot
    el.slotTargetDynamic = !!(el.attrsMap[':slot'] || el.attrsMap['v-bind:slot'])
    // preserve slot as an attribute for native shadow DOM compat
    // only for non-scoped slots.
    if (el.tag !== 'template' && !el.slotScope) {
      addAttr(el, 'slot', slotTarget, getRawBindingAttr(el, 'slot'))
    }
  }

  // 2.6 v-slot syntax
  // 最新的 v-slot语法

  // <base-layout>
  //   为<base-layout>组件中的header插槽提供的内容
  //   <template v-slot:header>
  //     <h1>Here might be a page title</h1>
  //   </template>
  // </base-layout>


  // <base-layout>的定义:
  // <div class="container">
  //   <header>
  //     <slot name="header"></slot>
  //   </header>
  // </div>
  if (process.env.NEW_SLOT_SYNTAX) { // 新slot语法 v-slot
    if (el.tag === 'template') {
      // <template>标签上的v-slot
      // v-slot on <template>
      // 从el.attrsList中通过正则获取并删除slot属性
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          if (el.slotTarget || el.slotScope) {
            // 重复使用了多种slot语法, 给出警告
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          // el有父节点, 且 父节点不是component组件 给出警告
          if (el.parent && !maybeComponent(el.parent)) {
            warn(
              // <template v-slot> 只能出现在接收 组件 的 根级别 位置
              `<template v-slot> can only appear at the root level inside ` +
              `the receiving component`,
              el
            )
          }
        }
        // 获取插槽的名字, 动态名或静态名
        const { name, dynamic } = getSlotName(slotBinding)
        el.slotTarget = name
        el.slotTargetDynamic = dynamic
        // <slot v-bind:userSlot="user"></slot> 插槽作用域slotScope就是user
        el.slotScope = slotBinding.value || emptySlotScopeToken // _empty_  // force it into a scoped slot for perf
      }
    } else {
      // 组件上的v-slot 表示默认插槽
      // v-slot on component, denotes default slot
      const slotBinding = getAndRemoveAttrByRegex(el, slotRE)
      if (slotBinding) {
        if (process.env.NODE_ENV !== 'production') {
          // el不是组件
          if (!maybeComponent(el)) {
            // 只能在<template>标签和组件上使用v-slot
            warn(
              `v-slot can only be used on components or <template>.`,
              slotBinding
            )
          }
          if (el.slotScope || el.slotTarget) {
            // 重复使用了多种slot语法, 给出警告
            warn(
              `Unexpected mixed usage of different slot syntaxes.`,
              el
            )
          }
          if (el.scopedSlots) {
            // 为了避免作用域产生歧义, 在又其他命名插槽的时候 默认插槽也应该使用<template>语法
            warn(
              `To avoid scope ambiguity, the default slot should also use ` +
              `<template> syntax when there are other named slots.`,
              slotBinding
            )
          }
        }
        // add the component's children to its default slot
        // 把组件的子节点添加到其默认插槽中
        const slots = el.scopedSlots || (el.scopedSlots = {})
        const { name, dynamic } = getSlotName(slotBinding)
        // 为el创建一个AST抽象语法树子节点, 标签为template
        const slotContainer = slots[name] = createASTElement('template', [], el)
        slotContainer.slotTarget = name
        slotContainer.slotTargetDynamic = dynamic
        // 为默认slot的template容器添加子节点
        slotContainer.children = el.children.filter((c: any) => {
          // 如果子元素c没有插槽作用域, 将其作为slotContainer的子节点
          if (!c.slotScope) {
            c.parent = slotContainer
            return true
          }
        })
        // <slot v-bind:userSlot="user"></slot> 插槽作用域slotScope就是user
        slotContainer.slotScope = slotBinding.value || emptySlotScopeToken
        // remove children as they are returned from scopedSlots now
        // 清空组件el的子节点, 这些子节点都
        el.children = []
        // 设置el为非纯元素,以便生成数据
        // mark el non-plain so data gets generated
        el.plain = false
      }
    }
  }
}

// 获取插槽的名字, 动态名或静态名
function getSlotName (binding) {
  // v-slot:header 获得插槽的名字 header
  let name = binding.name.replace(slotRE, '')
  if (!name) {
    // v-slot没有名字, 名字默认为 default
    if (binding.name[0] !== '#') {
      name = 'default'
    } else if (process.env.NODE_ENV !== 'production') {
      // v-slot的简写 # 必须得带名字, 因为所谓插槽的缩写指的就是"具名插槽的缩写" 
      // v-slot:header 可以缩写为 #header
      warn(
        `v-slot shorthand syntax requires a slot name.`,
        binding
      )
    }
  }
  // 以中括号开头
  return dynamicArgRE.test(name)
    // dynamic [name]
    // // 动态插槽名 的写法: v-slot:[dynamicSlotName]
    // slice(1, -1) [start , end) -1代表从数组末尾开始算起，正好去除左右中括号[]
    ? { name: name.slice(1, -1), dynamic: true }
    // static name
    : { name: `"${name}"`, dynamic: false }
}

// handle <slot/> outlets
function processSlotOutlet (el) {
  if (el.tag === 'slot') {
    el.slotName = getBindingAttr(el, 'name')
    if (process.env.NODE_ENV !== 'production' && el.key) {
      warn(
        `\`key\` does not work on <slot> because slots are abstract outlets ` +
        `and can possibly expand into multiple elements. ` +
        `Use the key on a wrapping element instead.`,
        getRawBindingAttr(el, 'key')
      )
    }
  }
}

function processComponent (el) {
  let binding
  if ((binding = getBindingAttr(el, 'is'))) {
    el.component = binding
  }
  if (getAndRemoveAttr(el, 'inline-template') != null) {
    el.inlineTemplate = true
  }
}

// 处理元素的属性列表
function processAttrs (el) {
  // 获取元素el的属性列表
  const list = el.attrsList
  let i, l, name, rawName, value, modifiers, syncGen, isDynamic
  // 循环处理属性列表里的每个属性
  for (i = 0, l = list.length; i < l; i++) {
    // 获取属性名和属性值
    name = rawName = list[i].name
    value = list[i].value
    // 如果当前待处理属性是 指令
    if (dirRE.test(name)) {
      // mark element as dynamic
      // 元素是动态的
      el.hasBindings = true
      // modifiers 修饰符
      // 解析出来包含的所有修饰符, 返回一个modifiers对象, 比如: modifiers.prevent = true
      modifiers = parseModifiers(name.replace(dirRE, ''))
      // support .foo shorthand syntax for the .prop modifier
      // 此层if else 是为了将属性名name去除修饰符
      if (process.env.VBIND_PROP_SHORTHAND && propBindRE.test(name)) {
        // 设置.prop修饰符
        (modifiers || (modifiers = {})).prop = true
        name = `.` + name.slice(1).replace(modifierRE, '')
      } else if (modifiers) {
        // 修饰符以空格替换
        name = name.replace(modifierRE, '')
      }
      // v-bind指令属性
      if (bindRE.test(name)) {
        // 去掉name中的绑定指令字符, 比如: v-bind: : .
        name = name.replace(bindRE, '')
        //  v-bind:id="rawId | formatId"
        // 对属性值进行过滤器解析
        value = parseFilters(value)
        // 动态attribute名 <button v-bind:[key]="value"></button> 或简写为 <button :[key]="value"></button>
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          // 去掉首尾 中括号符 [key] -> key
          name = name.slice(1, -1)
        }
        // value为空, 非生产环境给出错误信息
        if (
          process.env.NODE_ENV !== 'production' &&
          value.trim().length === 0
        ) {
          warn(
            `The value for a v-bind expression cannot be empty. Found in "v-bind:${name}"`
          )
        }
        // 修饰符非空
        if (modifiers) {
          if (modifiers.prop && !isDynamic) {
            // 驼峰化
            name = camelize(name)
            if (name === 'innerHtml') name = 'innerHTML'
          }
          // .camel 驼峰化修饰符
          if (modifiers.camel && !isDynamic) {
            name = camelize(name)
          }
          // .sync 同步修饰符
          if (modifiers.sync) {
            // 生成赋值代码
            syncGen = genAssignmentCode(value, `$event`)
            if (!isDynamic) {
              addHandler(
                el,
                `update:${camelize(name)}`,
                syncGen,
                null,
                false,
                warn,
                list[i]
              )
              if (hyphenate(name) !== camelize(name)) {
                addHandler(
                  el,
                  `update:${hyphenate(name)}`,
                  syncGen,
                  null,
                  false,
                  warn,
                  list[i]
                )
              }
            } else {
              // handler w/ dynamic event name
              addHandler(
                el,
                `"update:"+(${name})`,
                syncGen,
                null,
                false,
                warn,
                list[i],
                true // dynamic
              )
            }
          }
        }
        if ((modifiers && modifiers.prop) || (
          !el.component && platformMustUseProp(el.tag, el.attrsMap.type, name)
        )) {
          addProp(el, name, value, list[i], isDynamic)
        } else {
          addAttr(el, name, value, list[i], isDynamic)
        }
      } else if (onRE.test(name)) { // v-on
        name = name.replace(onRE, '')
        isDynamic = dynamicArgRE.test(name)
        if (isDynamic) {
          name = name.slice(1, -1)
        }
        addHandler(el, name, value, modifiers, false, warn, list[i], isDynamic)
      } else { // normal directives
        name = name.replace(dirRE, '')
        // parse arg
        const argMatch = name.match(argRE)
        let arg = argMatch && argMatch[1]
        isDynamic = false
        if (arg) {
          name = name.slice(0, -(arg.length + 1))
          if (dynamicArgRE.test(arg)) {
            arg = arg.slice(1, -1)
            isDynamic = true
          }
        }
        addDirective(el, name, rawName, value, arg, isDynamic, modifiers, list[i])
        if (process.env.NODE_ENV !== 'production' && name === 'model') {
          checkForAliasModel(el, value)
        }
      }
    } else {
      // 如果当前待处理属性是 文字属性（字面意义的属性）
      // literal attribute
      if (process.env.NODE_ENV !== 'production') {
        const res = parseText(value, delimiters)
        if (res) {
          // 属性内的插值功能已经被vue移除 比如: <div id="{{ val }}">
          // 需要使用v-bind或者简写形式 改成 <div v-bind:src="val"> 或者 <div :id="val">
          warn(
            `${name}="${value}": ` +
            'Interpolation inside attributes has been removed. ' +
            'Use v-bind or the colon shorthand instead. For example, ' +
            'instead of <div id="{{ val }}">, use <div :id="val">.',
            list[i]
          )
        }
      }
      // 添加属性到元素el的 动态属性数组dynamicAttrs 或 静态属性数组attrs中
      addAttr(el, name, JSON.stringify(value), list[i])
      // #6887 firefox doesn't update muted state if set via attribute
      // even immediately after element creation
      if (!el.component &&
          name === 'muted' &&
          platformMustUseProp(el.tag, el.attrsMap.type, name)) {
            
        //    
        addProp(el, name, 'true', list[i])
      }
    }
  }
}

// 检查当前元素el或其父元素是否有for指令
function checkInFor (el: ASTElement): boolean {
  let parent = el
  while (parent) {
    if (parent.for !== undefined) {
      return true
    }
    // 往父元素查询
    parent = parent.parent
  }
  return false
}

// 解析出所有的修饰符, 组成一个对象 .prevent
function parseModifiers (name: string): Object | void {
  const match = name.match(modifierRE) // /g的正则mach后的结果是所有匹配字符串的数组，与不带/g不同
  if (match) {
    const ret = {}
    // 循环处理所有匹配的字符串
    // slice(1) 是为了去掉修饰符前的. 比如ret.prevent = true
    match.forEach(m => { ret[m.slice(1)] = true })
    return ret
  }
}

// 简历属性map对象, 同时验重
function makeAttrsMap (attrs: Array<Object>): Object {
  const map = {}
  for (let i = 0, l = attrs.length; i < l; i++) {
    // 重复的属性
    if (
      // 非生产环境 && 有次属性名 && 不是IE && 不是Edge, 给出错误信息
      process.env.NODE_ENV !== 'production' &&
      map[attrs[i].name] && !isIE && !isEdge
    ) {
      warn('duplicate attribute: ' + attrs[i].name, attrs[i])
    }
    // 建立属性map对象
    map[attrs[i].name] = attrs[i].value
  }
  return map
}
// https://www.cnblogs.com/cc11001100/p/7189410.html
// <script type="text/javascript"></script> 与 <style type="text/css"></style>中的内容不进行解码 
// <script type="text/x-template"></script>
// script标签如果没有设置type, 默认是"text/javascript",浏览器会按照js去解析, 如果是其他type,忽略处理,等待页面加载完成后,
// 模板引擎获取到标签内容,然后使用数据对其进行渲染再输出到页面上
// for script (e.g. type="x/template") or style, do not decode content
function isTextTag (el): boolean {
  return el.tag === 'script' || el.tag === 'style'
}

// <script type="text/javascript"></script>
function isForbiddenTag (el): boolean {
  return (
    el.tag === 'style' ||
    (el.tag === 'script' && (
      !el.attrsMap.type ||
      el.attrsMap.type === 'text/javascript'
    ))
  )
}

const ieNSBug = /^xmlns:NS\d+/
const ieNSPrefix = /^NS\d+:/

/* istanbul ignore next */
// 对一些属性做特殊处理
function guardIESVGBug (attrs) {
  const res = []
  for (let i = 0; i < attrs.length; i++) {
    const attr = attrs[i]
    if (!ieNSBug.test(attr.name)) {
      attr.name = attr.name.replace(ieNSPrefix, '')
      res.push(attr)
    }
  }
  return res
}

// 检查是否针对v-for的别名变量绑定了 v-modal 这样不合法
// v-for="item in items"  (alias in expression) item就是alias
function checkForAliasModel (el, value) {
  let _el = el
  while (_el) {
    if (_el.for && _el.alias === value) {
      warn(
        `<${el.tag} v-model="${value}">: ` +
        `You are binding v-model directly to a v-for iteration alias. ` +
        `This will not be able to modify the v-for source array because ` +
        `writing to the alias is like modifying a function local variable. ` +
        `Consider using an array of objects and use v-model on an object property instead.`,
        el.rawAttrsMap['v-model']
      )
    }
    // 从子节点网上逐层判断
    _el = _el.parent
  }
}
