import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Brakujące zmienne środowiskowe to najczęstszy problem po pierwszym wdrożeniu,
// więc zamiast wywracać aplikację pokazujemy czytelny komunikat.
export const configError =
  !url || !key
    ? 'Brak zmiennych VITE_SUPABASE_URL lub VITE_SUPABASE_PUBLISHABLE_KEY. Dodaj je w Vercel (Settings → Environment Variables) i wdróż ponownie.'
    : key.startsWith('sb_secret_')
      ? 'W VITE_SUPABASE_PUBLISHABLE_KEY wpisano klucz sekretny (sb_secret_...). Użyj klucza publicznego sb_publishable_... i usuń sekretny z Vercel.'
      : null

export const supabase = configError
  ? null
  : createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })

// Dane portalu właściciela — wyłącznie przez funkcję w bazie, nigdy z tabel.
export async function getOwnerPortal(token, { track = true } = {}) {
  const { data, error } = await supabase.rpc('get_owner_portal', { p_token: token, p_track: track })
  if (error) throw error
  return data
}

// Sprawdza, czy schemat bazy (supabase/schema.sql) został uruchomiony.
export async function checkDatabase() {
  try {
    await getOwnerPortal('0'.repeat(32), { track: false })
    return { ok: true }
  } catch (error) {
    if (error.code === 'PGRST202') {
      return { ok: false, message: 'Połączenie działa, ale w bazie brakuje funkcji portalu. Uruchom supabase/schema.sql w Supabase SQL Editor.' }
    }
    return { ok: false, message: `Nie udało się połączyć z Supabase: ${error.message}` }
  }
}
