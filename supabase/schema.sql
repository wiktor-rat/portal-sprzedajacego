-- Portal Sprzedającego — schemat bazy danych (Supabase / PostgreSQL)
-- Uruchom raz w Supabase: SQL Editor → New query → wklej całość → Run.
-- Skrypt można bezpiecznie uruchomić ponownie (nie kasuje danych).

------------------------------------------------------------
-- TABELE
------------------------------------------------------------

create table if not exists public.offices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  office_id uuid not null references public.offices(id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  role text not null default 'agent' check (role in ('owner', 'agent')),
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  office_id uuid not null references public.offices(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete restrict,
  title text not null,
  address text not null default '',
  price numeric(14, 2) check (price is null or price >= 0),
  area_m2 numeric(8, 2) check (area_m2 is null or area_m2 > 0),
  deal_type text not null default 'sale' check (deal_type in ('sale', 'rent')),
  exclusive_from date,
  exclusive_to date,
  status text not null default 'active' check (status in ('active', 'reserved', 'sold', 'withdrawn')),
  next_step text not null default '',
  owner_token text not null unique default replace(gen_random_uuid()::text, '-', '')
    check (length(owner_token) >= 32),
  created_at timestamptz not null default now(),
  check (exclusive_to is null or exclusive_from is null or exclusive_to >= exclusive_from)
);

-- Prezentacje i działania agenta (oś czasu właściciela)
create table if not exists public.listing_events (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  kind text not null check (kind in ('presentation', 'action')),
  -- rodzaj działania (tylko dla kind = 'action')
  action_type text check (action_type in ('bump', 'open_day', 'new_photos', 'buyer_mailing', 'price_talk', 'other')),
  event_date date not null default current_date,
  title text not null,
  note text not null default '',          -- widoczne dla właściciela (np. komentarz kupującego, bez danych osobowych)
  interest text check (interest in ('low', 'medium', 'high')),
  price_feedback text check (price_feedback in ('too_high', 'fair', 'bargain')),
  buyer_label text not null default '',   -- notatka wewnętrzna, właściciel jej nie widzi
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- ocena zainteresowania i ceny ma sens tylko przy prezentacji, rodzaj działania tylko przy działaniu
  check (kind = 'presentation' or (interest is null and price_feedback is null)),
  check (kind = 'action' or action_type is null)
);

-- Statystyki tygodniowe wpisywane przez agenta
create table if not exists public.listing_stats (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  period_start date not null,
  views int not null default 0 check (views >= 0),
  inquiries_portal int not null default 0 check (inquiries_portal >= 0),
  inquiries_campaign int not null default 0 check (inquiries_campaign >= 0),
  offers int not null default 0 check (offers >= 0),
  campaign_reach int not null default 0 check (campaign_reach >= 0),
  campaign_clicks int not null default 0 check (campaign_clicks >= 0),
  created_at timestamptz not null default now(),
  unique (listing_id, period_start)
);

-- Kiedy właściciel otwierał swój portal
create table if not exists public.portal_opens (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.listings(id) on delete cascade,
  opened_at timestamptz not null default now()
);

create index if not exists profiles_office_idx on public.profiles(office_id);
create index if not exists listings_office_idx on public.listings(office_id);
create index if not exists listings_agent_idx on public.listings(agent_id);
create index if not exists events_listing_idx on public.listing_events(listing_id, event_date desc);
create index if not exists events_created_by_idx on public.listing_events(created_by);
-- unique (listing_id, period_start) już tworzy indeks dla statystyk
create index if not exists opens_listing_idx on public.portal_opens(listing_id, opened_at desc);

------------------------------------------------------------
-- POMOCNICZE
------------------------------------------------------------

create or replace function public.my_office_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select office_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_office_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select role = 'owner' from public.profiles where id = auth.uid()), false)
$$;

-- Domyślne wartości: nowa oferta trafia do biura zalogowanego agenta i jest do niego przypisana
alter table public.listings alter column office_id set default public.my_office_id();
alter table public.listings alter column agent_id set default auth.uid();

-- Nowe konto = nowe biuro + profil właściciela biura
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_office uuid;
begin
  insert into public.offices(name)
  values (coalesce(nullif(trim(new.raw_user_meta_data->>'office_name'), ''), 'Moje biuro'))
  returning id into v_office;

  insert into public.profiles(id, office_id, full_name, phone, role)
  values (
    new.id, v_office,
    coalesce(trim(new.raw_user_meta_data->>'full_name'), ''),
    coalesce(trim(new.raw_user_meta_data->>'phone'), ''),
    'owner'
  );
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

------------------------------------------------------------
-- UPRAWNIENIA
-- Jawne nadanie uprawnień (nie polegamy na domyślnych ustawieniach projektu).
-- Rola anon (niezalogowany) nie ma dostępu do żadnej tabeli.
------------------------------------------------------------

revoke all on public.offices, public.profiles, public.listings,
  public.listing_events, public.listing_stats, public.portal_opens from anon, authenticated;

grant select on public.offices, public.profiles, public.portal_opens to authenticated;
grant select, insert, update, delete on public.listings, public.listing_events, public.listing_stats to authenticated;
-- biuro: można zmienić tylko nazwę
grant update (name) on public.offices to authenticated;
-- profil: agent może zmienić tylko imię i telefon (nie biuro ani rolę)
grant update (full_name, phone) on public.profiles to authenticated;

------------------------------------------------------------
-- ZABEZPIECZENIA (Row Level Security)
-- Agent widzi wyłącznie dane swojego biura.
-- Właściciel nieruchomości nie ma dostępu do tabel, tylko do funkcji portalu.
-- (select ...) wokół funkcji = Postgres liczy ją raz na zapytanie, nie dla każdego wiersza.
------------------------------------------------------------

alter table public.offices enable row level security;
alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.listing_events enable row level security;
alter table public.listing_stats enable row level security;
alter table public.portal_opens enable row level security;

drop policy if exists offices_select on public.offices;
create policy offices_select on public.offices for select to authenticated
  using (id = (select public.my_office_id()));
-- nazwę biura zmienia tylko właściciel biura
drop policy if exists offices_update on public.offices;
create policy offices_update on public.offices for update to authenticated
  using (id = (select public.my_office_id()) and (select public.is_office_owner()))
  with check (id = (select public.my_office_id()));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (office_id = (select public.my_office_id()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists listings_all on public.listings;
create policy listings_all on public.listings for all to authenticated
  using (office_id = (select public.my_office_id()))
  with check (
    office_id = (select public.my_office_id())
    and exists (select 1 from public.profiles p where p.id = agent_id and p.office_id = (select public.my_office_id()))
  );

drop policy if exists events_all on public.listing_events;
create policy events_all on public.listing_events for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.office_id = (select public.my_office_id())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.office_id = (select public.my_office_id())));

drop policy if exists stats_all on public.listing_stats;
create policy stats_all on public.listing_stats for all to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.office_id = (select public.my_office_id())))
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.office_id = (select public.my_office_id())));

drop policy if exists opens_select on public.portal_opens;
create policy opens_select on public.portal_opens for select to authenticated
  using (exists (select 1 from public.listings l where l.id = listing_id and l.office_id = (select public.my_office_id())));

------------------------------------------------------------
-- PORTAL WŁAŚCICIELA (dostęp przez unikalny link, bez logowania)
------------------------------------------------------------

create or replace function public.get_owner_portal(p_token text, p_track boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public
as $$
declare
  l public.listings;
  result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into l from public.listings where owner_token = p_token;
  if not found then
    return null;
  end if;

  if p_track then
    insert into public.portal_opens(listing_id) values (l.id);
  end if;

  select jsonb_build_object(
    'listing', jsonb_build_object(
      'title', l.title, 'address', l.address, 'price', l.price, 'area_m2', l.area_m2,
      'deal_type', l.deal_type, 'exclusive_from', l.exclusive_from, 'exclusive_to', l.exclusive_to,
      'status', l.status, 'next_step', l.next_step
    ),
    'office', (select jsonb_build_object('name', o.name) from public.offices o where o.id = l.office_id),
    'agent', (select jsonb_build_object('full_name', p.full_name, 'phone', p.phone) from public.profiles p where p.id = l.agent_id),
    -- buyer_label (notatka wewnętrzna) celowo NIE jest tu zwracane
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', e.kind, 'action_type', e.action_type, 'date', e.event_date, 'title', e.title, 'note', e.note,
        'interest', e.interest, 'price_feedback', e.price_feedback
      ) order by e.event_date desc, e.created_at desc)
      from public.listing_events e where e.listing_id = l.id
    ), '[]'::jsonb),
    'stats', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period_start', s.period_start, 'views', s.views,
        'inquiries_portal', s.inquiries_portal, 'inquiries_campaign', s.inquiries_campaign,
        'offers', s.offers, 'campaign_reach', s.campaign_reach, 'campaign_clicks', s.campaign_clicks
      ) order by s.period_start)
      from public.listing_stats s where s.listing_id = l.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end
$$;

revoke all on function public.get_owner_portal(text, boolean) from public, anon, authenticated;
grant execute on function public.get_owner_portal(text, boolean) to anon, authenticated;

revoke all on function public.my_office_id() from public, anon, authenticated;
grant execute on function public.my_office_id() to authenticated;
revoke all on function public.is_office_owner() from public, anon, authenticated;
grant execute on function public.is_office_owner() to authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
