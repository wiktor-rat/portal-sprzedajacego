import { supabase } from './supabase.js'
import { field, form, h } from './ui.js'

export const STATUS_LABELS = {
  active: 'Aktywna',
  reserved: 'Zarezerwowana',
  sold: 'Sprzedana',
  withdrawn: 'Wycofana',
}

const DAY = 24 * 60 * 60 * 1000

const pricePLN = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 })
const number = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })

function today() {
  const d = new Date()
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
}

// Daty z bazy przychodzą jako 'RRRR-MM-DD'; liczymy w UTC, żeby zmiana czasu nie przesuwała dni.
function daysUntil(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - today()) / DAY)
}

function dayWord(n) {
  return Math.abs(n) === 1 ? 'dzień' : 'dni'
}

// Stan umowy na wyłączność do pokazania przy ofercie: [tekst, rodzaj] lub null.
export function exclusivityInfo(listing) {
  if (!listing.exclusive_to) return ['Brak daty końca umowy', 'muted']
  const left = daysUntil(listing.exclusive_to)
  if (left < 0) return [`Wyłączność wygasła ${-left} ${dayWord(left)} temu`, 'danger']
  if (left === 0) return ['Wyłączność kończy się dziś', 'warn']
  return [`Wyłączność: jeszcze ${left} ${dayWord(left)}`, left <= 14 ? 'warn' : 'ok']
}

// „650 000”, „650000,50”, „650.000” → liczba; puste → null; bzdura → NaN
function parseAmount(text) {
  const clean = String(text ?? '').replace(/\s|zł|m2|m²/gi, '').replace(',', '.')
  if (!clean) return null
  // „650.000” (kropka jako separator tysięcy) — trzy cyfry po kropce i brak innej kropki
  const normalized = /^\d{1,3}(\.\d{3})+$/.test(clean) ? clean.replaceAll('.', '') : clean
  return /^\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : NaN
}

function amountForInput(value) {
  return value == null ? '' : String(value).replace('.', ',')
}

function dbErrorText(error) {
  if (/fetch|network/i.test(error?.message ?? '')) return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'
  if (error?.code === '23514') return 'Sprawdź dane: data końca umowy nie może być przed datą początku, a cena i metraż muszą być dodatnie.'
  return error?.userMessage ?? 'Nie udało się zapisać. Spróbuj ponownie.'
}

function invalid(message) {
  return Object.assign(new Error(message), { userMessage: message })
}

// ---------- Lista ofert ----------

export async function listingsListView() {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, address, price, area_m2, status, exclusive_to, created_at')
    .order('created_at', { ascending: false })

  const addButton = h('a', { class: 'btn btn-primary', href: '#/oferty/nowa' }, '+ Dodaj ofertę')

  if (error) {
    console.error(error)
    return [h('section', { class: 'card' }, h('h2', {}, 'Nie udało się wczytać ofert'), h('p', { class: 'muted' }, 'Odśwież stronę.'))]
  }

  const header = h('div', { class: 'section-head' }, h('h2', {}, 'Oferty'), addButton)

  if (!data.length) {
    return [
      header,
      h(
        'section',
        { class: 'card empty' },
        h('h3', {}, 'Nie masz jeszcze ofert'),
        h('p', { class: 'muted' }, 'Dodaj pierwszą ofertę na wyłączność. Właściciel dostanie do niej własny link z raportem.'),
      ),
    ]
  }

  // Najpierw oferty w toku (aktywne, zarezerwowane), potem zakończone.
  const order = { active: 0, reserved: 1, sold: 2, withdrawn: 3 }
  const sorted = [...data].sort((a, b) => order[a.status] - order[b.status])

  return [header, h('ul', { class: 'listing-list' }, sorted.map(listingItem))]
}

function listingItem(listing) {
  const [exclusivityText, exclusivityKind] = exclusivityInfo(listing)
  const finished = listing.status === 'sold' || listing.status === 'withdrawn'
  const facts = [
    listing.price != null ? pricePLN.format(listing.price) : null,
    listing.area_m2 != null ? `${number.format(listing.area_m2)} m²` : null,
  ].filter(Boolean)

  return h(
    'li',
    {},
    h(
      'a',
      { class: 'listing-item card', href: `#/oferty/${listing.id}` },
      h('div', { class: 'listing-top' }, h('h3', {}, listing.title), h('span', { class: `badge badge-${listing.status}` }, STATUS_LABELS[listing.status])),
      listing.address ? h('p', { class: 'muted' }, listing.address) : null,
      facts.length ? h('p', { class: 'mono' }, facts.join(' · ')) : null,
      finished ? null : h('p', { class: `small tone-${exclusivityKind}` }, exclusivityText),
    ),
  )
}

// ---------- Dodawanie i edycja ----------

export async function listingFormView(id) {
  let listing = { title: '', address: '', price: null, area_m2: null, exclusive_from: '', exclusive_to: '', status: 'active', next_step: '' }

  if (id) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, title, address, price, area_m2, exclusive_from, exclusive_to, status, next_step')
      .eq('id', id)
      .maybeSingle()
    if (error || !data) {
      if (error) console.error(error)
      return [
        h('a', { class: 'back-link', href: '#/' }, '← Oferty'),
        h('section', { class: 'card' }, h('h2', {}, 'Nie znaleziono oferty'), h('p', { class: 'muted' }, 'Mogła zostać usunięta albo nie należy do Twojego biura.')),
      ]
    }
    listing = data
  }

  const fields = [
    field('Tytuł oferty', { name: 'title', value: listing.title, required: true, maxlength: 120, placeholder: 'np. 3 pokoje, Mokotów, 62 m²' }),
    field('Adres', { name: 'address', value: listing.address, maxlength: 200, placeholder: 'np. ul. Puławska 120, Warszawa', hint: 'Widoczny dla właściciela. Wystarczy ulica i miasto.' }),
    h(
      'div',
      { class: 'field-row' },
      field('Cena (zł)', { name: 'price', value: amountForInput(listing.price), inputmode: 'decimal', autocomplete: 'off', placeholder: '650 000' }),
      field('Metraż (m²)', { name: 'area_m2', value: amountForInput(listing.area_m2), inputmode: 'decimal', autocomplete: 'off', placeholder: '62' }),
    ),
    h(
      'div',
      { class: 'field-row' },
      field('Umowa na wyłączność od', { name: 'exclusive_from', type: 'date', value: listing.exclusive_from ?? '' }),
      field('do', { name: 'exclusive_to', type: 'date', value: listing.exclusive_to ?? '' }),
    ),
    id ? field('Status', { as: 'select', name: 'status', value: listing.status, options: Object.entries(STATUS_LABELS) }) : null,
    field('Następny krok', {
      as: 'textarea',
      name: 'next_step',
      value: listing.next_step,
      maxlength: 300,
      placeholder: 'np. Dzień otwarty w sobotę 14:00–16:00',
      hint: 'Widzi go właściciel w swoim raporcie.',
    }),
  ].filter(Boolean)

  const cancel = h('a', { class: 'btn btn-ghost', href: '#/' }, 'Anuluj')

  return [
    h('a', { class: 'back-link', href: '#/' }, '← Oferty'),
    h(
      'section',
      { class: 'card' },
      h('h1', {}, id ? 'Edytuj ofertę' : 'Nowa oferta'),
      form({
        submitLabel: id ? 'Zapisz zmiany' : 'Dodaj ofertę',
        fields,
        extraActions: [cancel],
        errorText: dbErrorText,
        onSubmit: async (values) => {
          const price = parseAmount(values.price)
          const area = parseAmount(values.area_m2)
          if (Number.isNaN(price)) throw invalid('Cena: wpisz samą liczbę, np. 650000.')
          if (Number.isNaN(area)) throw invalid('Metraż: wpisz samą liczbę, np. 62,5.')
          if (values.exclusive_from && values.exclusive_to && values.exclusive_to < values.exclusive_from) {
            throw invalid('Data końca umowy nie może być wcześniejsza niż data początku.')
          }

          const row = {
            title: values.title.trim(),
            address: values.address.trim(),
            price,
            area_m2: area,
            exclusive_from: values.exclusive_from || null,
            exclusive_to: values.exclusive_to || null,
            next_step: values.next_step.trim(),
            ...(id ? { status: values.status } : {}),
          }
          if (!row.title) throw invalid('Wpisz tytuł oferty.')

          // office_id i agent_id uzupełnia baza (domyślnie: biuro i konto zalogowanego agenta).
          const { error } = id ? await supabase.from('listings').update(row).eq('id', id) : await supabase.from('listings').insert(row)
          if (error) throw error
          location.hash = '#/'
        },
      }),
    ),
  ]
}
