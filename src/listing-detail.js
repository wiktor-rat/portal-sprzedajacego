import { supabase } from './supabase.js'
import { ACTION_LABELS, INTEREST_LABELS, PRICE_LABELS, STATUS_LABELS, exclusivityInfo, ownerOpensInfo } from './domain.js'
import { reportCard } from './report.js'
import { addDays, daysAgo, dbErrorText, invalid, longDate, mondayOf, number, plural, pricePLN, shortDate, todayISO, weekLabel } from './format.js'
import { choice, copyText, field, form, h } from './ui.js'

const STAT_FIELDS = [
  ['views', 'Wyświetlenia ogłoszeń'],
  ['inquiries_portal', 'Zapytania z portali'],
  ['inquiries_campaign', 'Zapytania z kampanii'],
  ['offers', 'Oferty kupna'],
  ['campaign_reach', 'Zasięg kampanii'],
  ['campaign_clicks', 'Kliknięcia kampanii'],
]

const WEEKS_TO_OFFER = 8

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

// Szczegóły oferty. Widok sam się odświeża po zapisie, bez przewijania strony na górę.
export async function listingDetailView(id, ctx) {
  const root = h('div', { class: 'detail' })
  const state = { openPanel: null, statsWeek: null, reportWeek: null }
  let current = null

  async function load() {
    const [listing, events, stats, opens] = await Promise.all([
      supabase.from('listings').select('id, title, address, price, area_m2, status, exclusive_from, exclusive_to, next_step, owner_token, agent:profiles(full_name, phone)').eq('id', id).maybeSingle(),
      supabase
        .from('listing_events')
        .select('id, kind, action_type, event_date, title, note, interest, price_feedback, buyer_label')
        .eq('listing_id', id)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('listing_stats').select('*').eq('listing_id', id).order('period_start', { ascending: false }),
      supabase.from('portal_opens').select('opened_at').eq('listing_id', id).order('opened_at', { ascending: false }).limit(100),
    ])

    const failed = [listing, events, stats, opens].find((r) => r.error)
    if (failed || !listing.data) {
      if (failed) console.error(failed.error)
      root.replaceChildren(
        h('a', { class: 'back-link', href: '#/' }, '← Oferty'),
        h('section', { class: 'card' }, h('h2', {}, failed ? 'Nie udało się wczytać oferty' : 'Nie znaleziono oferty'), h('p', { class: 'muted' }, failed ? 'Odśwież stronę.' : 'Mogła zostać usunięta albo nie należy do Twojego biura.')),
      )
      return
    }

    current = { listing: listing.data, events: events.data, stats: stats.data, opens: opens.data }
    root.replaceChildren(...render(current))
  }

  // Otwieranie/zamykanie formularzy nie wymaga ponownego pobierania danych.
  function toggle(panel, extra = {}) {
    state.openPanel = state.openPanel === panel && !extra.force ? null : panel
    Object.assign(state, extra)
    root.replaceChildren(...render(current))
    root.querySelector('.panel')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }

  async function saved() {
    state.openPanel = null
    await load()
  }

  function render({ listing, events, stats, opens }) {
    const presentations = events.filter((e) => e.kind === 'presentation')
    const ownerUrl = `${location.origin}/o/${listing.owner_token}`
    return [
      h('a', { class: 'back-link', href: '#/' }, '← Oferty'),
      headerCard(listing, ctx?.isOwner),
      ownerLinkCard(listing, ownerUrl, opens),
      summary(stats, presentations),
      h(
        'div',
        { class: 'quick-actions' },
        quickButton('+ Prezentacja', state.openPanel === 'presentation', () => toggle('presentation')),
        quickButton('+ Działanie', state.openPanel === 'action', () => toggle('action')),
        quickButton('Statystyki tygodnia', state.openPanel === 'stats', () => toggle('stats', { statsWeek: null })),
      ),
      state.openPanel === 'presentation' ? presentationForm(id, saved, () => toggle(null)) : null,
      state.openPanel === 'action' ? actionForm(id, saved, () => toggle(null)) : null,
      state.openPanel === 'stats' ? statsForm(id, stats, state.statsWeek, saved, () => toggle(null)) : null,
      timeline(events, load),
      reportCard({
        listing,
        events,
        stats,
        url: ownerUrl,
        state,
        onWeekChange: (week) => {
          state.reportWeek = week
          root.replaceChildren(...render(current))
        },
      }),
      statsHistory(stats, (week) => toggle('stats', { statsWeek: week, force: true })),
    ].filter(Boolean)
  }

  await load()
  return [root]
}

function quickButton(label, active, onClick) {
  return h('button', { type: 'button', class: `btn ${active ? 'btn-primary' : 'btn-ghost'}`, 'aria-expanded': String(active), onClick }, label)
}

// ---------- Nagłówek i podsumowanie ----------

function headerCard(listing, showAgent) {
  const finished = listing.status === 'sold' || listing.status === 'withdrawn'
  const [exclusivityText, exclusivityKind] = exclusivityInfo(listing)
  const facts = [
    listing.price != null ? pricePLN.format(listing.price) : null,
    listing.area_m2 != null ? `${number.format(listing.area_m2)} m²` : null,
  ].filter(Boolean)
  const contract =
    listing.exclusive_from && listing.exclusive_to ? `Umowa: ${longDate(listing.exclusive_from)} – ${longDate(listing.exclusive_to)}` : null

  return h(
    'section',
    { class: 'card' },
    h('div', { class: 'listing-top' }, h('h1', {}, listing.title), h('span', { class: `badge badge-${listing.status}` }, STATUS_LABELS[listing.status])),
    listing.address ? h('p', { class: 'muted' }, listing.address) : null,
    facts.length ? h('p', { class: 'mono' }, facts.join(' · ')) : null,
    finished ? null : h('p', { class: `small tone-${exclusivityKind}` }, exclusivityText),
    contract ? h('p', { class: 'small muted' }, contract) : null,
    showAgent && listing.agent?.full_name ? h('p', { class: 'small muted' }, `Prowadzi: ${listing.agent.full_name}`) : null,
    h(
      'div',
      { class: 'next-step' },
      h('p', { class: 'eyebrow' }, 'Następny krok (widzi właściciel)'),
      h('p', {}, listing.next_step || 'Nie ustawiono. Właściciel lubi wiedzieć, co dalej.'),
    ),
    h('a', { class: 'btn btn-ghost', href: `#/oferty/${listing.id}/edycja` }, 'Edytuj ofertę i następny krok'),
  )
}

function ownerLinkCard(listing, url, opens) {
  const [opensText, opensTone] = ownerOpensInfo(opens[0]?.opened_at)
  const lastWeek = opens.filter((o) => daysAgo(o.opened_at) < 7).length
  const sms = `Dzień dobry, pod tym linkiem na bieżąco widzi Pan/Pani, co robimy z ofertą „${listing.title}”: ${url}`
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Link dla właściciela'),
    h(
      'p',
      { class: `owner-opens tone-${opensTone}` },
      opensText,
      lastWeek > 1 ? h('span', { class: 'muted' }, ` · ${lastWeek} ${plural(lastWeek, 'otwarcie', 'otwarcia', 'otwarć')} w ostatnich 7 dniach`) : null,
    ),
    opensTone === 'warn' ? h('p', { class: 'small muted' }, 'Wyślij właścicielowi link albo raport tygodniowy (poniżej), żeby widział, co dzieje się z ofertą.') : null,
    h('p', { class: 'small muted' }, 'Bez logowania, tylko dla tej oferty. Nie udostępniaj go nikomu poza właścicielem.'),
    h('code', { class: 'owner-link' }, url),
    h(
      'div',
      { class: 'link-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: (e) => copyText(url, e.currentTarget) }, 'Kopiuj link'),
      // „sms:?&body=” działa zarówno na iPhonie, jak i na Androidzie
      h('a', { class: 'btn btn-ghost', href: `sms:?&body=${encodeURIComponent(sms)}` }, 'Wyślij SMS-em'),
      h('a', { class: 'btn btn-ghost', href: `/o/${listing.owner_token}?podglad=1`, target: '_blank', rel: 'noopener' }, 'Podgląd raportu'),
    ),
  )
}

function summary(stats, presentations) {
  const tiles = [
    ['Wyświetlenia', sum(stats, 'views')],
    ['Zapytania', sum(stats, 'inquiries_portal') + sum(stats, 'inquiries_campaign')],
    ['Prezentacje', presentations.length],
    ['Oferty kupna', sum(stats, 'offers')],
  ]
  return h(
    'section',
    { class: 'tiles', 'aria-label': 'Podsumowanie' },
    tiles.map(([label, value]) => h('div', { class: 'tile' }, h('p', { class: 'tile-value mono' }, number.format(value)), h('p', { class: 'tile-label' }, label))),
  )
}

// ---------- Formularze ----------

function panel(title, ...children) {
  return h('section', { class: 'card panel' }, h('h2', {}, title), ...children)
}

function cancelButton(onCancel) {
  return h('button', { type: 'button', class: 'btn btn-ghost', onClick: onCancel }, 'Anuluj')
}

function presentationForm(listingId, onSaved, onCancel) {
  return panel(
    'Nowa prezentacja',
    form({
      submitLabel: 'Zapisz prezentację',
      extraActions: [cancelButton(onCancel)],
      errorText: dbErrorText,
      fields: [
        choice('Zainteresowanie kupującego', { name: 'interest', options: Object.entries(INTEREST_LABELS), required: true }),
        choice('Jak odebrał cenę?', { name: 'price_feedback', options: Object.entries(PRICE_LABELS) }),
        field('Komentarz kupującego', {
          as: 'textarea',
          name: 'note',
          maxlength: 500,
          placeholder: 'np. Podobał się układ, obawy o hałas od ulicy',
          hint: 'Widzi właściciel. Bez imion, nazwisk i numerów telefonów.',
        }),
        field('Notatka wewnętrzna', {
          name: 'buyer_label',
          maxlength: 200,
          autocomplete: 'off',
          placeholder: 'np. Para z Ursynowa, kredyt w trakcie',
          hint: 'Tylko dla biura. Właściciel jej nie zobaczy.',
        }),
        field('Data prezentacji', { name: 'event_date', type: 'date', value: todayISO(), max: todayISO(), required: true }),
      ],
      onSubmit: async (v) => {
        if (!v.interest) throw invalid('Zaznacz zainteresowanie kupującego.')
        const { error } = await supabase.from('listing_events').insert({
          listing_id: listingId,
          kind: 'presentation',
          title: 'Prezentacja',
          event_date: v.event_date || todayISO(),
          interest: v.interest,
          price_feedback: v.price_feedback || null,
          note: v.note.trim(),
          buyer_label: v.buyer_label.trim(),
        })
        if (error) throw error
        await onSaved()
      },
    }),
  )
}

function actionForm(listingId, onSaved, onCancel) {
  return panel(
    'Nowe działanie',
    form({
      submitLabel: 'Zapisz działanie',
      extraActions: [cancelButton(onCancel)],
      errorText: dbErrorText,
      fields: [
        choice('Rodzaj działania', { name: 'action_type', options: Object.entries(ACTION_LABELS), required: true }),
        field('Opis', {
          as: 'textarea',
          name: 'note',
          maxlength: 500,
          placeholder: 'np. Ogłoszenie podbite na Otodom i OLX na 7 dni',
          hint: 'Widzi właściciel.',
        }),
        field('Data', { name: 'event_date', type: 'date', value: todayISO(), required: true }),
      ],
      onSubmit: async (v) => {
        if (!v.action_type) throw invalid('Wybierz rodzaj działania.')
        if (v.action_type === 'other' && !v.note.trim()) throw invalid('Przy „Inne działanie” opisz, co zostało zrobione.')
        const { error } = await supabase.from('listing_events').insert({
          listing_id: listingId,
          kind: 'action',
          action_type: v.action_type,
          title: ACTION_LABELS[v.action_type],
          event_date: v.event_date || todayISO(),
          note: v.note.trim(),
        })
        if (error) throw error
        await onSaved()
      },
    }),
  )
}

function statsForm(listingId, stats, preselectedWeek, onSaved, onCancel) {
  const thisWeek = mondayOf(todayISO())
  const recentWeeks = Array.from({ length: WEEKS_TO_OFFER }, (_, i) => addDays(thisWeek, -7 * i))
  const weeks = [...new Set([...recentWeeks, ...stats.map((s) => s.period_start)])].sort().reverse()
  const selected = preselectedWeek ?? thisWeek
  const byWeek = Object.fromEntries(stats.map((s) => [s.period_start, s]))

  const weekOptions = weeks.map((w) => [w, `${weekLabel(w)}${w === thisWeek ? ' (ten tydzień)' : ''}${byWeek[w] ? ' ✓' : ''}`])
  const numberFields = STAT_FIELDS.map(([name, label]) =>
    field(label, { name, type: 'number', inputmode: 'numeric', min: 0, step: 1, value: byWeek[selected]?.[name] ?? '', placeholder: '0' }),
  )

  const weekField = field('Tydzień', { as: 'select', name: 'period_start', value: selected, options: weekOptions, hint: '✓ = statystyki już wpisane; zapis je nadpisze.' })
  // Po zmianie tygodnia wczytujemy wpisane wcześniej liczby (albo czyścimy pola).
  weekField.querySelector('select').addEventListener('change', (event) => {
    const existing = byWeek[event.target.value]
    for (const [name] of STAT_FIELDS) event.target.form.elements[name].value = existing?.[name] ?? ''
  })

  return panel(
    'Statystyki tygodnia',
    form({
      submitLabel: 'Zapisz statystyki',
      extraActions: [cancelButton(onCancel)],
      errorText: dbErrorText,
      fields: [
        weekField,
        h('div', { class: 'field-row' }, numberFields.slice(0, 2)),
        h('div', { class: 'field-row' }, numberFields.slice(2, 4)),
        h('p', { class: 'eyebrow' }, 'Kampania reklamowa'),
        h('div', { class: 'field-row' }, numberFields.slice(4, 6)),
      ],
      onSubmit: async (v) => {
        const row = { listing_id: listingId, period_start: v.period_start }
        for (const [name, label] of STAT_FIELDS) {
          const value = v[name] === '' ? 0 : Number(v[name])
          if (!Number.isInteger(value) || value < 0) throw invalid(`${label}: wpisz liczbę całkowitą, 0 lub więcej.`)
          row[name] = value
        }
        const { error } = await supabase.from('listing_stats').upsert(row, { onConflict: 'listing_id,period_start' })
        if (error) throw error
        await onSaved()
      },
    }),
  )
}

// ---------- Historia ----------

function timeline(events, reload) {
  if (!events.length) {
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Historia działań'),
      h('p', { class: 'muted' }, 'Brak wpisów. Dodaj pierwszą prezentację albo działanie: właściciel zobaczy je w swoim raporcie.'),
    )
  }
  return h('section', { class: 'card' }, h('h2', {}, 'Historia działań'), h('ol', { class: 'timeline' }, events.map((e) => timelineItem(e, reload))))
}

function timelineItem(event, reload) {
  const isPresentation = event.kind === 'presentation'
  const chips = isPresentation
    ? [
        event.interest ? h('span', { class: `chip chip-interest-${event.interest}` }, `Zainteresowanie: ${INTEREST_LABELS[event.interest].toLowerCase()}`) : null,
        event.price_feedback ? h('span', { class: `chip chip-price-${event.price_feedback}` }, `Cena: ${PRICE_LABELS[event.price_feedback].toLowerCase()}`) : null,
      ].filter(Boolean)
    : []

  const remove = h(
    'button',
    {
      type: 'button',
      class: 'link-btn small danger-link',
      onClick: async (e) => {
        if (!confirm('Usunąć ten wpis? Zniknie też z raportu właściciela.')) return
        e.target.disabled = true
        const { error } = await supabase.from('listing_events').delete().eq('id', event.id)
        if (error) {
          console.error(error)
          alert('Nie udało się usunąć wpisu. Spróbuj ponownie.')
          e.target.disabled = false
          return
        }
        await reload()
      },
    },
    'Usuń',
  )

  return h(
    'li',
    { class: `timeline-item kind-${event.kind}` },
    h('div', { class: 'timeline-head' }, h('span', { class: 'timeline-date mono' }, shortDate(event.event_date)), h('strong', {}, event.title), remove),
    chips.length ? h('div', { class: 'chips' }, chips) : null,
    event.note ? h('p', {}, isPresentation ? `„${event.note}”` : event.note) : null,
    event.buyer_label ? h('p', { class: 'internal-note small' }, h('span', { class: 'internal-tag' }, 'Tylko dla biura'), ' ', event.buyer_label) : null,
  )
}

function statsHistory(stats, onEdit) {
  if (!stats.length) return null
  const reach = sum(stats, 'campaign_reach')
  const clicks = sum(stats, 'campaign_clicks')
  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Statystyki tygodniowe'),
    reach || clicks ? h('p', { class: 'small muted' }, `Kampania łącznie: zasięg ${number.format(reach)}, kliknięcia ${number.format(clicks)}`) : null,
    h(
      'ul',
      { class: 'stats-list' },
      stats.map((s) =>
        h(
          'li',
          {},
          h('div', { class: 'stats-week' }, h('strong', {}, weekLabel(s.period_start)), h('button', { type: 'button', class: 'link-btn small', onClick: () => onEdit(s.period_start) }, 'Popraw')),
          h(
            'p',
            { class: 'small mono' },
            `${number.format(s.views)} wyśw. · ${number.format(s.inquiries_portal + s.inquiries_campaign)} zapyt. (${number.format(s.inquiries_campaign)} z kampanii) · ${number.format(s.offers)} ${plural(s.offers, 'oferta', 'oferty', 'ofert')}`,
          ),
        ),
      ),
    ),
  )
}
