/* @flow */

import config from 'core/config'

import {
  warn,
  isObject,
  toObject,
  isReservedAttribute,
  camelize,
  hyphenate
} from 'core/util/index'

/**
 * 将 v-bind={}合并到一个VNode虚拟节点的数据中的 运行时帮助程序
 * 例如: <div v-bind="{ 'id': someProp, 'other-attr': otherProp }"></div>
 * Runtime helper for merging v-bind="object" into a VNode's data.
 */
export function bindObjectProps (
  data: any,
  tag: string,
  value: any,
  asProp: boolean,
  isSync?: boolean
): VNodeData {
  if (value) {
    // 如果value不是对象 用typeof() === 'object' 判断
    if (!isObject(value)) {
      // 没有参数的v-bind 需要一个对象或者数组
      process.env.NODE_ENV !== 'production' && warn(
        'v-bind without argument expects an Object or Array value',
        this
      )
    } else {
      // 如果value是数组, 将其转化成对象
      if (Array.isArray(value)) {
        // 将一个对象数组中的多个对象 合并成一个对象
        value = toObject(value)
      }
      let hash
      // 遍历对象value的属性
      for (const key in value) {
        if (
          key === 'class' ||
          key === 'style' ||
          // 检查属性key是否是一个预留属性
          isReservedAttribute(key)
        ) {
          // 将hash指向为data
          hash = data
        } else {
          const type = data.attrs && data.attrs.type
          // 如果key要作为props hash赋值为data.domProps, 否则赋值为data.attrs
          hash = asProp || config.mustUseProp(tag, type, key)
            ? data.domProps || (data.domProps = {})
            : data.attrs || (data.attrs = {})
        }
        // 将一个用连字符-分隔的字符串 驼峰化 abc_de_fg => abcDeFg
        const camelizedKey = camelize(key)
        // 将一个驼峰式的字符串 转换成 用连字符-分隔的字符串 abcDeFg => abc_de_fg
        const hyphenatedKey = hyphenate(key)
        // hash中没有此key
        if (!(camelizedKey in hash) && !(hyphenatedKey in hash)) {
          // 为hash增加此key属性
          hash[key] = value[key]
          // 有.sync同步修饰符, 会扩展成一个更新父组件绑定值的 v-on 侦听器
          if (isSync) {
            // 获取data.on
            const on = data.on || (data.on = {})
            // 为更新key值 增加事件侦听
            on[`update:${key}`] = function ($event) {
              // 通过事件的值更新key的值  实现了双向绑定
              value[key] = $event
            }
          }
        }
      }
    }
  }
  // 将通过hash处理之后的data返回
  return data
}
