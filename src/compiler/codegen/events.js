/* @flow */

const fnExpRE = /^([\w$_]+|\([^)]*?\))\s*=>|^function(?:\s+[\w$]+)?\s*\(/
const fnInvokeRE = /\([^)]*?\);*$/
const simplePathRE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*|\['[^']*?']|\["[^"]*?"]|\[\d+]|\[[A-Za-z_$][\w$]*])*$/

// KeyboardEvent.keyCode aliases
// 键盘事件的键码 别名
const keyCodes: { [key: string]: number | Array<number> } = {
  esc: 27,
  tab: 9,
  enter: 13,
  space: 32,
  up: 38,
  left: 37,
  right: 39,
  down: 40,
  'delete': [8, 46] // 8是回退键 46是删除键
}

// KeyboardEvent.key aliases
// 键盘事件的键 别名
const keyNames: { [key: string]: string | Array<string> } = {
  // #7880: IE11 and Edge use `Esc` for Escape key name.
  // IE11 和 Edge 使用'Esc'作为Escape键的名字
  esc: ['Esc', 'Escape'],
  tab: 'Tab',
  enter: 'Enter',
  // #9112: IE11 uses `Spacebar` for Space key name.
  space: [' ', 'Spacebar'],
  // #7806: IE11 uses key names without `Arrow` prefix for arrow keys.
  up: ['Up', 'ArrowUp'],
  left: ['Left', 'ArrowLeft'],
  right: ['Right', 'ArrowRight'],
  down: ['Down', 'ArrowDown'],
  // #9112: IE11 uses `Del` for Delete key name.
  'delete': ['Backspace', 'Delete', 'Del']
}

// #4868: modifiers that prevent the execution of the listener
// need to explicitly return null so that we can determine whether to remove
// the listener for .once

// 阻止侦听器执行的修饰符需要显式返回null, 以便我们可以确定是否删除.once的侦听器

// 生成警卫 if() return null
const genGuard = condition => `if(${condition})return null;`

// 修饰符对应的code代码
const modifierCode: { [key: string]: string } = {
  stop: '$event.stopPropagation();',
  prevent: '$event.preventDefault();',
  self: genGuard(`$event.target !== $event.currentTarget`),
  ctrl: genGuard(`!$event.ctrlKey`),
  shift: genGuard(`!$event.shiftKey`),
  alt: genGuard(`!$event.altKey`),
  meta: genGuard(`!$event.metaKey`),
  left: genGuard(`'button' in $event && $event.button !== 0`),
  middle: genGuard(`'button' in $event && $event.button !== 1`),
  right: genGuard(`'button' in $event && $event.button !== 2`)
}

// 为所有事件生成处理代码
export function genHandlers (
  events: ASTElementHandlers,
  isNative: boolean
): string {
  const prefix = isNative ? 'nativeOn:' : 'on:'
  let staticHandlers = ``
  let dynamicHandlers = ``
  // 循环所有事件 events
  for (const name in events) {
    // 为event生成处理代码
    const handlerCode = genHandler(events[name])
    // 动态事件: <button v-on:[event]="doThis"></button>
    // 缩写:   <button @[event]="doThis"></button>
    if (events[name] && events[name].dynamic) {
      // 动态事件  以逗号分隔 名字和代码
      dynamicHandlers += `${name},${handlerCode},`
    } else {
      // 静态事件 以冒号分隔 名字和代码
      staticHandlers += `"${name}":${handlerCode},`
    }
  }
  // {[]}
  staticHandlers = `{${staticHandlers.slice(0, -1)}}` // slice(0,-1)从头开始 到 末尾第二个
  if (dynamicHandlers) {
    // 绑定动态的key
    // target._d = bindDynamicKeys
    return prefix + `_d(${staticHandlers},[${dynamicHandlers.slice(0, -1)}])`
  } else {
    return prefix + staticHandlers
  }
}

// Generate handler code with binding params on Weex
/* istanbul ignore next */
// 产生Weex上 带参数的处理代码
function genWeexHandler (params: Array<any>, handlerCode: string) {
  let innerHandlerCode = handlerCode
  const exps = params.filter(exp => simplePathRE.test(exp) && exp !== '$event')
  const bindings = exps.map(exp => ({ '@binding': exp }))
  const args = exps.map((exp, i) => {
    const key = `$_${i + 1}`
    innerHandlerCode = innerHandlerCode.replace(exp, key)
    return key
  })
  args.push('$event')
  return '{\n' +
    `handler:function(${args.join(',')}){${innerHandlerCode}},\n` +
    `params:${JSON.stringify(bindings)}\n` +
    '}'
}
// 为一个事件生成处理代码
function genHandler (handler: ASTElementHandler | Array<ASTElementHandler>): string {
  // 生成一个空函数
  if (!handler) {
    return 'function(){}'
  }
  // 如果一种事件有多个处理函数, 循环逐个生成处理代码 递归调用genHandler
  if (Array.isArray(handler)) {
    return `[${handler.map(handler => genHandler(handler)).join(',')}]`
  }

  // 方法路径
  const isMethodPath = simplePathRE.test(handler.value)
  // 函数表达式
  const isFunctionExpression = fnExpRE.test(handler.value)
  // 函数调用
  const isFunctionInvocation = simplePathRE.test(handler.value.replace(fnInvokeRE, ''))

  // 没有修饰符
  if (!handler.modifiers) {
    if (isMethodPath || isFunctionExpression) {
      return handler.value
    }
    /* istanbul ignore if */
    // __WEEX__ 内置变量
    if (__WEEX__ && handler.params) {
      // 为Weex生成处理代码
      return genWeexHandler(handler.params, handler.value)
    }
    return `function($event){${
      isFunctionInvocation ? `return ${handler.value}` : handler.value
    }}` // inline statement
  } else {
    // 有修饰符
    let code = ''
    let genModifierCode = ''
    const keys = []
    for (const key in handler.modifiers) {
      if (modifierCode[key]) {
        genModifierCode += modifierCode[key]
        // left/right
        if (keyCodes[key]) {
          keys.push(key)
        }
      // .exact 修饰符允许你控制由精确的 系统修饰符（.ctrl .alt .shift .meta） 组合触发的事件
      } else if (key === 'exact') {
        const modifiers: ASTModifiers = (handler.modifiers: any)
        // mac系统上 meta对应command键
        genModifierCode += genGuard(
          ['ctrl', 'shift', 'alt', 'meta']
            .filter(keyModifier => !modifiers[keyModifier])
            .map(keyModifier => `$event.${keyModifier}Key`)
            .join('||')
        )
      } else {
        keys.push(key)
      }
    }
    // 生成key过滤器代码
    if (keys.length) {
      code += genKeyFilter(keys)
    }
    // Make sure modifiers like prevent and stop get executed after key filtering
    // 保证在key过滤后, 类似于prevent stop这样的修饰符能够得到执行
    if (genModifierCode) {
      code += genModifierCode
    }
    // 处理器的代码
    const handlerCode = isMethodPath
      ? `return ${handler.value}($event)`
      : isFunctionExpression
        ? `return (${handler.value})($event)`
        : isFunctionInvocation
          ? `return ${handler.value}`
          : handler.value
    /* istanbul ignore if */
    if (__WEEX__ && handler.params) {
      // 生成Weex处理代码
      return genWeexHandler(handler.params, code + handlerCode)
    }
    return `function($event){${code}${handlerCode}}`
  }
}

// 生成key过滤器
function genKeyFilter (keys: Array<string>): string {
  return (
    // make sure the key filters only apply to KeyboardEvents
    // #9441: can't use 'keyCode' in $event because Chrome autofill fires fake
    // key events that do not have keyCode property...
    // 保证key filters 只应用到键盘事件上
    // 无法在$event中使用“keyCode”, 因为 谷歌自动填充 会触发不具有keyCode属性的伪key事件
    `if(!$event.type.indexOf('key')&&` +
    `${keys.map(genFilterCode).join('&&')})return null;`
  )
}

// 生成过滤代码
function genFilterCode (key: string): string {
  const keyVal = parseInt(key, 10)
  if (keyVal) {
    return `$event.keyCode!==${keyVal}`
  }
  const keyCode = keyCodes[key]
  const keyName = keyNames[key]
  // 检查keycodes
  // target._k = checkKeyCodes
  return (
    `_k($event.keyCode,` +
    `${JSON.stringify(key)},` +
    `${JSON.stringify(keyCode)},` +
    `$event.key,` +
    `${JSON.stringify(keyName)}` +
    `)`
  )
}
