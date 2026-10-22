// Zespół biura (tylko właściciel biura): agenci, ich oferty, zaproszenia nowych agentów, wyłączanie dostępu.
import { supabase } from './supabase.js'
import { dbErrorText, invalid, longDate, plural } from './format.js'
import { copyText, field, form, h } from './ui.js'

const ROLE_LABELS = { owner: 'Właściciel biura', agent: 'Agent' }

function inviteUrl(token) {
  return `${location.origin}/?zaproszenie=${token}`
}

function inviteMessage(invite, officeName) {
  return `Cześć${invite.full_name ? ` ${invite.full_name.split(' ')[0]}` : ''}! Zapraszam Cię do panelu biura ${officeName}, w którym raportujemy właścicielom postępy sprzedaży. Załóż konto tutaj: ${inviteUrl(invite.token)} (link ważny 14 dni).`
}

export async function teamView(ctx) {
  const root = h('div', { class: 'detail' })
  const state = { justInvited: null }

  async function load() {
    const [members, listings, invites] = await Promise.all([
      supabase.from('profiles').select('id, full_name, phone, email, role, active').order('role', { ascending: false }).order('full_name'),
      supabase.from('listings').select('agent_id, status'),
      supabase.from('office_invites').select('id, email, full_name, token, expires_at').is('accepted_at', null).order('created_at', { ascending: false }),
    ])
    const failed = [members, listings, invites].find((r) => r.error)
    if (failed) {
      console.error(failed.error)
      root.replaceChildren(h('section', { class: 'card' }, h('h2', {}, 'Nie udało się wczytać zespołu'), h('p', { class: 'muted' }, 'Odśwież stronę.')))
      return
    }
    root.replaceChildren(...render(members.data, listings.data, invites.data))
  }

  function render(members, listings, invites) {
    const officeName = ctx.profile.offices?.name ?? 'naszego biura'
    return [
      h('div', {}, h('p', { class: 'eyebrow' }, officeName), h('h1', {}, 'Zespół')),
      membersCard(members, listings),
      inviteCard(members, officeName),
      state.justInvited ? inviteLinkCard(state.justInvited, officeName, true) : null,
      pendingCard(invites.filter((i) => i.id !== state.justInvited?.id), officeName),
    ].filter(Boolean)
  }

  function membersCard(members, listings) {
    const activeCount = (id) => listings.filter((l) => l.agent_id === id && (l.status === 'active' || l.status === 'reserved')).length
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Osoby w biurze'),
      h('p', { class: 'small muted' }, 'Agent widzi tylko swoje oferty. Ty widzisz oferty wszystkich i możesz przekazać ofertę innemu agentowi (w edycji oferty).'),
      h(
        'ul',
        { class: 'member-list' },
        members.map((m) => {
          const count = activeCount(m.id)
          const isMe = m.id === ctx.userId
          return h(
            'li',
            { class: m.active ? '' : 'inactive' },
            h(
              'div',
              { class: 'member-top' },
              h('strong', {}, m.full_name || m.email || 'Bez nazwy', isMe ? ' (Ty)' : ''),
              h('span', { class: `badge ${m.role === 'owner' ? 'badge-active' : ''}` }, m.active ? ROLE_LABELS[m.role] : 'Dostęp wyłączony'),
            ),
            h('p', { class: 'small muted' }, [m.email, m.phone].filter(Boolean).join(' · ')),
            h(
              'div',
              { class: 'member-actions' },
              h('a', { class: 'link-btn small', href: `#/?agent=${m.id}` }, `${count} ${plural(count, 'aktywna oferta', 'aktywne oferty', 'aktywnych ofert')} →`),
              isMe ? null : toggleButton(m),
            ),
          )
        }),
      ),
    )
  }

  function toggleButton(member) {
    const label = member.active ? 'Wyłącz dostęp' : 'Przywróć dostęp'
    return h(
      'button',
      {
        type: 'button',
        class: `link-btn small ${member.active ? 'danger-link' : ''}`,
        onClick: async (e) => {
          const question = member.active
            ? `Wyłączyć dostęp dla: ${member.full_name}? Ta osoba nie zobaczy już żadnych ofert. Jej oferty zostają w biurze — przekaż je innemu agentowi w edycji oferty.`
            : `Przywrócić dostęp dla: ${member.full_name}?`
          if (!confirm(question)) return
          e.target.disabled = true
          const { error } = await supabase.rpc('set_member_active', { p_profile_id: member.id, p_active: !member.active })
          if (error) {
            console.error(error)
            alert('Nie udało się zmienić dostępu. Spróbuj ponownie.')
            e.target.disabled = false
            return
          }
          await load()
        },
      },
      label,
    )
  }

  function inviteCard(members) {
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Zaproś agenta'),
      h('p', { class: 'small muted' }, 'Dostaniesz link do wysłania agentowi SMS-em lub e-mailem. Agent zakłada konto i od razu jest w Twoim biurze.'),
      form({
        submitLabel: 'Utwórz zaproszenie',
        errorText: dbErrorText,
        fields: [
          field('Imię i nazwisko agenta', { name: 'full_name', autocomplete: 'off', maxlength: 100 }),
          field('E-mail agenta', { name: 'email', type: 'email', autocomplete: 'off', required: true, hint: 'Agent założy konto dokładnie na ten adres.' }),
        ],
        onSubmit: async ({ full_name, email }) => {
          const cleanEmail = email.trim().toLowerCase()
          if (members.some((m) => m.email.toLowerCase() === cleanEmail)) throw invalid('Ta osoba ma już konto w Twoim biurze.')
          const { data, error } = await supabase
            .from('office_invites')
            .insert({ email: cleanEmail, full_name: full_name.trim() })
            .select('id, email, full_name, token, expires_at')
            .single()
          if (error) throw error
          state.justInvited = data
          await load()
          root.querySelector('.invite-new')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        },
      }),
    )
  }

  function inviteLinkCard(invite, officeName, fresh) {
    const url = inviteUrl(invite.token)
    const message = inviteMessage(invite, officeName)
    return h(
      'section',
      { class: `card ${fresh ? 'panel invite-new' : ''}` },
      h('h2', {}, fresh ? 'Zaproszenie gotowe' : invite.email),
      h('p', { class: 'small muted' }, `Dla: ${[invite.full_name, invite.email].filter(Boolean).join(', ')}. Ważne do ${longDate(invite.expires_at.slice(0, 10))}.`),
      h('code', { class: 'owner-link' }, url),
      inviteActions(invite, url, message),
    )
  }

  function inviteActions(invite, url, message) {
    return h(
      'div',
      { class: 'link-actions' },
      h('button', { type: 'button', class: 'btn btn-primary', onClick: (e) => copyText(url, e.currentTarget) }, 'Kopiuj link'),
      h('a', { class: 'btn btn-ghost', href: `sms:?&body=${encodeURIComponent(message)}` }, 'SMS'),
      h('a', { class: 'btn btn-ghost', href: `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent('Zaproszenie do panelu biura')}&body=${encodeURIComponent(message)}` }, 'E-mail'),
    )
  }

  function pendingCard(invites, officeName) {
    if (!invites.length) return null
    const now = new Date()
    return h(
      'section',
      { class: 'card' },
      h('h2', {}, 'Wysłane zaproszenia'),
      h('p', { class: 'small muted' }, 'Czekają, aż agent założy konto.'),
      h(
        'ul',
        { class: 'member-list' },
        invites.map((i) => {
          const expired = new Date(i.expires_at) < now
          return h(
            'li',
            { class: expired ? 'inactive' : '' },
            h('div', { class: 'member-top' }, h('strong', {}, i.full_name || i.email), h('span', { class: 'badge' }, expired ? 'Wygasło' : `do ${longDate(i.expires_at.slice(0, 10))}`)),
            i.full_name ? h('p', { class: 'small muted' }, i.email) : null,
            h(
              'div',
              { class: 'member-actions' },
              expired ? null : h('button', { type: 'button', class: 'link-btn small', onClick: (e) => copyText(inviteUrl(i.token), e.currentTarget) }, 'Kopiuj link'),
              expired ? null : h('a', { class: 'link-btn small', href: `sms:?&body=${encodeURIComponent(inviteMessage(i, officeName))}` }, 'SMS'),
              h(
                'button',
                {
                  type: 'button',
                  class: 'link-btn small danger-link',
                  onClick: async (e) => {
                    if (!expired && !confirm(`Anulować zaproszenie dla ${i.email}? Link przestanie działać.`)) return
                    e.target.disabled = true
                    const { error } = await supabase.from('office_invites').delete().eq('id', i.id)
                    if (error) {
                      console.error(error)
                      alert('Nie udało się usunąć zaproszenia.')
                      e.target.disabled = false
                      return
                    }
                    await load()
                  },
                },
                expired ? 'Usuń' : 'Anuluj',
              ),
            ),
          )
        }),
      ),
    )
  }

  await load()
  return [root]
}
