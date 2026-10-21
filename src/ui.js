// Proste budowanie elementów DOM bez frameworka. Tekst zawsze jako textContent (bez innerHTML),
// żeby dane wpisane przez użytkownika nie mogły wstrzyknąć kodu.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue
    if (name.startsWith('on')) el.addEventListener(name.slice(2).toLowerCase(), value)
    else el.setAttribute(name, value === true ? '' : value)
  }
  el.append(...children.flat().filter((c) => c != null && c !== false))
  return el
}

export function mount(root, ...children) {
  root.replaceChildren(...children)
}
