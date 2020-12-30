/* @flow */

// 优化抽象语法树 AST

import { makeMap, isBuiltInTag, cached, no } from 'shared/util'

let isStaticKey
let isPlatformReservedTag

// 为纯函数 genStaticKeys 创建一个缓存版本
const genStaticKeysCached = cached(genStaticKeys)

/**
 * Goal of the optimizer: walk the generated template AST tree
 * and detect sub-trees that are purely static, i.e. parts of
 * the DOM that never needs to change.
 *
 * 优化器的目标: 遍历生成的模板AST树, 并检测纯静态的子树, 也就是DOM中永远不需要改变的部分
 * 一旦检测到这些子树, 我们可以进行以下操作: 
 * 
 * 1. 将他们提升为常量, 这样我们就不用在每次重新渲染时为它们创建新的节点;
 * 2. 在修补过程中完全跳过它们
 * 
 * Once we detect these sub-trees, we can:
 *
 * 1. Hoist them into constants, so that we no longer need to
 *    create fresh nodes for them on each re-render;
 * 2. Completely skip them in the patching process.
 */

export function optimize (root: ?ASTElement, options: CompilerOptions) {
  // 根节点为空 函数返回
  if (!root) return
  // 判断是否是静态key的 函数
  isStaticKey = genStaticKeysCached(options.staticKeys || '')
  // 判断是否是平台保留的标签 的函数
  isPlatformReservedTag = options.isReservedTag || no
  // first pass: mark all non-static nodes.
  // 第一步: 标记所有非静态节点
  markStatic(root)
  // second pass: mark static roots.
  // 第二遍: 标记静态的根节点
  markStaticRoots(root, false)
}

// 产生静态的key
function genStaticKeys (keys: string): Function {
  // 将字符串分隔成数组, 然后建一个map 最后返回一个function
  return makeMap(
    'type,tag,attrsList,attrsMap,plain,parent,children,attrs,start,end,rawAttrsMap' +
    (keys ? ',' + keys : '')
  )
}

// 标记节点Node及其子节点是否为 静态静态节点
function markStatic (node: ASTNode) {
  node.static = isStatic(node)
  // ASTElement
  if (node.type === 1) {
    // do not make component slot content static. this avoids
    // 1. components not able to mutate slot nodes
    // 2. static slot content fails for hot-reloading

    // 不要将组件插槽内容设为静态, 这样可以避免以下两点:
    // 1. 组件无法更改插槽节点
    // 2. 静态插槽内容热重载失败
    if (
      !isPlatformReservedTag(node.tag) &&
      node.tag !== 'slot' &&
      node.attrsMap['inline-template'] == null
    ) {
      // 直接返回
      return
    }
    // node的所有子节点
    for (let i = 0, l = node.children.length; i < l; i++) {
      const child = node.children[i]
      // 递归
      markStatic(child)
      // 如果子节点不是静态的, 父节点就是非静态的
      if (!child.static) {
        node.static = false
      }
    }
    // node节点的条件节点
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        const block = node.ifConditions[i].block
        markStatic(block)
        if (!block.static) {
          node.static = false
        }
      }
    }
  }
}

// 标记 静态根节点
function markStaticRoots (node: ASTNode, isInFor: boolean) {
  // 是 ASTElement
  if (node.type === 1) {
    if (node.static || node.once) { // v-once 只渲染元素和组件一次, 元素/组件及其所有子节点将被视为静态内容并跳过
      node.staticInFor = isInFor
    }
    // For a node to qualify as a static root, it should have children that
    // are not just static text. Otherwise the cost of hoisting out will
    // outweigh the benefits and it's better off to just always render it fresh.

    // 要使节点符合静态根的条件,它应该具有不只是静态文本的子节点。
    // 否则, 提出来的成本会超过好处, 最好总是把它渲染为最新的

    // 括号里的判断是指: 不能只有一个节点且是个文本节点
    if (node.static && node.children.length && !(
      node.children.length === 1 &&
      node.children[0].type === 3
    )) {
      // 标记为静态根 函数并返回
      node.staticRoot = true
      return
    } else {
      node.staticRoot = false
    }
    // 标记 node 的所有子节点
    if (node.children) {
      for (let i = 0, l = node.children.length; i < l; i++) {
        markStaticRoots(node.children[i], isInFor || !!node.for)
      }
    }
    // 标记 node 的所有条件节点
    if (node.ifConditions) {
      for (let i = 1, l = node.ifConditions.length; i < l; i++) {
        markStaticRoots(node.ifConditions[i].block, isInFor)
      }
    }
  }
}

// 判断参数node 是否是静态节点
function isStatic (node: ASTNode): boolean {
  // 表达式节点是 非静态节点
  if (node.type === 2) { // expression
    return false
  }
  // 文本是静态节点
  if (node.type === 3) { // text
    return true
  }

  // 只要满足以下条件就可以判定为静态节点
  // 1. v-pre标签的节点
  // 2. 没有动态绑定 && 不是v-if && 不是v-for && 不是内置标签 && 不是一个组件 && 不是模板For的直接孩子 && node的所有key都是 isStaticKey
  return !!(node.pre || (
    !node.hasBindings && // no dynamic bindings
    !node.if && !node.for && // not v-if or v-for or v-else
    !isBuiltInTag(node.tag) && // not a built-in 内置标签由 slot 和 component 组成
    isPlatformReservedTag(node.tag) && // not a component 是平台预留的标签 不是组件
    !isDirectChildOfTemplateFor(node) &&
    Object.keys(node).every(isStaticKey)
  ))
}

// 判断参数node是否 是模板For的直接孩子
function isDirectChildOfTemplateFor (node: ASTElement): boolean {
  while (node.parent) {
    node = node.parent
    // 只要任何一层的父节点不是template 返回false
    if (node.tag !== 'template') {
      return false
    }
    // 只要任何一层的父节点是template 且 是for 返回true
    if (node.for) {
      return true
    }
  }
  // node没有父节点 或者 父节点都是template 但 都不是for 返回false
  return false
}
