// Ustawienia: moje dane (widoczne dla właścicieli nieruchomości), hasło, dane biura.
import { supabase } from './supabase.js'
import { authErrorMessage } from './auth.js'
import { dbErrorText, invalid } from './format.js'
import { field, form, h } from './ui.js'

const MIN_PASSWORD = 8

export async function settingsView(ctx) {
  const { profile, isOwner } = ctx
  return [
    h('div', {}, h('p', { class: 'eyebrow' }, isOwner ? 'Właściciel biura' : 'Agent'), h('h1', {}, 'Ustawienia')),
    myDataCard(ctx),
    officeCard(ctx),
    passwordCard(),
    h('p', { class: 'muted small' }, `Zalogowano jako ${ctx.email || profile.email}`),
  ]
}

function card(title, description, ...children) {
  return h('section', { class: 'card' }, h('h2', {}, title), description ? h('p', { class: 'small muted' }, description) : null, ...children)
}

function myDataCard(ctx) {
  const { profile } = ctx
  return card(
    'Moje dane',
    'Imię i telefon widzą właściciele nieruchomości w swoich raportach.',
    form({
      submitLabel: 'Zapisz dane',
      errorText: dbErrorText,
      fields: [
        field('Imię i nazwisko', { name: 'full_name', value: profile.full_name, autocomplete: 'name', required: true, maxlength: 100 }),
        field('Telefon', { name: 'phone', type: 'tel', value: profile.phone, autocomplete: 'tel', maxlength: 30 }),
        field('E-mail (login)', { name: 'email_display', value: ctx.email || profile.email, readonly: true, hint: 'Zmiana adresu e-mail: napisz do administratora.' }),
      ],
      onSubmit: async ({ full_name, phone }, say) => {
        if (!full_name.trim()) throw invalid('Wpisz imię i nazwisko.')
        const { error } = await supabase.from('profiles').update({ full_name: full_name.trim(), phone: phone.trim() }).eq('id', profile.id)
        if (error) throw error
        say('success', 'Zapisano.')
        // Przy następnym widoku wczytamy profil od nowa (z nowym imieniem).
        ctx.invalidateProfile()
      },
    }),
  )
}

function officeCard(ctx) {
  const { profile, isOwner } = ctx
  const name = profile.offices?.name ?? ''
  if (!isOwner) {
    return card('Biuro', null, h('p', {}, name), h('p', { class: 'small muted' }, 'Danymi biura i zespołem zarządza właściciel biura.'))
  }
  return card(
    'Biuro',
    'Nazwa biura pojawia się w nagłówku panelu i w raportach dla właścicieli nieruchomości.',
    form({
      submitLabel: 'Zapisz nazwę biura',
      errorText: dbErrorText,
      fields: [field('Nazwa biura', { name: 'office_name', value: name, autocomplete: 'organization', required: true, maxlength: 120 })],
      onSubmit: async ({ office_name }, say) => {
        if (!office_name.trim()) throw invalid('Wpisz nazwę biura.')
        const { error } = await supabase.from('offices').update({ name: office_name.trim() }).eq('id', profile.office_id)
        if (error) throw error
        say('success', 'Zapisano.')
        ctx.invalidateProfile()
        const brand = document.querySelector('.topbar .brand')
        if (brand) brand.textContent = office_name.trim()
      },
    }),
  )
}

function passwordCard() {
  return card(
    'Zmiana hasła',
    null,
    form({
      submitLabel: 'Zmień hasło',
      errorText: authErrorMessage,
      fields: [
        field(`Nowe hasło (min. ${MIN_PASSWORD} znaków)`, { name: 'password', type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true }),
        field('Powtórz nowe hasło', { name: 'password2', type: 'password', autocomplete: 'new-password', minlength: MIN_PASSWORD, required: true }),
      ],
      onSubmit: async ({ password, password2 }, say) => {
        if (password !== password2) throw invalid('Hasła różnią się. Wpisz to samo hasło dwa razy.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        say('success', 'Hasło zmienione.')
      },
    }),
  )
}
