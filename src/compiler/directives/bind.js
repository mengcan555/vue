/* @flow */
// 无参数的v-bind <div v-bind="{ 'id': someProp, 'other-attr': otherProp }"></div>

export default function bind (el: ASTElement, dir: ASTDirective) { // 元素el 指令dir
  // target._b = bindObjectProps  在codegen下的index.js用到
  el.wrapData = (code: string) => {
    // _b(data, tag, value, asProp, isSync)
    return `_b(${code},'${el.tag}',${dir.value},${
      // v-bind指令有prop修饰符 asProp为true
      dir.modifiers && dir.modifiers.prop ? 'true' : 'false'
    }${
      // v-bind指令有sync修饰符, isSync为true
      dir.modifiers && dir.modifiers.sync ? ',true' : ''
    })`
  }
}
