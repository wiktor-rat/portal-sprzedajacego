# Portal Sprzedającego — kontekst projektu

## Czym jest produkt
Portal dla właścicieli nieruchomości (sprzedających, później wynajmujących), którzy podpisali umowę na wyłączność z biurem nieruchomości. Właściciel widzi pod unikalnym linkiem (bez logowania), co agent robi z jego ofertą: działania, prezentacje, opinie kupujących, statystyki i wyniki kampanii reklamowej. Agent zyskuje wiarygodność i argument przy podpisywaniu wyłączności.

Właściciel produktu: Wiktor Rataj, LTTT MEDIA (agencja marketingowa dla biur nieruchomości w Polsce). Produkt będzie sprzedawany biurom jako dodatek do abonamentu (ok. 300–500 zł/mies.).

## Język
Cały interfejs po polsku. Komunikacja z Wiktorem po polsku, prostym językiem (nie jest programistą).

## Stack (ustalony)
- Frontend: Vite + vanilla JS (bez frameworka, chyba że będzie wyraźny powód)
- Baza i logowanie: Supabase, region Central EU (Frankfurt)
  - Project URL: https://gtwvmotvhxgmtkqprrcc.supabase.co
  - Klucz publiczny w zmiennej środowiskowej (nowy format `sb_publishable_...`)
- Hosting: Vercel, automatyczne wdrożenie z gałęzi `main`
- Repozytorium: github.com/wiktor-rat/portal-sprzedajacego

Zmienne środowiskowe (dokładnie te nazwy, Wiktor wpisuje je w Vercel):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Nigdy nie używaj ani nie proś o klucz `secret` / `service_role`.

## Dwa widoki
1. **Panel agenta** (`/`) — logowanie e-mail + hasło (Supabase Auth). Lista ofert, dodawanie oferty, szczegóły oferty:
   - dodaj prezentację: data, zainteresowanie (niskie/średnie/wysokie), odbiór ceny (za wysoka/adekwatna/okazja), komentarz kupującego bez danych osobowych, notatka wewnętrzna (niewidoczna dla właściciela); ma zajmować ok. 30 sekund na telefonie
   - dodaj działanie (podbicie ogłoszenia, dzień otwarty, nowe zdjęcia, wysyłka do bazy kupujących, rozmowa o cenie, inne) z notatką
   - statystyki tygodniowe: wyświetlenia, zapytania z portali, zapytania z kampanii, oferty kupna, zasięg i kliknięcia kampanii
   - pole „następny krok” widoczne dla właściciela
   - link dla właściciela z przyciskiem kopiuj i podgląd portalu
   - kiedy właściciel ostatnio otworzył portal (ostrzeżenie, jeśli dawno lub nigdy)
   - gotowy tekst raportu tygodniowego do skopiowania (SMS/e-mail)
2. **Portal właściciela** (`/o/<token>`) — tylko odczyt, bez logowania: nagłówek oferty i biura, licznik dni umowy na wyłączność, liczby (wyświetlenia, zapytania, prezentacje, oferty), wykres zapytań tygodniowo (portale vs kampania), blok kampanii reklamowej, oś czasu działań, opinie z prezentacji z podsumowaniem odbioru ceny, kontakt do agenta, następny krok.

Vercel musi przepisywać `/o/*` na stronę portalu (vercel.json rewrites).

## Bezpieczeństwo (kluczowe)
- Row Level Security na wszystkich tabelach: dane tylko w obrębie biura. Agent widzi i prowadzi tylko swoje oferty; właściciel biura (role = 'owner') widzi wszystkie oferty biura i może przypisać ofertę innemu agentowi. Konto z `active = false` nic nie widzi.
- Właściciel nie ma dostępu do tabel. Dane portalu pobiera wyłącznie funkcja `get_owner_portal(p_token, p_track)` (security definer), która zwraca tylko pola przeznaczone dla właściciela i zapisuje otwarcie portalu. Podgląd z panelu agenta wywołuje ją z `p_track = false`.
- Pole `buyer_label` (notatka wewnętrzna) nigdy nie trafia do portalu.
- Dane osobowe: biura muszą podpisać umowę powierzenia przed pilotem (poza kodem, ale nie dodawaj zbędnych danych osobowych).

Gotowy schemat bazy z RLS: `supabase/schema.sql` (do przejrzenia i uruchomienia przez Wiktora w Supabase SQL Editor). Nowe konto = nowe biuro + profil właściciela biura (trigger na auth.users, dane z `options.data` przy signUp: full_name, phone, office_name). Agenci dołączają przez zaproszenie: właściciel tworzy wpis w `office_invites`, wysyła link `/?zaproszenie=<token>`, agent zakłada konto z `invite_token` w `options.data` (e-mail musi się zgadzać). Dezaktywacja agenta: funkcja `set_member_active`. Zmiany w bazie = Wiktor uruchamia ponownie cały `schema.sql` (skrypt jest idempotentny).

## Wygląd
Prototyp referencyjny (klikalny, dane przykładowe): https://claude.ai/artifact/VPXx3Ru13xefJD4Dn4d8TY
Kierunek: spokojny, wiarygodny, „raport od profesjonalisty”. Głęboka zieleń jako akcent, mosiężny/ochrowy drugi kolor, ciepło-chłodne neutralne tło. Fonty: Familjen Grotesk (nagłówki), Figtree (tekst), IBM Plex Mono (liczby). Tryb jasny i ciemny. Mobile first — właściciele i agenci otwierają to głównie na telefonie.

## Sposób pracy
- Małe kroki, każdy kończy się działającą wersją wypchniętą na `main` (Vercel publikuje automatycznie).
- Po każdym kroku napisz Wiktorowi krótko: co działa, co ma przetestować, co ewentualnie musi kliknąć w Supabase/Vercel.
- Rzeczy, które Wiktor robi sam w panelach: uruchomienie SQL w Supabase, zmienne w Vercel, Site URL w Supabase (Authentication → URL Configuration) po pierwszym wdrożeniu.

## Kolejność budowy
1. Szkielet Vite + vercel.json + konfiguracja Supabase + README z instrukcją wdrożenia
2. Logowanie i rejestracja agenta
3. Oferty: lista, dodawanie, edycja
4. Prezentacje, działania, statystyki
5. Portal właściciela pod `/o/<token>`
6. Raport tygodniowy, informacja o otwarciach portalu
7. Później: wersja dla wynajmu, zapraszanie agentów do biura, branding biura (logo, kolor), automatyczne wyniki kampanii Meta

## Stan projektu (22.10.2026)
Kroki 1–6 gotowe, do tego menu boczne (Oferty / Zespół / Ustawienia), zapraszanie agentów, wgląd właściciela biura w oferty agentów. Kroki 1–6 i wdrożone na https://portal-sprzedajacego.vercel.app (Supabase: schemat uruchomiony, zmienne w Vercel, Site URL ustawiony, potwierdzanie e-maila wyłączone na czas budowy).

Struktura kodu (`src/`): `main.js` (logowanie + routing panelu po `#`), `auth.js`, `listings.js` (lista, formularz), `listing-detail.js` (szczegóły: prezentacje, działania, statystyki, link, raport), `report.js` (raport tygodniowy), `portal.js` + `portal.css` (portal właściciela), `domain.js` (słowniki, reguły), `format.js` (liczby i daty po polsku), `ui.js` (helpery DOM i formularzy), `team.js` (zespół, zaproszenia), `settings.js` (moje dane, biuro, hasło).

Przed pilotażem (Wiktor, w panelach): własny SMTP w Supabase + włączenie „Confirm email”, umowy powierzenia z biurami, opcjonalnie własna domena.
Następny krok w kodzie (do ustalenia): branding biura, wynajem, wyniki kampanii Meta, automatyczne powiadomienia dla właścicieli nieruchomości.
Decyzja: właściciel nieruchomości nie ma konta ani logowania — dostaje link (SMS/e-mail).
