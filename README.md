# Portal Sprzedającego

Portal dla właścicieli nieruchomości z umową na wyłączność: pod unikalnym linkiem widzą, co agent robi z ich ofertą.

- `/` — panel agenta (logowanie e-mail + hasło)
- `/o/<token>` — portal właściciela (tylko odczyt, bez logowania)

Technologia: Vite + zwykły JavaScript, baza i logowanie w Supabase, hosting na Vercel. Szczegóły produktu: [CLAUDE.md](CLAUDE.md).

## Pierwsze wdrożenie (jednorazowo)

### 1. Supabase: baza danych

1. Wejdź na [supabase.com/dashboard](https://supabase.com/dashboard) i otwórz projekt (region Frankfurt).
2. Po lewej: **SQL Editor** → **New query**.
3. Otwórz plik [`supabase/schema.sql`](supabase/schema.sql), skopiuj całą zawartość, wklej i kliknij **Run**.
4. Powinien pojawić się komunikat „Success. No rows returned”. Skrypt można bezpiecznie uruchomić ponownie, nie kasuje danych.

### 2. Supabase: klucz publiczny

1. **Project Settings** (zębatka) → **API Keys**.
2. Skopiuj klucz **Publishable key** (zaczyna się od `sb_publishable_`).
3. **Nie kopiuj** klucza „Secret key” (`sb_secret_...`). Nie trafia on nigdzie w tym projekcie.

### 3. Vercel: projekt i zmienne

1. Wejdź na [vercel.com/new](https://vercel.com/new) → **Import** przy repozytorium `wiktor-rat/portal-sprzedajacego`.
2. Framework: Vercel sam rozpozna **Vite**. Nic nie zmieniaj w ustawieniach budowania.
3. Rozwiń **Environment Variables** i dodaj dwie zmienne:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | `https://gtwvmotvhxgmtkqprrcc.supabase.co` |
   | `VITE_SUPABASE_PUBLISHABLE_KEY` | klucz `sb_publishable_...` z kroku 2 |

4. Kliknij **Deploy**. Po ok. minucie dostaniesz adres strony, np. `https://portal-sprzedajacego.vercel.app`.

Jeśli zmienne dodasz albo zmienisz później: **Settings → Environment Variables**, a potem **Deployments** → przy ostatnim wdrożeniu **⋯ → Redeploy**. Zmienne działają dopiero po ponownym wdrożeniu.

### 4. Supabase: adres strony (po pierwszym wdrożeniu)

1. **Authentication** → **URL Configuration**.
2. **Site URL**: wpisz adres z Vercel (np. `https://portal-sprzedajacego.vercel.app`) → **Save**.
3. **Redirect URLs** → **Add URL**: ten sam adres z `/**` na końcu (np. `https://portal-sprzedajacego.vercel.app/**`).

Dzięki temu linki w e-mailach (potwierdzenie konta, reset hasła) prowadzą do aplikacji, a nie na `localhost`.

### Logowanie: potwierdzanie e-maila

Na czas budowy potwierdzanie e-maila jest wyłączone (**Authentication → Sign In / Providers → Email → Confirm email**: wyłączone), więc konto działa od razu po rejestracji. Przed pilotażem z biurami: włączyć je i podpiąć własny serwer pocztowy (**Authentication → Emails → SMTP Settings**). Wbudowana poczta Supabase wysyła tylko kilka maili na godzinę i tylko do członków zespołu projektu.

### 5. Sprawdzenie

Otwórz adres z Vercel. Powinien pojawić się ekran **„Zaloguj się”**. Kliknij **„Załóż konto biura”**, wypełnij formularz, a po rejestracji zobaczysz powitanie z nazwą biura.

| Komunikat | Co zrobić |
| --- | --- |
| „Brak konfiguracji” / brak zmiennych `VITE_SUPABASE_URL`… | Dodaj zmienne w Vercel i zrób Redeploy (krok 3) |
| „Nie udało się wczytać konta” po rejestracji | Uruchom `schema.sql` w SQL Editor (krok 1) |
| „Coś poszło nie tak” przy logowaniu | Sprawdź, czy klucz `sb_publishable_...` w Vercel jest wklejony w całości |

Adres `https://<twoja-domena>/o/test` powinien pokazać „Link jest nieaktywny”. To znaczy, że przekierowanie portalu właściciela działa.

## Kolejne wdrożenia

Każda zmiana wypchnięta na gałąź `main` publikuje się na Vercel automatycznie.

### Aktualizacja bazy danych

Gdy zmieni się `supabase/schema.sql`, uruchom go ponownie w całości (**SQL Editor → New query → wklej całość → Run**). Skrypt jest bezpieczny do ponownego uruchomienia: dodaje brakujące elementy, nie kasuje danych.

## Praca na własnym komputerze (opcjonalnie)

Wymagany Node.js 20.19 lub nowszy.

```bash
npm install
cp .env.example .env.local   # i wpisz prawdziwy klucz publiczny
npm run dev                  # http://localhost:5173
```

## Bezpieczeństwo w skrócie

- Row Level Security na wszystkich tabelach: agent widzi tylko dane swojego biura.
- Właściciel nie ma dostępu do tabel. Portal pobiera dane tylko przez funkcję `get_owner_portal`, która zwraca wyłącznie pola przeznaczone dla właściciela (bez notatek wewnętrznych).
- W aplikacji jest wyłącznie klucz publiczny. Klucz sekretny nie jest potrzebny.
