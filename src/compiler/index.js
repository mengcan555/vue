/* @flow */

import { parse } from './parser/index'
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.

// createCompilerCreator 允许使用可替换的 解析器/优化器/代码生成 来创建编译器
// 这里我们只是导出一个使用默认部分的默认编译器
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  // 将HTML字符串转换成抽象语法树 AST
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 优化抽象语法树 AST
    optimize(ast, options)
  }
  // 生成用于创建元素的code代码
  const code = generate(ast, options)

  // 编译器的 编译结果 包括: 抽象语法树、渲染函数、静态渲染函数数组
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
