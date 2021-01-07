/* @flow */

// 处理v-bind和v-on中 动态参数的动态键值的 帮助函数
// helper to process dynamic keys for dynamic arguments in v-bind and v-on.
// For example, the following template:
//
// <div id="app" :[key]="value">
//
// compiles to the following:
//
// _c('div', { attrs: bindDynamicKeys({ "id": "app" }, [key, value]) })

// vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)

import { warn } from 'core/util/debug'

// 
export function bindDynamicKeys (baseObj: Object, values: Array<any>): Object {
  // [key1,value1,key2,value2] 每次循环 i+2
  for (let i = 0; i < values.length; i += 2) {
    const key = values[i]
    if (typeof key === 'string' && key) {
      baseObj[values[i]] = values[i + 1] // value[i]是key value[1]为value
    } else if (process.env.NODE_ENV !== 'production' && key !== '' && key !== null) { // 非空字符串 && 非null
      // null is a special value for explicitly removing a binding
      // null是一个特殊的值 用于明确地删除一个绑定
      warn(
        `Invalid value for dynamic directive argument (expected string or null): ${key}`,
        this
      )
    }
  }
  // 返回最后的对象
  return baseObj
}

// helper to dynamically append modifier runtime markers to event names.
// ensure only append when value is already string, otherwise it will be cast
// to string and cause the type check to miss.
export function prependModifier (value: any, symbol: string): any {
  return typeof value === 'string' ? symbol + value : value
}
