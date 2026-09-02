# ORE

App per la timbratura ore dei dipendenti e il calcolo automatico degli stipendi. Due accessi separati nella stessa app: griglia dipendenti con PIN per timbrare i turni di oggi, e un'Area Titolare protetta da un codice a 6 cifre con dashboard, gestione dipendenti, richieste e riepiloghi. React + Vite, dati su Supabase, installabile come PWA da un semplice link.

## 1. Sviluppo locale

```bash
npm install
cp .env.example .env.local   # poi inserisci URL e anon key del tuo progetto Supabase
npm run dev
```

## 2. Creare il progetto Supabase

1. Vai su [supabase.com](https://supabase.com), crea un account gratuito e un nuovo progetto (scegli una regione vicina, es. Frankfurt).
2. Nel progetto, apri **SQL Editor** → **New query**, incolla tutto il contenuto di [`supabase/schema.sql`](./supabase/schema.sql) e premi **Run**. Questo crea le tabelle (`employees`, `shifts`, `payments`, `edit_requests`, `absence_requests`, `settings`), le policy di sicurezza, le funzioni RPC e il codice Titolare iniziale (`123456`). Il file è pensato per essere rieseguito in sicurezza: se lo lanci di nuovo su un progetto già impostato in precedenza (es. dopo un aggiornamento dell'app che aggiunge colonne o funzioni), non perdi i dati già presenti.
3. Vai su **Project Settings → API**: copia **Project URL** e la chiave **anon public**.
4. Incollali in `.env.local` (in locale) e più avanti nelle variabili d'ambiente di Vercel (vedi sotto).
5. **Appena l'app è online, vai in Area Titolare → icona ingranaggio e cambia subito il codice `123456` con uno tuo.**

Per aggiungere i primi dipendenti: Area Titolare (codice `123456` finché non lo cambi) → tab **Dipendenti** → **Nuovo dipendente**.

## 3. Pubblicare su Vercel (accesso via link, PWA)

1. Vai su [vercel.com](https://vercel.com) e accedi con GitHub.
2. **Add New → Project**, seleziona questo repository.
3. Vercel riconosce automaticamente Vite: lascia i comandi di default (`npm run build`, output `dist`).
4. In **Environment Variables** aggiungi:
   - `VITE_SUPABASE_URL` = il Project URL di Supabase
   - `VITE_SUPABASE_ANON_KEY` = la chiave anon public
5. Premi **Deploy**. Al termine ottieni un link pubblico (es. `https://tuoapp.vercel.app`).

Da quel link:
- i dipendenti aprono la home (`/`) e timbrano da lì;
- il Titolare apre `/titolare` (link raggiungibile anche dal pulsante "Area Titolare" in fondo alla home).

Su iPhone: Safari → icona Condividi → **Aggiungi a Home**. Su Android: Chrome → menu → **Installa app**. L'app si comporta come un'app installata (icona propria, schermo intero).

## 4. Come funziona

**Lato dipendente** (`/`): sceglie il proprio nome dalla griglia, inserisce il PIN a 4 cifre, vede solo i turni di oggi. Può registrare un nuovo turno (bloccato non appena salvato: non è più modificabile né cancellabile da lì), o toccare "Turno di un giorno passato": sceglie una data, e se quel giorno ha già un turno lo seleziona per correggerlo (motivo obbligatorio); se invece è vuoto (tipicamente tutti i giorni prima di iniziare a usare l'app) propone gli orari lavorati (nota facoltativa) — utile per compilare rapidamente lo storico arretrato. Entrambe restano "in attesa" finché il Titolare non decide; se accetta una proposta di giorno vuoto, il turno viene creato automaticamente. Può anche richiedere un'assenza (periodo, giornata intera o orari specifici, motivo facoltativo). Quando il Titolare accetta o rifiuta una richiesta, al successivo accesso col PIN il dipendente vede un avviso con l'esito e l'eventuale nota lasciata dal Titolare; una volta letto (pulsante "Ho capito") non ricompare più.

**Lato Titolare** (`/titolare`, codice a 6 cifre): tab **Richieste** (modifiche turno + assenze, con contatore, nota facoltativa e pulsanti accetta/rifiuta — la nota, se scritta, arriva al dipendente insieme all'esito), **Da pagare** (ore non ancora pagate per dipendente, calcolate dall'ultimo pagamento registrato in poi; "Segna come pagato" salva solo la data fino a cui si è pagato, non un elenco dettagliato), **Dipendenti** (nome, PIN, costo orario — mai visibile al dipendente — attivo/disattivato), **Turni** (apre, modifica o elimina qualsiasi turno di qualsiasi dipendente, anche passato, o ne aggiunge uno dimenticato), **Riepilogo** (vista mensile navigabile avanti/indietro, ore e costo per dipendente, resta consultabile anche dopo il pagamento, esportabile in PDF/Excel per singolo dipendente o aggregato).

Le ore vengono calcolate al minuto esatto (nessun arrotondamento). Le date "di oggi" e la soglia chiaro/scuro automatica usano sempre il fuso orario Europe/Rome, indipendentemente dal fuso del dispositivo.

## 5. Note sulla sicurezza dei PIN e del codice Titolare

Come nel progetto Scontrino, l'accesso è tramite PIN/codice condiviso (non ci sono account personali): pensato per un uso interno, non per dati sensibili di alto valore.

- PIN dei dipendenti, costo orario e codice Titolare non sono mai leggibili con una semplice query dal browser: la tabella `employees` non ha alcuna policy di lettura pubblica, la griglia dipendenti usa una vista (`employees_public`) che espone solo id e nome, e la verifica di PIN/codice avviene tramite funzioni del database (RPC) che restituiscono solo "corretto/sbagliato".
- Un turno salvato dal dipendente non ha una policy di modifica/cancellazione pubblica: il Titolare interviene solo tramite funzioni RPC dedicate (`admin_update_shift`, `admin_delete_shift`), così l'app stessa non può alterare un turno bloccato per errore.
- Le funzioni riservate al Titolare (gestione dipendenti, turni, richieste, pagamenti) sono comunque richiamabili da chiunque conosca l'URL pubblico del progetto Supabase: la protezione è a livello di interfaccia (serve comunque il codice a 6 cifre per raggiungere quegli schermi), non un vero controllo di accesso lato database.

Per un livello di sicurezza più alto (account personali, permessi differenziati) servirebbe integrare Supabase Auth: è un'estensione possibile in futuro, non necessaria per l'uso interno attuale.

## Struttura del progetto

- `src/App.jsx` — instradamento minimale tra `/` (dipendente) e `/titolare` (Titolare).
- `src/pages/EmployeeSide.jsx` — griglia, PIN, turni di oggi, richieste.
- `src/pages/OwnerSide.jsx` — login Titolare, tab della dashboard.
- `src/components/owner/` — Dipendenti, Turni, Richieste, Da pagare, Riepilogo mensile.
- `src/context/ThemeContext.jsx` — tema chiaro/scuro automatico (fuso Europe/Rome) + override manuale.
- `src/lib/api.js` — tutte le letture/scritture verso Supabase.
- `src/lib/time.js` — date/ore sempre in fuso Europe/Rome, formattazioni.
- `src/lib/export.js` — esportazione riepiloghi in PDF/Excel.
- `supabase/schema.sql` — schema del database da eseguire una sola volta su Supabase.
