/* @flow */

import { warn } from 'core/util/index'

// 为元素el的无参指令v-on 绑定侦听器
export default function on (el: ASTElement, dir: ASTDirective) {
  // 非生产环境 && 且指令有装饰器
  if (process.env.NODE_ENV !== 'production' && dir.modifiers) {
    //不带参数的v-on, 不支持修饰符, 如下 v2.4.0 新增的对象语法 <button v-on="{ mousedown: doThis, mouseup: doThat }"></button>
    // 带参数的v-on是: <button v-on:click.once="doThis"></button>  click是参数 once是装饰器
    warn(`v-on without argument does not support modifiers.`)
  }
  // target._g = bindObjectListeners
  // 为codec绑定监听
  el.wrapListeners = (code: string) => `_g(${code},${dir.value})`
}
