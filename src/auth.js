import { supabase } from './supabase.js'
import { field, form as baseForm, h } from './ui.js'

const MIN_PASSWORD = 8

// Komunikaty Supabase Auth po polsku (po kodzie błędu, z zapasem na tekst).
export function authErrorMessage(error) {
  const byCode = {
    invalid_credentials: 'Nieprawidłowy e-mail lub hasło.',
    email_not_confirmed: 'Najpierw potwierdź adres e-mail (link w wiadomości od nas).',
    user_already_exists: 'Konto z tym adresem e-mail już istnieje. Zaloguj się.',
    email_exists: 'Konto z tym adresem e-mail już istnieje. Zaloguj się.',
    weak_password: `Hasło jest za słabe. Użyj co najmniej ${MIN_PASSWORD} znaków.`,
    same_password: 'Nowe hasło musi być inne niż poprzednie.',
    over_email_send_rate_limit: 'Wysłaliśmy już kilka e-maili. Spróbuj ponownie za kilkanaście minut.',
    over_request_rate_limit: 'Zbyt wiele prób. Spróbuj ponownie za chwilę.',
    signup_disabled: 'Rejestracja jest obecnie wyłączona.',
    email_address_invalid: 'Ten adres e-mail jest nieprawidłowy.',
    validation_failed: 'Sprawdź poprawność wpisanych danych.',
  }
  if (error?.code && byCode[error.code]) return byCode[error.code]
  if (/fetch|network/i.test(error?.message ?? '')) return 'Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.'
  return 'Coś poszło nie tak. Spróbuj ponownie.'
}

function form(submitLabel, fields, onSubmit) {
  return baseForm({ submitLabel, fields, onSubmit, errorText: authErrorMessage })
}

function linkButton(label, onClick) {
  return h('button', { type: 'button', class: 'link-btn', onClick }, label)
}

export function loginView(go) {
  return h(
    'section',
    { class: 'card auth-card' },
    h('h1', {}, 'Zaloguj się'),
    form(
      'Zaloguj się',
      [
        field('E-mail', { name: 'email', type: 'email', autocomplete: 'email', required: true }),
        field('Hasło', { name: 'password', type: 'password', autocomplete: 'current-password', required: true }),
      ],
      async ({ email, password }) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      },
    ),
    h('div', { class: 'auth-links' }, linkButton('Nie pamiętam hasła', () => go('reset')), linkButton('Załóż konto biura', () => go('register'))),
  )
}

export function registerView(go) {
  return h(
    'section',
    { class: 'card auth-card' },
    h('h1', {}, 'Załóż konto biura'),
    h('p', { class: 'muted' }, 'Konto tworzy nowe biuro. Ty zostajesz jego właścicielem i pierwszym agentem.'),
    form(
      'Załóż konto',
      [
        field('Imię i nazwisko', { name: 'full_name', autocomplete: 'name', required: true }),
        field('Telefon (widoczny dla właścicieli nieruchomości)', { name: 'phone', type: 'tel', autocomplete: 'tel', required: true }),
        field('Nazwa biura', { name: 'office_name', autocomplete: 'organization', required: true }),
        field('E-mail', { name: 'email', type: 'email', autocomplete: 'email', required: true }),
        field(`Hasło (min. ${MIN_PASSWORD} znaków)`, { name: 'password', type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true }),
      ],
      async ({ full_name, phone, office_name, email, password }, say) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { full_name: full_name.trim(), phone: phone.trim(), office_name: office_name.trim() },
            emailRedirectTo: `${location.origin}/`,
          },
        })
        if (error) throw error
        // Bez sesji = Supabase wymaga potwierdzenia e-maila (opcja „Confirm email” włączona).
        if (!data.session) say('success', 'Konto utworzone. Sprawdź skrzynkę e-mail i kliknij link potwierdzający, potem zaloguj się.')
      },
    ),
    h('div', { class: 'auth-links' }, linkButton('Mam już konto, zaloguj się', () => go('login'))),
  )
}

export function resetView(go) {
  return h(
    'section',
    { class: 'card auth-card' },
    h('h1', {}, 'Nie pamiętam hasła'),
    h('p', { class: 'muted' }, 'Wyślemy link do ustawienia nowego hasła.'),
    form('Wyślij link', [field('E-mail', { name: 'email', type: 'email', autocomplete: 'email', required: true })], async ({ email }, say) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${location.origin}/?nowe-haslo=1`,
      })
      if (error) throw error
      say('success', 'Jeśli konto istnieje, wysłaliśmy e-mail z linkiem. Sprawdź też folder spam.')
    }),
    h('div', { class: 'auth-links' }, linkButton('Wróć do logowania', () => go('login'))),
  )
}

export function newPasswordView(onDone) {
  return h(
    'section',
    { class: 'card auth-card' },
    h('h1', {}, 'Ustaw nowe hasło'),
    form(
      'Zapisz hasło',
      [field(`Nowe hasło (min. ${MIN_PASSWORD} znaków)`, { name: 'password', type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true })],
      async ({ password }) => {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        onDone()
      },
    ),
  )
}
