// Formatowanie liczb i dat po polsku oraz wspólne komunikaty błędów zapisu.

const DAY = 24 * 60 * 60 * 1000

export const pricePLN = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 })
export const number = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 })

// Daty z bazy to 'RRRR-MM-DD'; liczymy w UTC, żeby zmiana czasu nie przesuwała dni.
function utc(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function iso(ms) {
  return new Date(ms).toISOString().slice(0, 10)
}

// Dzisiejsza data w strefie użytkownika jako 'RRRR-MM-DD'
export function todayISO() {
  const d = new Date()
  return iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
}

export function daysUntil(isoDate) {
  return Math.round((utc(isoDate) - utc(todayISO())) / DAY)
}

export function addDays(isoDate, days) {
  return iso(utc(isoDate) + days * DAY)
}

// Poniedziałek tygodnia, w którym leży data
export function mondayOf(isoDate) {
  const weekday = new Date(utc(isoDate)).getUTCDay() // 0 = niedziela
  return addDays(isoDate, -((weekday + 6) % 7))
}

const dayMonth = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('pl-PL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

export function shortDate(isoDate) {
  return dayMonth.format(utc(isoDate))
}

export function longDate(isoDate) {
  return dayMonthYear.format(utc(isoDate))
}

// „13–19 paź” albo „27 paź – 2 lis”
export function weekLabel(mondayISO) {
  const sunday = addDays(mondayISO, 6)
  if (mondayISO.slice(0, 7) === sunday.slice(0, 7)) return `${Number(mondayISO.slice(8))}–${shortDate(sunday)}`
  return `${shortDate(mondayISO)} – ${shortDate(sunday)}`
}

// Polska odmiana: plural(1, 'oferta', 'oferty', 'ofert')
export function plural(n, one, few, many) {
  if (n === 1) return one
  const last = n % 10
  const lastTwo = n % 100
  return last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? few : many
}

export function dayWord(n) {
  return Math.abs(n) === 1 ? 'dzień' : 'dni'
}

// Błąd z gotowym komunikatem dla użytkownika (walidacja formularza)
export function invalid(message) {
  return Object.assign(new Error(message), { userMessage: message })
}

export function dbErrorText(error) {
  if (error?.userMessage) return error.userMessage
  if (/fetch|network/i.test(error?.message ?? '')) return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'
  if (error?.code === '23514') return 'Sprawdź wpisane dane: któraś wartość jest poza dozwolonym zakresem.'
  return 'Nie udało się zapisać. Spróbuj ponownie.'
}
