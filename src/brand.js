import { h } from './ui.js'

const SVG_NS = 'http://www.w3.org/2000/svg'

function brandMark() {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 32 32')
  svg.setAttribute('class', 'brand-mark')
  svg.setAttribute('aria-hidden', 'true')
  const rect = document.createElementNS(SVG_NS, 'rect')
  Object.entries({ width: 32, height: 32, rx: 8, fill: 'var(--accent)' }).forEach(([k, v]) => rect.setAttribute(k, v))
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', 'M8 16.5 16 9l8 7.5V24a1 1 0 0 1-1 1h-4.5v-5.5h-5V25H9a1 1 0 0 1-1-1z')
  path.setAttribute('fill', 'var(--brass)')
  svg.append(rect, path)
  return svg
}

export function topbar(label = 'Portal Sprzedającego', ...actions) {
  return h(
    'header',
    { class: 'topbar' },
    brandMark(),
    h('span', { class: 'brand' }, label),
    actions.length ? h('div', { class: 'topbar-actions' }, ...actions) : null,
  )
}
