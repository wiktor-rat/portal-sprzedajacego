import './styles.css'
import { checkDatabase, configError } from './supabase.js'
import { h, mount } from './ui.js'
import { topbar } from './brand.js'

const app = document.querySelector('#app')

function statusRow(state, text) {
  return h('p', { class: 'status', 'data-state': state }, text)
}

function render(connection) {
  mount(
    app,
    topbar(),
    h(
      'main',
      { class: 'page' },
      h('div', {}, h('p', { class: 'eyebrow' }, 'Panel agenta'), h('h1', {}, 'Portal Sprzedającego')),
      h('p', { class: 'muted' }, 'Raport dla właściciela nieruchomości: co dzieje się z jego ofertą, w jednym linku.'),
      h('section', { class: 'card', 'aria-live': 'polite' }, h('h2', {}, 'Stan aplikacji'), connection),
      h(
        'section',
        { class: 'notice' },
        h('p', {}, 'Wersja startowa. Logowanie i rejestracja agenta pojawią się w kolejnym kroku.'),
      ),
    ),
  )
}

async function start() {
  if (configError) {
    render(statusRow('error', configError))
    return
  }
  render(statusRow('pending', 'Sprawdzam połączenie z bazą…'))
  const result = await checkDatabase()
  render(
    result.ok
      ? statusRow('ok', 'Połączenie z Supabase działa, schemat bazy jest zainstalowany.')
      : statusRow('error', result.message),
  )
}

start()
