// Raport tygodniowy dla właściciela: gotowy tekst do skopiowania lub wysłania SMS-em / e-mailem.
import { PRICE_LABELS } from './domain.js'
import { addDays, mondayOf, number, plural, todayISO, weekLabel } from './format.js'
import { copyText, field, h } from './ui.js'

const WEEKS_TO_OFFER = 8

// W poniedziałek i wtorek agent zwykle podsumowuje poprzedni tydzień, w pozostałe dni — bieżący.
function defaultWeek() {
  const today = todayISO()
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay() // 0 = niedziela
  const thisWeek = mondayOf(today)
  return weekday === 1 || weekday === 2 ? addDays(thisWeek, -7) : thisWeek
}

const sum = (rows, key) => rows.reduce((total, row) => total + (row[key] ?? 0), 0)

export function buildReport({ listing, events, stats, week, url }) {
  const weekEnd = addDays(week, 6)
  const inWeek = (e) => e.event_date >= week && e.event_date <= weekEnd
  const weekStats = stats.find((s) => s.period_start === week)
  const presentations = events.filter((e) => e.kind === 'presentation')
  const weekPresentations = presentations.filter(inWeek)
  const weekActions = events.filter((e) => e.kind === 'action' && inWeek(e))

  const lines = ['Dzień dobry,', `podsumowanie tygodnia ${weekLabel(week)} dla oferty „${listing.title}”:`, '']

  if (weekStats) {
    const inquiries = weekStats.inquiries_portal + weekStats.inquiries_campaign
    const totalInquiries = sum(stats, 'inquiries_portal') + sum(stats, 'inquiries_campaign')
    lines.push(`• Wyświetlenia ogłoszeń: ${number.format(weekStats.views)} (łącznie ${number.format(sum(stats, 'views'))})`)
    lines.push(
      `• Nowe zapytania: ${number.format(inquiries)} (łącznie ${number.format(totalInquiries)})` +
        (weekStats.inquiries_campaign ? `, w tym z kampanii reklamowej: ${number.format(weekStats.inquiries_campaign)}` : ''),
    )
  }
  lines.push(`• Prezentacje: ${weekPresentations.length} (łącznie ${presentations.length})`)
  if (weekStats) lines.push(`• Oferty kupna: ${number.format(weekStats.offers)} (łącznie ${number.format(sum(stats, 'offers'))})`)
  if (weekStats?.campaign_reach) {
    lines.push(`• Kampania reklamowa: ${number.format(weekStats.campaign_reach)} ${plural(weekStats.campaign_reach, 'osoba zobaczyła', 'osoby zobaczyły', 'osób zobaczyło')} reklamę, ${number.format(weekStats.campaign_clicks)} ${plural(weekStats.campaign_clicks, 'kliknięcie', 'kliknięcia', 'kliknięć')}`)
  }

  if (weekActions.length) {
    lines.push('', 'Co zrobiliśmy:')
    for (const a of [...weekActions].reverse()) lines.push(`• ${a.title}${a.note ? `: ${a.note}` : ''}`)
  }

  const rated = presentations.filter((p) => p.price_feedback)
  if (rated.length) {
    const counts = Object.fromEntries(Object.keys(PRICE_LABELS).map((k) => [k, rated.filter((p) => p.price_feedback === k).length]))
    const parts = [
      counts.fair ? `${counts.fair} adekwatna` : null,
      counts.too_high ? `${counts.too_high} za wysoka` : null,
      counts.bargain ? `${counts.bargain} okazja` : null,
    ].filter(Boolean)
    lines.push('', `Odbiór ceny po wszystkich prezentacjach (${rated.length}): ${parts.join(', ')}.`)
  }

  if (listing.next_step) lines.push('', `Następny krok: ${listing.next_step}`)
  lines.push('', `Pełny raport na bieżąco: ${url}`)

  const signature = [listing.agent?.full_name, listing.agent?.phone].filter(Boolean).join(', ')
  if (signature) lines.push('', signature)

  return { text: lines.join('\n'), hasStats: Boolean(weekStats) }
}

export function reportCard({ listing, events, stats, url, state, onWeekChange }) {
  const week = state.reportWeek ?? defaultWeek()
  const thisWeek = mondayOf(todayISO())
  const weeks = Array.from({ length: WEEKS_TO_OFFER }, (_, i) => addDays(thisWeek, -7 * i))
  const { text, hasStats } = buildReport({ listing, events, stats, week, url })

  const weekField = field('Tydzień', {
    as: 'select',
    name: 'report_week',
    value: week,
    options: weeks.map((w) => [w, `${weekLabel(w)}${w === thisWeek ? ' (ten tydzień)' : ''}`]),
  })
  weekField.querySelector('select').addEventListener('change', (e) => onWeekChange(e.target.value))

  // Tekst można poprawić przed wysłaniem; przyciski biorą aktualną treść pola.
  const textarea = h('textarea', { class: 'report-text', rows: 14, 'aria-label': 'Treść raportu tygodniowego' }, text)
  const subject = `Raport tygodniowy: ${listing.title} (${weekLabel(week)})`

  return h(
    'section',
    { class: 'card' },
    h('h2', {}, 'Raport tygodniowy'),
    h('p', { class: 'small muted' }, 'Gotowy tekst do wysłania właścicielowi SMS-em lub e-mailem. Możesz go poprawić przed wysłaniem.'),
    weekField,
    hasStats ? null : h('p', { class: 'small tone-warn' }, 'Brak statystyk za ten tydzień, więc raport ich nie zawiera. Uzupełnij je przyciskiem „Statystyki tygodnia”.'),
    textarea,
    h(
      'div',
      { class: 'link-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: (e) => copyText(textarea.value, e.currentTarget) }, 'Kopiuj raport'),
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: () => (location.href = `sms:?&body=${encodeURIComponent(textarea.value)}`) }, 'SMS'),
      h(
        'button',
        { type: 'button', class: 'btn btn-ghost', onClick: () => (location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(textarea.value)}`) },
        'E-mail',
      ),
    ),
  )
}
