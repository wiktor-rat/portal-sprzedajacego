import './styles.css'
import './portal.css'
import { configError, getOwnerPortal } from './supabase.js'
import { h, mount } from './ui.js'
import { topbar } from './brand.js'
import { ACTION_LABELS, INTEREST_LABELS, PRICE_LABELS } from './domain.js'
import { addDays, daysUntil, number, plural, pricePLN, shortDate, todayISO, weekLabel } from './format.js'

// Portal właściciela: tylko odczyt, bez logowania. Dane wyłącznie z funkcji get_owner_portal,
// która zwraca pola przeznaczone dla właściciela (bez notatek wewnętrznych biura).

const app = document.querySelector('#app')
const token = decodeURIComponent(location.pathname.replace(/^\/o\//, '').split('/')[0] || '')
// Podgląd z panelu agenta (?podglad=1) nie jest liczony jako otwarcie przez właściciela.
const preview = new URLSearchParams(location.search).get('podglad') === '1'

const OWNER_STATUS = {
  active: 'W sprzedaży',
  reserved: 'Zarezerwowane',
  sold: 'Sprzedane',
  withdrawn: 'Wycofane z oferty',
}

const CHART_WEEKS = 12
const SVG_NS = 'http://www.w3.org/2000/svg'

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

function page(header, ...children) {
  mount(app, header, h('main', { class: 'page portal' }, ...children))
}

function message(title, text) {
  page(topbar(), h('section', { class: 'card' }, h('h1', {}, title), h('p', { class: 'muted' }, text)))
}

async function start() {
  if (configError) return message('Raport chwilowo niedostępny', 'Spróbuj ponownie za chwilę albo skontaktuj się ze swoim agentem.')

  const inactive = () =>
    message('Link jest nieaktywny', 'Ten link do raportu jest nieprawidłowy albo wygasł. Poproś swojego agenta o aktualny link.')
  if (token.length < 32) return inactive()

  page(topbar(), h('p', { class: 'status', 'data-state': 'pending' }, 'Wczytuję raport…'))

  let data
  try {
    data = await getOwnerPortal(token, { track: !preview })
  } catch (error) {
    console.error(error)
    return message('Nie udało się wczytać raportu', 'Spróbuj odświeżyć stronę za chwilę.')
  }
  if (!data) return inactive()

  render(data)
}

function render({ listing, office, agent, events, stats }) {
  document.title = `${listing.title} · raport dla właściciela`
  const presentations = events.filter((e) => e.kind === 'presentation')

  page(
    topbar(office?.name || 'Raport z Twojej oferty'),
    preview ? h('p', { class: 'preview-banner' }, 'Podgląd agenta. To otwarcie nie jest liczone jako wizyta właściciela.') : null,
    hero(listing),
    kpis(stats, presentations),
    h(
      'div',
      { class: 'portal-grid' },
      h('div', { class: 'portal-col' }, inquiriesChart(stats), campaign(stats), timeline(events)),
      h('div', { class: 'portal-col' }, agentCard(agent, listing), feedback(presentations)),
    ),
    h('p', { class: 'portal-foot' }, `Raport aktualizuje się na bieżąco, gdy agent dodaje nowe informacje.${office?.name ? ` Przygotowane przez: ${office.name}.` : ''}`),
  )
}

// ---------- Nagłówek ----------

function hero(listing) {
  const perM2 = listing.price && listing.area_m2 ? `${pricePLN.format(listing.price / listing.area_m2)}/m²` : null
  return h(
    'section',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-main' },
      h('p', { class: 'eyebrow' }, 'Raport z Twojej oferty'),
      h('h1', {}, listing.title),
      listing.address ? h('p', { class: 'muted' }, listing.address) : null,
      h('p', { class: `owner-status status-${listing.status}` }, h('i', {}), OWNER_STATUS[listing.status] ?? ''),
    ),
    h(
      'div',
      { class: 'hero-side' },
      listing.price != null ? h('p', { class: 'hero-price mono' }, pricePLN.format(listing.price)) : null,
      perM2 || listing.area_m2 != null
        ? h('p', { class: 'small muted' }, [listing.area_m2 != null ? `${number.format(listing.area_m2)} m²` : null, perM2].filter(Boolean).join(' · '))
        : null,
      exclusivity(listing),
    ),
  )
}

function exclusivity(listing) {
  const { exclusive_from: from, exclusive_to: to } = listing
  if (!from || !to) return null
  const total = daysUntil(to) - daysUntil(from) + 1
  const day = -daysUntil(from) + 1
  if (day < 1) return h('p', { class: 'small muted exclusivity' }, `Umowa na wyłączność od ${shortDate(from)}`)
  if (day > total) return h('p', { class: 'small muted exclusivity' }, `Umowa na wyłączność zakończona ${shortDate(to)}`)
  const left = total - day
  return h(
    'div',
    { class: 'exclusivity small muted' },
    h('p', {}, 'Umowa na wyłączność: dzień ', h('span', { class: 'mono' }, String(day)), ' z ', h('span', { class: 'mono' }, String(total))),
    h('div', { class: 'track', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': day }, h('span', { style: `width:${Math.round((day / total) * 100)}%` })),
    h('p', {}, `do końca: ${left} ${left === 1 ? 'dzień' : 'dni'}`),
  )
}

// ---------- Liczby ----------

function kpis(stats, presentations) {
  const latest = stats.at(-1)
  const weekNote = (value) => (latest ? `+${number.format(value)} w tyg. ${weekLabel(latest.period_start)}` : null)
  const lastWeekPresentations = presentations.filter((p) => p.date >= addDays(todayISO(), -6)).length

  const tiles = [
    ['Wyświetlenia ogłoszeń', sum(stats, 'views'), weekNote(latest?.views ?? 0)],
    ['Zapytania kupujących', sum(stats, 'inquiries_portal') + sum(stats, 'inquiries_campaign'), weekNote((latest?.inquiries_portal ?? 0) + (latest?.inquiries_campaign ?? 0))],
    ['Prezentacje', presentations.length, lastWeekPresentations ? `+${lastWeekPresentations} w ostatnich 7 dniach` : 'brak w ostatnich 7 dniach'],
    ['Oferty kupna', sum(stats, 'offers'), null],
  ]
  return h(
    'section',
    { class: 'kpis', 'aria-label': 'Najważniejsze liczby' },
    tiles.map(([label, value, note]) =>
      h('div', { class: 'kpi' }, h('span', { class: 'kpi-label' }, label), h('span', { class: 'kpi-value mono' }, number.format(value)), note ? h('span', { class: 'kpi-note' }, note) : null),
    ),
  )
}

// ---------- Wykres zapytań ----------

function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v)
  if (text != null) el.textContent = text
  return el
}

function niceMax(value) {
  if (value <= 4) return 4
  const step = value <= 10 ? 2 : value <= 25 ? 5 : value <= 50 ? 10 : 10 ** Math.floor(Math.log10(value))
  return Math.ceil(value / step) * step
}

function inquiriesChart(stats) {
  const weeks = stats.slice(-CHART_WEEKS)
  const head = h(
    'div',
    { class: 'panel-head' },
    h('div', {}, h('h2', {}, 'Zapytania od kupujących'), h('p', { class: 'small muted' }, 'Tygodniowo, z portali i z kampanii reklamowej')),
    h('div', { class: 'legend' }, h('span', {}, h('i', { class: 'swatch-portal' }), 'Portale'), h('span', {}, h('i', { class: 'swatch-campaign' }), 'Kampania')),
  )
  if (!weeks.length) return h('section', { class: 'card' }, head, h('p', { class: 'muted' }, 'Pierwsze dane pojawią się po tygodniu promocji.'))

  // Szerokość rysunku dopasowana do ekranu, żeby napisy miały czytelny rozmiar także na telefonie
  const W = Math.round(Math.min(620, Math.max(300, window.innerWidth - 66)))
  const H = 190, padL = 28, padR = 6, padT = 10, padB = 26
  const max = niceMax(Math.max(...weeks.map((w) => w.inquiries_portal + w.inquiries_campaign), 1))
  const bandW = (W - padL - padR) / weeks.length
  const barW = Math.min(bandW * 0.6, 44)
  const y = (v) => H - padB - (v / max) * (H - padB - padT)

  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': 'Wykres tygodniowych zapytań od kupujących: portale i kampania' })
  for (let t = 0; t <= max; t += max / 2) {
    chart.append(svg('line', { x1: padL, x2: W - padR, y1: y(t), y2: y(t), class: 'grid-line' }), svg('text', { x: padL - 6, y: y(t) + 3, 'text-anchor': 'end' }, number.format(t)))
  }
  const labelEvery = Math.ceil(weeks.length / 6)
  weeks.forEach((w, i) => {
    const x = padL + i * bandW + (bandW - barW) / 2
    const portal = w.inquiries_portal
    const total = portal + w.inquiries_campaign
    const title = `${weekLabel(w.period_start)}: ${portal} z portali, ${w.inquiries_campaign} z kampanii`
    if (portal) chart.append(svg('rect', { x, y: y(portal), width: barW, height: y(0) - y(portal), rx: 2, class: 'bar-portal' }, null))
    if (w.inquiries_campaign) chart.append(svg('rect', { x, y: y(total), width: barW, height: y(portal) - y(total), rx: 2, class: 'bar-campaign' }))
    // Niewidoczny obszar z opisem — podpowiedź po najechaniu / dotknięciu
    const hit = svg('rect', { x: padL + i * bandW, y: padT, width: bandW, height: H - padB - padT, fill: 'transparent' })
    hit.append(svg('title', {}, title))
    chart.append(hit)
    if (total) chart.append(svg('text', { x: x + barW / 2, y: y(total) - 4, 'text-anchor': 'middle', class: 'bar-value' }, String(total)))
    if (i % labelEvery === 0 || i === weeks.length - 1) chart.append(svg('text', { x: x + barW / 2, y: H - 8, 'text-anchor': 'middle' }, shortDate(w.period_start)))
  })

  return h('section', { class: 'card' }, head, h('div', { class: 'chart-box' }, chart))
}

// ---------- Kampania ----------

function campaign(stats) {
  const reach = sum(stats, 'campaign_reach')
  const clicks = sum(stats, 'campaign_clicks')
  const inquiries = sum(stats, 'inquiries_campaign')
  if (!reach && !clicks && !inquiries) return null
  const stat = (value, label) => h('div', {}, h('span', { class: 'mono' }, number.format(value)), h('small', {}, label))
  return h(
    'section',
    { class: 'card campaign' },
    h('p', { class: 'eyebrow' }, 'Promocja poza portalami'),
    h('h2', {}, 'Kampania reklamowa na Facebooku i Instagramie'),
    h('p', { class: 'small muted' }, 'Ogłoszenie pokazujemy osobom, które szukają nieruchomości w tej okolicy.'),
    h(
      'div',
      { class: 'campaign-stats' },
      stat(reach, plural(reach, 'osoba zobaczyła reklamę', 'osoby zobaczyły reklamę', 'osób zobaczyło reklamę')),
      stat(clicks, plural(clicks, 'kliknięcie w ofertę', 'kliknięcia w ofertę', 'kliknięć w ofertę')),
      stat(inquiries, plural(inquiries, 'zapytanie z kampanii', 'zapytania z kampanii', 'zapytań z kampanii')),
    ),
  )
}

// ---------- Oś czasu ----------

function timeline(events) {
  const head = h('div', { class: 'panel-head' }, h('div', {}, h('h2', {}, 'Co zrobiliśmy dla Twojej oferty'), h('p', { class: 'small muted' }, 'Wszystkie działania, od najnowszych')))
  if (!events.length) return h('section', { class: 'card' }, head, h('p', { class: 'muted' }, 'Pierwsze działania pojawią się tu wkrótce.'))
  return h(
    'section',
    { class: 'card' },
    head,
    h(
      'ol',
      { class: 'owner-timeline' },
      events.map((e) => {
        const isPresentation = e.kind === 'presentation'
        const detail = isPresentation
          ? [e.interest ? `Zainteresowanie: ${INTEREST_LABELS[e.interest].toLowerCase()}` : null, e.price_feedback ? `cena: ${PRICE_LABELS[e.price_feedback].toLowerCase()}` : null].filter(Boolean).join(', ')
          : e.note
        return h(
          'li',
          { class: isPresentation ? 'k-presentation' : 'k-action' },
          h('span', { class: 'when mono' }, shortDate(e.date)),
          h('span', { class: 'dot', 'aria-hidden': 'true' }),
          h('div', {}, h('p', { class: 'what' }, e.title || ACTION_LABELS[e.action_type] || 'Działanie'), detail ? h('p', { class: 'small muted' }, detail) : null),
        )
      }),
    ),
  )
}

// ---------- Agent i następny krok ----------

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}

function agentCard(agent, listing) {
  const name = agent?.full_name?.trim()
  const phone = agent?.phone?.trim()
  return h(
    'section',
    { class: 'card' },
    name
      ? h('div', { class: 'agent' }, h('div', { class: 'avatar', 'aria-hidden': 'true' }, initials(name)), h('div', {}, h('p', { class: 'agent-name' }, name), h('p', { class: 'small muted' }, 'Opiekun Twojej oferty')))
      : null,
    phone
      ? h('div', { class: 'agent-contact' }, h('span', { class: 'mono' }, phone), h('a', { class: 'btn btn-primary', href: `tel:${phone.replace(/[^\d+]/g, '')}` }, 'Zadzwoń'))
      : null,
    h('div', { class: 'next-step' }, h('p', { class: 'eyebrow' }, 'Następny krok'), h('p', {}, listing.next_step || 'Agent wkrótce ustali kolejne działania.')),
  )
}

// ---------- Opinie z prezentacji ----------

function feedback(presentations) {
  const head = h('div', { class: 'panel-head' }, h('div', {}, h('h2', {}, 'Opinie po prezentacjach'), h('p', { class: 'small muted' }, 'Anonimowo, w słowach kupujących')))
  if (!presentations.length) return h('section', { class: 'card' }, head, h('p', { class: 'muted' }, 'Po pierwszych prezentacjach zobaczysz tu, co mówią kupujący.'))

  const counts = { fair: 0, too_high: 0, bargain: 0 }
  for (const p of presentations) if (p.price_feedback) counts[p.price_feedback]++
  const rated = counts.fair + counts.too_high + counts.bargain

  const priceSummary = rated
    ? h(
        'div',
        { class: 'price-summary' },
        h(
          'p',
          { class: 'small muted' },
          `Odbiór ceny po ${rated} ${plural(rated, 'prezentacji', 'prezentacjach', 'prezentacjach')}: `,
          h('b', { class: 'mono' }, String(counts.fair)),
          ' adekwatna, ',
          h('b', { class: 'mono' }, String(counts.too_high)),
          ' za wysoka, ',
          h('b', { class: 'mono' }, String(counts.bargain)),
          ' okazja',
        ),
        h(
          'div',
          { class: 'price-bar', 'aria-hidden': 'true' },
          ['fair', 'too_high', 'bargain'].filter((k) => counts[k]).map((k) => h('span', { class: `pb-${k}`, style: `flex:${counts[k]}` })),
        ),
      )
    : null

  return h(
    'section',
    { class: 'card' },
    head,
    priceSummary,
    h(
      'ul',
      { class: 'feedback-list' },
      presentations.map((p) =>
        h(
          'li',
          {},
          h(
            'div',
            { class: 'fb-meta' },
            h('span', { class: 'mono small muted' }, shortDate(p.date)),
            p.interest ? h('span', { class: `pill pill-interest-${p.interest}` }, `${INTEREST_LABELS[p.interest]} zainteresowanie`) : null,
            p.price_feedback ? h('span', { class: `pill pill-price-${p.price_feedback}` }, `Cena: ${PRICE_LABELS[p.price_feedback].toLowerCase()}`) : null,
          ),
          p.note ? h('p', {}, `„${p.note}”`) : null,
        ),
      ),
    ),
  )
}

start()
