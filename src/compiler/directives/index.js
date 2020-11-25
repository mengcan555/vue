/* @flow */

import on from './on'
import bind from './bind'
// 不执行任何操作 空函数
import { noop } from 'shared/util'

export default {
  on,
  bind,
  cloak: noop // cloak 遮盖物
}
