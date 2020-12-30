/* @flow */

import { emptyObject } from 'shared/util'
import { parseFilters } from './parser/filter-parser'

type Range = { start?: number, end?: number };

/* eslint-disable no-unused-vars */
export function baseWarn (msg: string, range?: Range) {
  console.error(`[Vue compiler]: ${msg}`)
}
/* eslint-enable no-unused-vars */

export function pluckModuleFunction<F: Function> (
  modules: ?Array<Object>,
  key: string
): Array<F> {
  return modules
    ? modules.map(m => m[key]).filter(_ => _)
    : []
}

// 
export function addProp (el: ASTElement, name: string, value: string, range?: Range, dynamic?: boolean) {
  (el.props || (el.props = [])).push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// 添加属性到 元素el的动态属性数组dynamicAttrs 或 静态属性数组attrs中
export function addAttr (el: ASTElement, name: string, value: any, range?: Range, dynamic?: boolean) {
  const attrs = dynamic
    ? (el.dynamicAttrs || (el.dynamicAttrs = []))
    : (el.attrs || (el.attrs = []))
  
  // 为item设置范围, 包括开始和结束 {start: range.start, end: range.end}
  attrs.push(rangeSetItem({ name, value, dynamic }, range))
  el.plain = false
}

// add a raw attr (use this in preTransforms)
export function addRawAttr (el: ASTElement, name: string, value: any, range?: Range) {
  el.attrsMap[name] = value
  el.attrsList.push(rangeSetItem({ name, value }, range))
}

// 为el添加指令
export function addDirective (
  el: ASTElement,
  name: string,
  rawName: string,
  value: string,
  arg: ?string,
  isDynamicArg: boolean,
  modifiers: ?ASTModifiers,
  range?: Range
) {
  (el.directives || (el.directives = [])).push(rangeSetItem({
    name,
    rawName,
    value,
    arg,
    isDynamicArg,
    modifiers
  }, range))
  el.plain = false
}

// 为修饰符增加 前缀标记
function prependModifierMarker (symbol: string, name: string, dynamic?: boolean): string {
  return dynamic
    ? `_p(${name},"${symbol}")`
    : symbol + name // mark the event as captured  将事件标记为已捕获
}

// 增加事件处理器
export function addHandler (
  el: ASTElement,
  name: string,
  value: string,
  modifiers: ?ASTModifiers,
  important?: boolean,
  warn?: ?Function,
  range?: Range,
  dynamic?: boolean
) {
  // emptyObject 为 Object.freeze({}) 一个冻结的空对象,再也不可以被修改
  modifiers = modifiers || emptyObject
  // 对同时使用prevent和passive修饰符 发出警告信息
  // prevent 是拦截默认事件, passive(提高性能的)是不拦截默认事件。
  // warn prevent and passive modifier
  /* istanbul ignore if */
  if (
    process.env.NODE_ENV !== 'production' && warn &&
    modifiers.prevent && modifiers.passive
  ) {
    // passsive和prevent修饰符不能同时使用, passive 处理器不阻止默认事件
    warn(
      'passive and prevent can\'t be used together. ' +
      'Passive handler can\'t prevent default event.',
      range
    )
  }
  // 规范化 鼠标右键 和 鼠标中键 的单击事件, 因为它们不会真正触发 click.right click.middle : click的right middle修饰符
  // normalize click.right and click.middle since they don't actually fire
  // this is technically browser-specific, but at least for now browsers are
  // the only target envs that have right/middle clicks.
  // 有.right修饰符
  if (modifiers.right) {
    if (dynamic) {
      // 如果name为click, 重新赋值为contextmenu, 否则保持不变
      name = `(${name})==='click'?'contextmenu':(${name})`
    } else if (name === 'click') {
      // 上下文菜单
      name = 'contextmenu'
      delete modifiers.right
    }
  // 有.middle修饰符
  } else if (modifiers.middle) {
    if (dynamic) {
      // 如果name为click, 重新赋值为mouseup, 否则保持不变
      name = `(${name})==='click'?'mouseup':(${name})`
    } else if (name === 'click') {
      // 鼠标上移
      name = 'mouseup'
    }
  }

  // 添加事件监听器时使用事件捕获模式
  // 即内部元素触发的事件先在此处理，然后才交由内部元素进行处理
  // <div v-on:click.capture="doThis">...</div>

  // check capture modifier
  // 检查捕获修饰符
  if (modifiers.capture) {
    delete modifiers.capture
    // 为修饰符增加 前缀标记
    name = prependModifierMarker('!', name, dynamic)
  }
  // once修饰符
  if (modifiers.once) {
    delete modifiers.once
    name = prependModifierMarker('~', name, dynamic)
  }
  /* istanbul ignore if */
  // passive修饰符
  if (modifiers.passive) {
    delete modifiers.passive
    name = prependModifierMarker('&', name, dynamic)
  }

  let events
  // .native修饰符 监听节点的原生事件
  if (modifiers.native) {
    delete modifiers.native
    // 获取 原生事件
    events = el.nativeEvents || (el.nativeEvents = {})
  } else {
    // 获取 自定义事件
    events = el.events || (el.events = {})
  }

  // 产生新的处理器 
  const newHandler: any = rangeSetItem({ value: value.trim(), dynamic }, range)
  if (modifiers !== emptyObject) {
    newHandler.modifiers = modifiers
  }

  // 获取name事件的 处理器
  const handlers = events[name]
  /* istanbul ignore if */
  // 数组
  if (Array.isArray(handlers)) {
    // 数组的前插 或者 后插
    important ? handlers.unshift(newHandler) : handlers.push(newHandler)
  } else if (handlers) {
    // 重要就把新处理器放数组前面
    events[name] = important ? [newHandler, handlers] : [handlers, newHandler]
  } else {
    // 只有一个新处理器
    events[name] = newHandler
  }
  // 标记el为非纯元素
  el.plain = false
}

// 获取el的name属性
export function getRawBindingAttr (
  el: ASTElement,
  name: string
) {
  // 在el的rawAttrsMap中查找
  return el.rawAttrsMap[':' + name] ||
    el.rawAttrsMap['v-bind:' + name] ||
    el.rawAttrsMap[name]
}
// 获取el的名为name的属性值（可能是动态绑定值, 也可能是静态属性值）
// 动态值 v-bind:一个变量  :一个变量
export function getBindingAttr (
  el: ASTElement,
  name: string,
  getStatic?: boolean
): ?string {
  const dynamicValue =
    getAndRemoveAttr(el, ':' + name) ||
    getAndRemoveAttr(el, 'v-bind:' + name)
  if (dynamicValue != null) {
    // 动态值调用过滤器filter解析 (过滤器可以用在两个地方, {{插值}} 和 v-bind表达式中)
    return parseFilters(dynamicValue)
  } else if (getStatic !== false) {
    // 获取静态值
    const staticValue = getAndRemoveAttr(el, name)
    if (staticValue != null) {
      return JSON.stringify(staticValue)
    }
  }
}

// note: this only removes the attr from the Array (attrsList) so that it
// doesn't get processed by processAttrs.
// By default it does NOT remove it from the map (attrsMap) because the map is
// needed during codegen.

// 只从el的attrsList数组中删除名字为name的属性, 默认attrsMap对象中保留以备codegen需要
export function getAndRemoveAttr (
  el: ASTElement,
  name: string,
  removeFromMap?: boolean
): ?string {
  let val
  // 如果属性值非null
  if ((val = el.attrsMap[name]) != null) {
    const list = el.attrsList
    // 遍历attrsList 删除符合条件的属性
    for (let i = 0, l = list.length; i < l; i++) {
      if (list[i].name === name) {
        list.splice(i, 1)
        break
      }
    }
  }
  // 在attrsMap中删除该属性
  if (removeFromMap) {
    delete el.attrsMap[name]
  }
  // 返回属性值
  return val
}

// 根据正则获取属性, 并从attrsList中删除该属性
export function getAndRemoveAttrByRegex (
  el: ASTElement,
  name: RegExp
) {
  // 获取el的属性列表
  const list = el.attrsList
  // 遍历所有属性, 在属性列表中删除满足正则的属性,并将此属性作为函数返回值
  for (let i = 0, l = list.length; i < l; i++) {
    const attr = list[i]
    // 正则测试
    if (name.test(attr.name)) {
      // 删除属性attr
      list.splice(i, 1)
      // 返回删除的属性 attr
      return attr
    }
  }
}

// 为item设置范围, 包括开始和结束
function rangeSetItem (
  item: any,
  range?: { start?: number, end?: number }
) {
  if (range) {
    if (range.start != null) {
      // 设置开始
      item.start = range.start
    }
    if (range.end != null) {
      // 设置结束
      item.end = range.end
    }
  }
  return item
}
