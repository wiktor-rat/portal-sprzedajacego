import { supabase } from './supabase.js'
import { dbErrorText, invalid, number, pricePLN } from './format.js'
import { STATUS_LABELS, exclusivityInfo, ownerOpensInfo } from './domain.js'
import { field, form, h } from './ui.js'

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

function listingErrorText(error) {
  if (error?.code === '23514') return 'Sprawdź dane: data końca umowy nie może być przed datą początku, a cena i metraż muszą być dodatnie.'
  return dbErrorText(error)
}

// Osoby z biura (dla właściciela: filtr ofert i przypisanie oferty agentowi)
async function loadTeam() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, active').order('full_name')
  if (error) throw error
  return data
}

// ---------- Lista ofert ----------

export async function listingsListView(ctx, agentFilter = null) {
  const { data, error } = await supabase
    .from('listings')
    .select('id, title, address, price, area_m2, status, exclusive_to, created_at, agent_id, portal_opens(opened_at)')
    .order('created_at', { ascending: false })
    // z otwarć portalu potrzebujemy tylko ostatniego
    .order('opened_at', { referencedTable: 'portal_opens', ascending: false })
    .limit(1, { referencedTable: 'portal_opens' })

  const addButton = h('a', { class: 'btn btn-primary', href: '#/oferty/nowa' }, '+ Dodaj ofertę')
  const firstName = ctx.profile.full_name.split(' ')[0]
  const greeting = h('div', {}, h('p', { class: 'eyebrow' }, ctx.isOwner ? 'Właściciel biura' : 'Agent'), h('h1', {}, firstName ? `Dzień dobry, ${firstName}` : 'Dzień dobry'))

  let team = []
  try {
    if (ctx.isOwner) team = await loadTeam()
  } catch (teamError) {
    console.error(teamError)
  }

  if (error) {
    console.error(error)
    return [greeting, h('section', { class: 'card' }, h('h2', {}, 'Nie udało się wczytać ofert'), h('p', { class: 'muted' }, 'Odśwież stronę.'))]
  }

  const header = h('div', { class: 'section-head' }, h('h2', {}, ctx.isOwner ? 'Oferty biura' : 'Moje oferty'), addButton)
  const names = Object.fromEntries(team.map((m) => [m.id, m.full_name]))

  // Właściciel biura: wybór agenta (pokazuje się, gdy w biurze jest więcej niż jedna osoba)
  const filter =
    ctx.isOwner && team.length > 1
      ? field('Agent', {
          as: 'select',
          name: 'agent_filter',
          value: agentFilter ?? '',
          options: [
            ['', `Wszyscy agenci (${data.length})`],
            ...team.map((m) => [m.id, `${m.full_name || 'Bez nazwy'}${m.active ? '' : ' (dostęp wyłączony)'} (${data.filter((l) => l.agent_id === m.id).length})`]),
          ],
        })
      : null
  filter?.querySelector('select').addEventListener('change', (e) => {
    location.hash = e.target.value ? `#/?agent=${e.target.value}` : '#/'
  })

  const visible = agentFilter ? data.filter((l) => l.agent_id === agentFilter) : data

  if (!visible.length) {
    if (agentFilter) {
      return [greeting, header, filter, h('section', { class: 'card empty' }, h('h3', {}, 'Ten agent nie ma jeszcze ofert'), h('p', { class: 'muted' }, 'Gdy doda ofertę, zobaczysz ją tutaj.'))]
    }
    return [
      greeting,
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
  const sorted = [...visible].sort((a, b) => order[a.status] - order[b.status])
  // Przy widoku wszystkich ofert właściciel widzi, kto prowadzi każdą z nich.
  const showAgent = ctx.isOwner && team.length > 1 && !agentFilter

  return [greeting, header, filter, h('ul', { class: 'listing-list' }, sorted.map((l) => listingItem(l, showAgent ? names[l.agent_id] : null)))].filter(Boolean)
}

function listingItem(listing, agentName) {
  const [exclusivityText, exclusivityKind] = exclusivityInfo(listing)
  const [opensText, opensTone] = ownerOpensInfo(listing.portal_opens?.[0]?.opened_at)
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
      finished ? null : h('p', { class: `small tone-${opensTone === 'warn' ? 'warn' : 'muted'}` }, opensText),
      agentName ? h('p', { class: 'small muted' }, `Prowadzi: ${agentName}`) : null,
    ),
  )
}

// ---------- Dodawanie i edycja ----------

export async function listingFormView(id, ctx) {
  let listing = { title: '', address: '', price: null, area_m2: null, exclusive_from: '', exclusive_to: '', status: 'active', next_step: '', agent_id: ctx.userId }

  if (id) {
    const { data, error } = await supabase
      .from('listings')
      .select('id, title, address, price, area_m2, exclusive_from, exclusive_to, status, next_step, agent_id')
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

  // Właściciel biura może przypisać ofertę dowolnemu agentowi (aktywnemu albo obecnie prowadzącemu)
  let team = []
  if (ctx.isOwner) {
    try {
      team = (await loadTeam()).filter((m) => m.active || m.id === listing.agent_id)
    } catch (teamError) {
      console.error(teamError)
    }
  }

  const fields = [
    team.length > 1
      ? field('Agent prowadzący', {
          as: 'select',
          name: 'agent_id',
          value: listing.agent_id,
          options: team.map((m) => [m.id, `${m.full_name || 'Bez nazwy'}${m.active ? '' : ' (dostęp wyłączony)'}`]),
          hint: 'Imię i telefon tej osoby zobaczy właściciel nieruchomości w raporcie.',
        })
      : null,
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

  const backHref = id ? `#/oferty/${id}` : '#/'
  const cancel = h('a', { class: 'btn btn-ghost', href: backHref }, 'Anuluj')

  return [
    h('a', { class: 'back-link', href: backHref }, id ? '← Wróć do oferty' : '← Oferty'),
    h(
      'section',
      { class: 'card' },
      h('h1', {}, id ? 'Edytuj ofertę' : 'Nowa oferta'),
      form({
        submitLabel: id ? 'Zapisz zmiany' : 'Dodaj ofertę',
        fields,
        extraActions: [cancel],
        errorText: listingErrorText,
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
            ...(values.agent_id ? { agent_id: values.agent_id } : {}),
          }
          if (!row.title) throw invalid('Wpisz tytuł oferty.')

          // office_id (i agent_id, jeśli nie wybrano) uzupełnia baza: biuro i konto zalogowanego agenta.
          if (id) {
            const { error } = await supabase.from('listings').update(row).eq('id', id)
            if (error) throw error
            location.hash = `#/oferty/${id}`
          } else {
            const { data, error } = await supabase.from('listings').insert(row).select('id').single()
            if (error) throw error
            location.hash = `#/oferty/${data.id}`
          }
        },
      }),
    ),
  ]
}
