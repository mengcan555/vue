/* @flow */

import { warn, extend, isPlainObject } from 'core/util/index'

// target._g = bindObjectListeners
// 为对象data绑定监听器
export function bindObjectListeners (data: any, value: any): VNodeData {
  if (value) {
    // 如果value不是一个纯对象类型, 字符串返回true
    if (!isPlainObject(value)) {
      // 无参数的v-on需要一个对象值, 比如 v-on:click（有参数click） v-on="{ mousedown: doThis, mouseup: doThat }"（无参数）
      process.env.NODE_ENV !== 'production' && warn(
        'v-on without argument expects an Object value',
        this
      )
    } else {
      // data.on非空 将data.on混入一个空对象, 最后将混入后的对象赋值给on
      // data.on为空 将一个空对象赋值给on
      const on = data.on = data.on ? extend({}, data.on) : {}
      // 遍历纯对象value的所有属性
      for (const key in value) {
        // data.on[key]
        const existing = on[key]
        // value[key]
        const ours = value[key]
        // 如果已经有相同key的监听, 合并data.on[key]和value[key] 形成双监听, 否则使用value[key]
        on[key] = existing ? [].concat(existing, ours) : ours
      }
    }
  }
  // 返回处理完侦听之后的data
  return data
}
