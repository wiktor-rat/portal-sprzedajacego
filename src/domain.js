// Słowniki i reguły wspólne dla panelu agenta i portalu właściciela.
import { dayWord, daysAgo, daysUntil } from './format.js'

export const STATUS_LABELS = {
  active: 'Aktywna',
  reserved: 'Zarezerwowana',
  sold: 'Sprzedana',
  withdrawn: 'Wycofana',
}

export const INTEREST_LABELS = { low: 'Niskie', medium: 'Średnie', high: 'Wysokie' }
export const PRICE_LABELS = { too_high: 'Za wysoka', fair: 'Adekwatna', bargain: 'Okazja' }
export const ACTION_LABELS = {
  bump: 'Podbicie ogłoszenia',
  open_day: 'Dzień otwarty',
  new_photos: 'Nowe zdjęcia',
  buyer_mailing: 'Wysyłka do bazy kupujących',
  price_talk: 'Rozmowa o cenie',
  other: 'Inne działanie',
}

// Stan umowy na wyłączność do pokazania przy ofercie: [tekst, rodzaj].
export function exclusivityInfo(listing) {
  if (!listing.exclusive_to) return ['Brak daty końca umowy', 'muted']
  const left = daysUntil(listing.exclusive_to)
  if (left < 0) return [`Wyłączność wygasła ${-left} ${dayWord(left)} temu`, 'danger']
  if (left === 0) return ['Wyłączność kończy się dziś', 'warn']
  return [`Wyłączność: jeszcze ${left} ${dayWord(left)}`, left <= 14 ? 'warn' : 'ok']
}

// Czy właściciel zagląda do raportu: [tekst, rodzaj]. Ostrzeżenie, jeśli nigdy albo dawno.
export const STALE_OPEN_DAYS = 7

export function ownerOpensInfo(lastOpenedAt) {
  if (!lastOpenedAt) return ['Właściciel jeszcze nie otworzył raportu', 'warn']
  const days = daysAgo(lastOpenedAt)
  if (days <= 0) return ['Właściciel otworzył raport dziś', 'ok']
  if (days === 1) return ['Właściciel otworzył raport wczoraj', 'ok']
  if (days <= STALE_OPEN_DAYS) return [`Właściciel otworzył raport ${days} dni temu`, 'ok']
  return [`Właściciel nie zaglądał do raportu od ${days} dni`, 'warn']
}
