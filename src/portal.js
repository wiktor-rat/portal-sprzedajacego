import './styles.css'
import { configError, getOwnerPortal } from './supabase.js'
import { h, mount } from './ui.js'
import { topbar } from './brand.js'

// Pełny portal właściciela powstaje w kroku 5. Na razie: odczyt tokenu z adresu
// i pobranie nagłówka oferty przez get_owner_portal.

const app = document.querySelector('#app')
const token = decodeURIComponent(location.pathname.replace(/^\/o\//, '').split('/')[0] || '')
// Podgląd z panelu agenta (?podglad=1) nie jest liczony jako otwarcie przez właściciela.
const track = new URLSearchParams(location.search).get('podglad') !== '1'

function page(...children) {
  mount(app, topbar(), h('main', { class: 'page' }, ...children))
}

function message(title, text) {
  page(h('section', { class: 'card' }, h('h1', {}, title), h('p', { class: 'muted' }, text)))
}

async function start() {
  if (configError) return message('Portal chwilowo niedostępny', 'Spróbuj ponownie za chwilę albo skontaktuj się ze swoim agentem.')

  const inactive = () =>
    message(
      'Link jest nieaktywny',
      'Ten link do raportu jest nieprawidłowy albo wygasł. Poproś swojego agenta o aktualny link.',
    )
  if (token.length < 32) return inactive()

  page(h('p', { class: 'status', 'data-state': 'pending' }, 'Wczytuję raport…'))

  let data
  try {
    data = await getOwnerPortal(token, { track })
  } catch {
    return message('Nie udało się wczytać raportu', 'Spróbuj odświeżyć stronę za chwilę.')
  }
  if (!data) return inactive()

  const { listing, office, agent } = data
  document.title = `${listing.title} · Portal Sprzedającego`
  page(
    h(
      'div',
      {},
      h('p', { class: 'eyebrow' }, office?.name ?? ''),
      h('h1', {}, listing.title),
      listing.address ? h('p', { class: 'muted' }, listing.address) : null,
    ),
    h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Raport w przygotowaniu'),
      h('p', { class: 'muted' }, 'Wkrótce zobaczysz tu działania, prezentacje i statystyki Twojej oferty.'),
      agent?.full_name ? h('p', {}, `Twój agent: ${agent.full_name}${agent.phone ? `, tel. ${agent.phone}` : ''}`) : null,
    ),
  )
}

start()
