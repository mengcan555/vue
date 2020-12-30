/* @flow */

import { noop, extend } from 'shared/util'
import { warn as baseWarn, tip } from 'core/util/debug'
import { generateCodeFrame } from './codeframe'

type CompiledFunctionResult = {
  render: Function;
  staticRenderFns: Array<Function>;
};

// 通过 new Function(代码) 创建函数
function createFunction (code, errors) {
  try {
    return new Function(code)
  } catch (err) {
    // 产生错误
    errors.push({ err, code })
    return noop
  }
}

// 参数是 编译函数 compile
export function createCompileToFunctionFn (compile: Function): Function {
  // 创建一个空的缓存对象
  const cache = Object.create(null)

  // 返回一个函数
  return function compileToFunctions (
    template: string,
    options?: CompilerOptions,
    vm?: Component
  ): CompiledFunctionResult {

    options = extend({}, options)
    const warn = options.warn || baseWarn
    delete options.warn

    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production') {
      // detect possible CSP restriction
      try {
        // 尝试 将文本转化为可执行的脚本
        new Function('return 1')
      } catch (e) {
        // CSP content security policy 内容安全策略
        // 通过csp我们可以制定一系列的策略,从而只允许我们页面向我们允许的域名发起跨域请求.
        if (e.toString().match(/unsafe-eval|CSP/)) {
          // 似乎您正在内容安全策略禁止不安全评估的环境中使用独立版本的Vue.js
          // 模板编译器无法在此环境中工作。考虑放宽策略以允许不安全的评估或将模板预编译为render函数。
          warn(
            'It seems you are using the standalone build of Vue.js in an ' +
            'environment with Content Security Policy that prohibits unsafe-eval. ' +
            'The template compiler cannot work in this environment. Consider ' +
            'relaxing the policy to allow unsafe-eval or pre-compiling your ' +
            'templates into render functions.'
          )
        }
      }
    }

    // check cache
    // 检查缓存
    const key = options.delimiters
      ? String(options.delimiters) + template
      : template
    if (cache[key]) {
      // 直接返回缓存
      return cache[key]
    }

    // compile
    // 编译
    const compiled = compile(template, options)

    // check compilation errors/tips
    // 检查编译 错误/提示
    if (process.env.NODE_ENV !== 'production') {
      // 编译结果有错误
      if (compiled.errors && compiled.errors.length) {
        // 输出代码范围
        if (options.outputSourceRange) {
          // 每一个错误给出一个警告
          compiled.errors.forEach(e => {
            warn(
              `Error compiling template:\n\n${e.msg}\n\n` +
              generateCodeFrame(template, e.start, e.end),
              vm
            )
          })
        } else {
          // 给出模板编译错误
          // 所有错误连接一起给出警告
          warn(
            `Error compiling template:\n\n${template}\n\n` +
            compiled.errors.map(e => `- ${e}`).join('\n') + '\n',
            vm
          )
        }
      }
      // 编译结果有提示
      if (compiled.tips && compiled.tips.length) {
        if (options.outputSourceRange) { // tip的数据结构不同
          compiled.tips.forEach(e => tip(e.msg, vm))
        } else {
          compiled.tips.forEach(msg => tip(msg, vm))
        }
      }
    }

    // turn code into functions
    // 将代码转化成函数
    const res = {}
    const fnGenErrors = []
    //  生成render函数  new Function(compiled.render, fnGenErrors)
    res.render = createFunction(compiled.render, fnGenErrors)
    // 生成静态渲染函数 数组
    res.staticRenderFns = compiled.staticRenderFns.map(code => { 
      return createFunction(code, fnGenErrors)
    })

    // check function generation errors.
    // this should only happen if there is a bug in the compiler itself.
    // mostly for codegen development use
    /* istanbul ignore if */
    // 检查函数生成错误
    // 只有在编译器本身存在错误时才会发生这种情况
    // 主要用于codegen开发使用
    if (process.env.NODE_ENV !== 'production') {
      // 编译没有错误, fnGenErrors非空 此时createFunction 发生了错误
      if ((!compiled.errors || !compiled.errors.length) && fnGenErrors.length) {
        // 生成render函数失败
        warn(
          `Failed to generate render function:\n\n` +
          fnGenErrors.map(({ err, code }) => `${err.toString()} in\n\n${code}\n`).join('\n'),
          vm
        )
      }
    }

    // 返回
    return (cache[key] = res)
  }
}
