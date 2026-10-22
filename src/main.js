import './styles.css'
import { configError, supabase } from './supabase.js'
import { h, mount } from './ui.js'
import { topbar } from './brand.js'
import { joinView, loginView, newPasswordView, registerView, resetView } from './auth.js'
import { listingFormView, listingsListView } from './listings.js'
import { listingDetailView } from './listing-detail.js'
import { settingsView } from './settings.js'
import { teamView } from './team.js'

const app = document.querySelector('#app')
const RECOVERY_PARAM = 'nowe-haslo'
const INVITE_PARAM = 'zaproszenie'

let authScreen = 'login'
let recovering = new URLSearchParams(location.search).has(RECOVERY_PARAM)
const inviteToken = new URLSearchParams(location.search).get(INVITE_PARAM)

function page(header, ...children) {
  mount(app, header, h('main', { class: 'page' }, ...children))
}

function showAuth(screen = authScreen) {
  authScreen = screen
  const views = { login: loginView, register: registerView, reset: resetView }
  page(topbar(), views[screen](showAuth))
  app.querySelector('input')?.focus()
}

async function showJoin() {
  page(topbar(), h('p', { class: 'status', 'data-state': 'pending' }, 'Sprawdzam zaproszenie…'))
  page(topbar(), await joinView(inviteToken, () => {
    history.replaceState(null, '', '/')
    showAuth('login')
  }))
  app.querySelector('input:not([readonly])')?.focus()
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

// Profil (imię, rola, biuro) wczytujemy raz na sesję; po zmianie danych w ustawieniach — od nowa.
let profileCache = null

function invalidateProfile() {
  profileCache = null
}

async function loadProfile(session) {
  if (profileCache?.userId === session.user.id) return profileCache.profile
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, email, role, active, office_id, offices(name)')
    .eq('id', session.user.id)
    .single()
  if (error) throw error
  if (!data) throw new Error('Brak profilu użytkownika')
  profileCache = { userId: session.user.id, profile: data }
  return data
}

// Widoki panelu (adres po #):
// #/ oferty (właściciel: #/?agent=<id> — oferty jednego agenta), #/oferty/nowa, #/oferty/<id>, #/oferty/<id>/edycja,
// #/zespol (tylko właściciel biura), #/ustawienia
function parseHash() {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?')
  return { path: path || '/', params: new URLSearchParams(query) }
}

function panelRoute(ctx) {
  const { path, params } = parseHash()
  if (path === '/zespol' && ctx.isOwner) return { section: 'team', view: () => teamView(ctx) }
  if (path === '/ustawienia') return { section: 'settings', view: () => settingsView(ctx) }
  if (path === '/oferty/nowa') return { section: 'offers', view: () => listingFormView(null, ctx) }
  const match = path.match(/^\/oferty\/([0-9a-f-]{36})(\/edycja)?$/)
  if (match) return { section: 'offers', view: match[2] ? () => listingFormView(match[1], ctx) : () => listingDetailView(match[1], ctx) }
  return { section: 'offers', view: () => listingsListView(ctx, params.get('agent')) }
}

function navigation(ctx, active) {
  const items = [
    ['offers', '#/', 'Oferty'],
    ctx.isOwner ? ['team', '#/zespol', 'Zespół'] : null,
    ['settings', '#/ustawienia', 'Ustawienia'],
  ].filter(Boolean)
  return h(
    'nav',
    { class: 'sidenav', 'aria-label': 'Menu' },
    items.map(([key, href, label]) => h('a', { href, class: `nav-item${key === active ? ' active' : ''}`, 'aria-current': key === active ? 'page' : null }, h('span', { class: `nav-icon icon-${key}`, 'aria-hidden': 'true' }), h('span', {}, label))),
  )
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

  if (!profile.active) {
    page(
      topbar(profile.offices?.name || 'Portal Sprzedającego', logout),
      h('section', { class: 'card' }, h('h1', {}, 'Konto jest nieaktywne'), h('p', { class: 'muted' }, 'Właściciel biura wyłączył dostęp do tego konta. Jeśli to pomyłka, skontaktuj się z właścicielem biura.')),
    )
    return
  }

  const ctx = {
    profile,
    userId: session.user.id,
    email: session.user.email,
    isOwner: profile.role === 'owner',
    invalidateProfile,
  }
  const route = panelRoute(ctx)
  const content = await route.view()

  // Użytkownik mógł w międzyczasie przejść gdzie indziej — pokazujemy tylko najnowszy widok.
  if (token !== renderToken) return
  mount(
    app,
    topbar(profile.offices?.name || 'Portal Sprzedającego', logout),
    h('div', { class: 'shell' }, navigation(ctx, route.section), h('main', { class: 'page' }, ...content)),
  )
  window.scrollTo(0, 0)
}

let currentSession = null

function render() {
  if (recovering && currentSession) return page(topbar(), newPasswordView(finishRecovery))
  if (currentSession) return showPanel(currentSession)
  if (inviteToken) return showJoin()
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
      // Po dołączeniu z zaproszenia usuwamy je z adresu, żeby odświeżenie nie pokazało go ponownie.
      if (session && inviteToken) history.replaceState(null, '', '/')
      // Zapytania do Supabase poza callbackiem (zalecenie supabase-js).
      setTimeout(render, 0)
    }
  })

  window.addEventListener('hashchange', () => {
    if (currentSession && !recovering) render()
  })
}

start()
