/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

// 创建 编译器的创建器
export function createCompilerCreator (baseCompile: Function): Function {
  // 返回一个创建编译器的函数
  return function createCompiler (baseOptions: CompilerOptions) {
    // 编译器函数
    function compile (
      template: string,
      options?: CompilerOptions
    ): CompiledResult {
      // 创建一个新对象finalOptions, 它的原型对象__proto__是baseOptions, 继承它的属性
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      // 追加 提示或者错误
      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg) 
      }

      if (options) {
        // 非线上环境 且存在 outputSourceRange 重新定义warn函数
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // merge custom modules
        // 合并自定义模块
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives
        // 合并自定义指令
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options
        // 将options里的其他属性 拷贝到 finalOptions
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      // 为finalOptions 赋值警告函数warn
      finalOptions.warn = warn
      // 编译  编译结果包括: 抽象语法树、渲染函数、静态渲染函数数组
      const compiled = baseCompile(template.trim(), finalOptions)
      if (process.env.NODE_ENV !== 'production') {
        // 检测编译结果中抽象语法树AST中的错误
        detectErrors(compiled.ast, warn)
      }
      // 为编译结果加上 errors 和 tips
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      // 调用编译器compile进行编译, 并将编译结果生成render渲染函数 和 静态渲染函数数组 staticRenderFns
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
