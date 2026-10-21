import './styles.css'
import { configError, supabase } from './supabase.js'
import { h, mount } from './ui.js'
import { topbar } from './brand.js'
import { loginView, newPasswordView, registerView, resetView } from './auth.js'

const app = document.querySelector('#app')
const RECOVERY_PARAM = 'nowe-haslo'

let authScreen = 'login'
let recovering = new URLSearchParams(location.search).has(RECOVERY_PARAM)

function page(header, ...children) {
  mount(app, header, h('main', { class: 'page' }, ...children))
}

function showAuth(screen = authScreen) {
  authScreen = screen
  const views = { login: loginView, register: registerView, reset: resetView }
  page(topbar(), views[screen](showAuth))
  app.querySelector('input')?.focus()
}

function finishRecovery() {
  recovering = false
  history.replaceState(null, '', '/')
  render()
}

async function signOut() {
  await supabase.auth.signOut()
}

async function showPanel(session) {
  const logout = h('button', { type: 'button', class: 'btn btn-ghost', onClick: signOut }, 'Wyloguj')
  page(topbar('Portal Sprzedającego', logout), h('p', { class: 'status', 'data-state': 'pending' }, 'Wczytuję…'))

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('full_name, role, offices(name)')
    .eq('id', session.user.id)
    .single()

  if (error) {
    page(
      topbar('Portal Sprzedającego', logout),
      h('section', { class: 'card' }, h('h1', {}, 'Nie udało się wczytać konta'), h('p', { class: 'muted' }, 'Odśwież stronę. Jeśli problem się powtarza, wyloguj się i zaloguj ponownie.')),
    )
    return
  }

  const firstName = profile.full_name.split(' ')[0]
  page(
    topbar(profile.offices?.name || 'Portal Sprzedającego', logout),
    h(
      'div',
      {},
      h('p', { class: 'eyebrow' }, profile.role === 'owner' ? 'Właściciel biura' : 'Agent'),
      h('h1', {}, firstName ? `Dzień dobry, ${firstName}` : 'Dzień dobry'),
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Twoje oferty'),
      h('p', { class: 'muted' }, 'Lista ofert i dodawanie nowych pojawią się w kolejnym kroku.'),
    ),
    h('p', { class: 'muted small' }, `Zalogowano jako ${session.user.email}`),
  )
}

let currentSession = null

function render() {
  if (recovering && currentSession) return page(topbar(), newPasswordView(finishRecovery))
  if (currentSession) return showPanel(currentSession)
  showAuth()
}

function start() {
  if (configError) {
    page(topbar(), h('section', { class: 'card' }, h('h1', {}, 'Brak konfiguracji'), h('p', { class: 'status', 'data-state': 'error' }, configError)))
    return
  }

  supabase.auth.onAuthStateChange((event, session) => {
    // Odświeżenie tokenu nie zmienia widoku, nie przerysowujemy formularzy.
    if (event === 'TOKEN_REFRESHED') return
    if (event === 'PASSWORD_RECOVERY') recovering = true
    const changed = (session?.user.id ?? null) !== (currentSession?.user.id ?? null)
    currentSession = session
    if (event === 'INITIAL_SESSION' || event === 'PASSWORD_RECOVERY' || changed) {
      // Zapytania do Supabase poza callbackiem (zalecenie supabase-js).
      setTimeout(render, 0)
    }
  })
}

start()
