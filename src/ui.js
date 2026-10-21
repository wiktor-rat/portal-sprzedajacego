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

// Pole formularza: input (domyślnie), select (attrs.options = [[wartość, etykieta], ...]) lub textarea.
export function field(label, { as = 'input', options, value, hint, ...attrs }) {
  const id = `f-${attrs.name}`
  let control
  if (as === 'select') {
    control = h('select', { id, ...attrs }, options.map(([v, text]) => h('option', { value: v, selected: v === value }, text)))
  } else if (as === 'textarea') {
    control = h('textarea', { id, rows: 3, ...attrs }, value ?? '')
  } else {
    control = h('input', { id, value, ...attrs })
  }
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'hint' }, hint) : null)
}

// Wspólna obsługa formularza: blokada przycisku na czas wysyłki i komunikat błędu.
// onSubmit(dane, say) — say(rodzaj, tekst) pokazuje komunikat; wyjątek = komunikat z errorText(błąd).
export function form({ submitLabel, fields, onSubmit, errorText, extraActions = [] }) {
  const msg = h('p', { class: 'feedback', role: 'status', 'aria-live': 'polite' })
  const say = (kind, text) => {
    msg.dataset.kind = kind
    msg.textContent = text
  }
  const button = h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel)
  const el = h('form', { class: 'form' }, ...fields, msg, h('div', { class: 'form-actions' }, button, ...extraActions))
  el.addEventListener('submit', async (event) => {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(el))
    button.disabled = true
    say('', '')
    try {
      await onSubmit(data, say)
    } catch (error) {
      // Błędy walidacji (userMessage) to nie awarie — nie zaśmiecamy nimi konsoli.
      if (!error?.userMessage) console.error(error)
      say('error', errorText(error))
    } finally {
      button.disabled = false
    }
  })
  return el
}
