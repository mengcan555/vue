/* @flow */

import { toNumber, toString, looseEqual, looseIndexOf } from 'shared/util'
import { createTextVNode, createEmptyVNode } from 'core/vdom/vnode'
import { renderList } from './render-list'
import { renderSlot } from './render-slot'
import { resolveFilter } from './resolve-filter'
import { checkKeyCodes } from './check-keycodes'
import { bindObjectProps } from './bind-object-props'
import { renderStatic, markOnce } from './render-static'
import { bindObjectListeners } from './bind-object-listeners'
import { resolveScopedSlots } from './resolve-scoped-slots'
import { bindDynamicKeys, prependModifier } from './bind-dynamic-keys'

export function installRenderHelpers (target: any) {
  target._o = markOnce
  // 将输入值转换为数字来保存, 如果转换失败, 返回原始的字符串
  target._n = toNumber
  // 文本解析器
  target._s = toString
  // 渲染v-for里的列表
  target._l = renderList
  target._t = renderSlot
  target._q = looseEqual
  target._i = looseIndexOf
  // 渲染静态树
  target._m = renderStatic
  // 过滤器
  target._f = resolveFilter
  // 检查keycodes
  target._k = checkKeyCodes
  target._b = bindObjectProps
  target._v = createTextVNode
  // 创建空的虚拟节点
  target._e = createEmptyVNode
  target._u = resolveScopedSlots
  target._g = bindObjectListeners
  // 绑定动态的key
  target._d = bindDynamicKeys
  target._p = prependModifier
}
