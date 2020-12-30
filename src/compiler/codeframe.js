/* @flow */

const range = 2

export function generateCodeFrame (
  source: string,
  start: number = 0,
  end: number = source.length
): string {
  // 把source源代码已 回车\r 或者 回车加换行 \r\n 切割成数组
  const lines = source.split(/\r?\n/) // ? 表示前面的 \r可有可无
  let count = 0
  const res = []
  // 循环每一行
  for (let i = 0; i < lines.length; i++) {
    count += lines[i].length + 1
    if (count >= start) {
      for (let j = i - range; j <= i + range || end > count; j++) {
        if (j < 0 || j >= lines.length) continue
        res.push(`${j + 1}${repeat(` `, 3 - String(j + 1).length)}|  ${lines[j]}`)
        const lineLength = lines[j].length
        if (j === i) {
          // push underline
          const pad = start - (count - lineLength) + 1
          const length = end > count ? lineLength - pad : end - start
          res.push(`   |  ` + repeat(` `, pad) + repeat(`^`, length))
        } else if (j > i) {
          if (end > count) {
            const length = Math.min(end - count, lineLength)
            res.push(`   |  ` + repeat(`^`, length))
          }
          count += lineLength + 1
        }
      }
      break
    }
  }
  return res.join('\n')
}

// 
function repeat (str, n) {
  let result = ''
  if (n > 0) {
    // 一直循环 直至 n <= 0
    while (true) { // eslint-disable-line
      // 当n为奇数 末位是1   00001 & xxxxx1(n的最低位必须是1, 才可以 & 后 >0) 
      if (n & 1) result += str
      // >>> 零填充右移位 通过从左推入零来向右位移，并使最右边的位脱落
      n >>>= 1
      // n <= 0 时跳出循环
      if (n <= 0) break
      str += str
    }
  }
  // 返回结果 result
  return result
}
