import './styles.css'
import { configError, supabase } from './supabase.js'
import { h, mount } from './ui.js'
import { topbar } from './brand.js'
import { loginView, newPasswordView, registerView, resetView } from './auth.js'
import { listingFormView, listingsListView } from './listings.js'
import { listingDetailView } from './listing-detail.js'

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
  profileCache = null
  await supabase.auth.signOut()
  history.replaceState(null, '', '/')
}

// Profil (imię, rola, biuro) wczytujemy raz na sesję, nie przy każdej zmianie widoku.
let profileCache = null

async function loadProfile(session) {
  if (profileCache?.userId === session.user.id) return profileCache.profile
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, role, offices(name)')
    .eq('id', session.user.id)
    .single()
  if (error) throw error
  profileCache = { userId: session.user.id, profile: data }
  return data
}

// Widoki panelu (adres po #): #/ lista ofert, #/oferty/nowa, #/oferty/<id>, #/oferty/<id>/edycja
function panelRoute() {
  const path = location.hash.replace(/^#/, '') || '/'
  if (path === '/oferty/nowa') return () => listingFormView(null)
  const match = path.match(/^\/oferty\/([0-9a-f-]{36})(\/edycja)?$/)
  if (match) return match[2] ? () => listingFormView(match[1]) : () => listingDetailView(match[1])
  return null
}

let renderToken = 0

async function showPanel(session) {
  const token = ++renderToken
  const logout = h('button', { type: 'button', class: 'btn btn-ghost', onClick: signOut }, 'Wyloguj')

  let profile
  try {
    profile = await loadProfile(session)
  } catch (error) {
    console.error(error)
    page(
      topbar('Portal Sprzedającego', logout),
      h('section', { class: 'card' }, h('h1', {}, 'Nie udało się wczytać konta'), h('p', { class: 'muted' }, 'Odśwież stronę. Jeśli problem się powtarza, wyloguj się i zaloguj ponownie.')),
    )
    return
  }

  const header = topbar(profile.offices?.name || 'Portal Sprzedającego', logout)
  const route = panelRoute()
  let content
  if (route) {
    content = await route()
  } else {
    const firstName = profile.full_name.split(' ')[0]
    content = [
      h('div', {}, h('p', { class: 'eyebrow' }, profile.role === 'owner' ? 'Właściciel biura' : 'Agent'), h('h1', {}, firstName ? `Dzień dobry, ${firstName}` : 'Dzień dobry')),
      ...(await listingsListView()),
      h('p', { class: 'muted small' }, `Zalogowano jako ${session.user.email}`),
    ]
  }
  // Użytkownik mógł w międzyczasie przejść gdzie indziej — pokazujemy tylko najnowszy widok.
  if (token !== renderToken) return
  page(header, ...content)
  window.scrollTo(0, 0)
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

  window.addEventListener('hashchange', () => {
    if (currentSession && !recovering) render()
  })
}

start()
