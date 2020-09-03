/* @flow */

let decoder

export default {
  decode (html: string): string {
    decoder = decoder || document.createElement('div')
    decoder.innerHTML = html
    // innerText textContent innerHTML 区别
    return decoder.textContent
  }
}
