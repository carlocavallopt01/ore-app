-- Schema per l'app ORE (timbratura ore dipendenti + calcolo stipendi).
-- Incollare per intero in Supabase -> SQL Editor -> Run.
--
-- Modello di sicurezza: come in Scontrino, non ci sono account personali,
-- solo un PIN a 4 cifre per dipendente + un codice a 6 cifre per il
-- Titolare. Per evitare che PIN, costo orario e codice Titolare vengano
-- letti in chiaro da chiunque apra l'app:
--   - la tabella employees NON è mai leggibile direttamente (niente SELECT
--     per anon): esiste una vista pubblica senza pin/hourly_rate per la
--     griglia dipendenti, e una funzione RPC riservata al Titolare per la
--     gestione completa;
--   - i PIN si verificano solo tramite RPC che restituiscono true/false;
--   - i turni, una volta salvati, non hanno una policy UPDATE/DELETE per
--     anon: la modifica/cancellazione passa solo da funzioni RPC "admin_*",
--     così un client onesto (l'app stessa) non può nemmeno per errore
--     modificare un turno bloccato lato dipendente.
-- Non è sicurezza "bancaria" (chi conosce URL e chiave pubblica del
-- progetto e legge questo file può comunque chiamare le stesse funzioni
-- RPC): per un livello più alto servirebbe Supabase Auth, estensione
-- possibile in futuro ma non necessaria per l'uso interno attuale.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Tabella dipendenti
-- ---------------------------------------------------------------------
-- payday: giorno del mese previsto per il pagamento (1-31), oppure 0 per
-- "fine mese" (l'app calcola l'ultimo giorno del mese, con clamp se il
-- numero scelto supera i giorni del mese, es. 31 in un mese da 30). Solo
-- informativo/promemoria: non influenza il calcolo delle ore da pagare.
-- email: facoltativa, serve solo per mandare al dipendente l'esito delle
-- sue richieste (accettata/rifiutata). Se lasciata vuota, quel dipendente
-- continua a vedere l'esito solo in-app al prossimo accesso col PIN.
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  pin text not null check (pin ~ '^[0-9]{4}$'),
  hourly_rate numeric not null default 0 check (hourly_rate >= 0),
  payday int check (payday is null or (payday >= 0 and payday <= 31)),
  email text,
  attivo boolean not null default true,
  created_at timestamptz not null default now()
);

alter table employees add column if not exists payday int;
alter table employees drop constraint if exists employees_payday_check;
alter table employees add constraint employees_payday_check check (payday is null or (payday >= 0 and payday <= 31));
alter table employees add column if not exists email text;

-- PIN univoco solo tra i dipendenti attivi: un dipendente disattivato
-- libera il proprio PIN per il riutilizzo.
create unique index if not exists employees_active_pin_idx
  on employees (pin) where attivo;

alter table employees enable row level security;
-- Nessuna policy per anon sulla tabella base: pin e hourly_rate non sono
-- mai leggibili/scrivibili con una query diretta, solo tramite le
-- funzioni RPC qui sotto.

create or replace view employees_public as
  select id, nome from employees where attivo = true order by nome;

grant select on employees_public to anon;

-- ---------------------------------------------------------------------
-- Tabella turni
-- ---------------------------------------------------------------------
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  locked boolean not null default true,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists shifts_employee_date_idx on shifts (employee_id, date);
create index if not exists shifts_date_idx on shifts (date);

alter table shifts enable row level security;

-- Lettura: serve sia al dipendente (turni di oggi) sia al Titolare
-- (storico completo, riepiloghi).
drop policy if exists "shifts anon select" on shifts;
create policy "shifts anon select" on shifts
  for select to anon using (true);

-- Inserimento: sia il dipendente (nuovo turno di oggi) sia il Titolare
-- (turno dimenticato su data passata) creano righe allo stesso modo.
drop policy if exists "shifts anon insert" on shifts;
create policy "shifts anon insert" on shifts
  for insert to anon with check (true);

-- Nessuna policy UPDATE/DELETE per anon: un turno salvato è bloccato per
-- il dipendente. Il Titolare modifica/elimina solo tramite le funzioni
-- admin_update_shift / admin_delete_shift qui sotto.

-- ---------------------------------------------------------------------
-- Tabella pagamenti ("pagato fino al ...", non un elenco per turno)
-- ---------------------------------------------------------------------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date_to date not null,
  paid_at timestamptz not null default now()
);

create index if not exists payments_employee_idx on payments (employee_id, date_to desc);

alter table payments enable row level security;

drop policy if exists "payments anon select" on payments;
create policy "payments anon select" on payments
  for select to anon using (true);

-- Nessuna policy INSERT per anon: si registra un pagamento solo tramite
-- la funzione mark_paid, riservata alla schermata Titolare.

-- ---------------------------------------------------------------------
-- Richieste di modifica turno
-- ---------------------------------------------------------------------
-- shift_id è nullable: una richiesta può riferirsi a un turno già
-- esistente (correzione, shift_id valorizzato) oppure a un giorno passato
-- senza ancora nessun turno registrato (proposed_date/start/end
-- valorizzati, shift_id nullo) — usata dal dipendente per dichiarare ore
-- già lavorate prima di iniziare a usare l'app. All'accettazione di una
-- richiesta del secondo tipo, il turno viene creato automaticamente.
create table if not exists edit_requests (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid references shifts(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  motivo text,
  proposed_date date,
  proposed_start_time time,
  proposed_end_time time,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'accettata', 'rifiutata')),
  created_at timestamptz not null default now(),
  risolta_at timestamptz,
  risposta text,
  vista boolean not null default false
);

-- Eseguendo di nuovo questo file su un database già creato in precedenza,
-- queste ALTER aggiungono le colonne mancanti senza toccare i dati
-- esistenti (tutte le richieste già presenti restano valide: hanno
-- shift_id valorizzato, quindi soddisfano comunque il vincolo sotto).
alter table edit_requests add column if not exists risposta text;
alter table edit_requests add column if not exists vista boolean not null default false;
alter table edit_requests add column if not exists proposed_date date;
alter table edit_requests add column if not exists proposed_start_time time;
alter table edit_requests add column if not exists proposed_end_time time;
alter table edit_requests alter column shift_id drop not null;
alter table edit_requests alter column motivo drop not null;

alter table edit_requests drop constraint if exists edit_requests_shift_or_proposal;
alter table edit_requests add constraint edit_requests_shift_or_proposal check (
  shift_id is not null
  or (proposed_date is not null and proposed_start_time is not null and proposed_end_time is not null)
);

create index if not exists edit_requests_stato_idx on edit_requests (stato);

alter table edit_requests enable row level security;

drop policy if exists "edit_requests anon select" on edit_requests;
create policy "edit_requests anon select" on edit_requests
  for select to anon using (true);

drop policy if exists "edit_requests anon insert" on edit_requests;
create policy "edit_requests anon insert" on edit_requests
  for insert to anon with check (stato = 'in_attesa' and risolta_at is null);

-- Nessuna policy UPDATE per anon: si accetta/rifiuta solo tramite la
-- funzione resolve_edit_request (schermata Titolare).

-- ---------------------------------------------------------------------
-- Richieste di assenza
-- ---------------------------------------------------------------------
create table if not exists absence_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date_from date not null,
  date_to date not null,
  intera_giornata boolean not null default true,
  time_from time,
  time_to time,
  motivo text,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'accettata', 'rifiutata')),
  created_at timestamptz not null default now(),
  risolta_at timestamptz,
  risposta text,
  vista boolean not null default false,
  check (date_to >= date_from),
  check (
    (intera_giornata and time_from is null and time_to is null)
    or (not intera_giornata and time_from is not null and time_to is not null and time_to > time_from)
  )
);

alter table absence_requests add column if not exists risposta text;
alter table absence_requests add column if not exists vista boolean not null default false;

create index if not exists absence_requests_stato_idx on absence_requests (stato);

alter table absence_requests enable row level security;

drop policy if exists "absence_requests anon select" on absence_requests;
create policy "absence_requests anon select" on absence_requests
  for select to anon using (true);

drop policy if exists "absence_requests anon insert" on absence_requests;
create policy "absence_requests anon insert" on absence_requests
  for insert to anon with check (stato = 'in_attesa' and risolta_at is null);

-- Nessuna policy UPDATE per anon: si accetta/rifiuta solo tramite la
-- funzione resolve_absence_request (schermata Titolare).

-- ---------------------------------------------------------------------
-- Tabella impostazioni (codice Titolare)
-- ---------------------------------------------------------------------
create table if not exists settings (
  key text primary key,
  value jsonb not null
);

alter table settings enable row level security;
-- Nessuna policy per anon: il codice Titolare si verifica/imposta solo
-- tramite le funzioni verify_owner_code / set_owner_code.

-- ---------------------------------------------------------------------
-- Funzioni RPC: PIN dipendente e codice Titolare
-- ---------------------------------------------------------------------
create or replace function verify_employee_pin(p_employee_id uuid, p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from employees
    where id = p_employee_id and pin = p_pin and attivo = true
  );
$$;
grant execute on function verify_employee_pin(uuid, text) to anon;

create or replace function verify_owner_code(p_code text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from settings where key = 'owner_code' and value->>'code' = p_code
  );
$$;
grant execute on function verify_owner_code(text) to anon;

create or replace function set_owner_code(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_code !~ '^[0-9]{6}$' then
    raise exception 'Il codice Titolare deve avere esattamente 6 cifre';
  end if;
  insert into settings (key, value) values ('owner_code', jsonb_build_object('code', p_code))
  on conflict (key) do update set value = excluded.value;
end;
$$;
grant execute on function set_owner_code(text) to anon;

-- ---------------------------------------------------------------------
-- Funzioni RPC: gestione dipendenti (riservate alla schermata Titolare,
-- protetta a livello di interfaccia dal codice a 6 cifre)
-- ---------------------------------------------------------------------
create or replace function get_employees_admin()
returns setof employees
language sql
security definer
set search_path = public
as $$
  select * from employees order by attivo desc, nome;
$$;
grant execute on function get_employees_admin() to anon;

-- Firma precedente (senza giorno di paga): rimossa per evitare ambiguità
-- con quella nuova a 6 argomenti, che ha un default sull'ultimo.
drop function if exists admin_save_employee(uuid, text, text, numeric, boolean);
drop function if exists admin_save_employee(uuid, text, text, numeric, boolean, int);

create or replace function admin_save_employee(
  p_id uuid,
  p_nome text,
  p_pin text,
  p_hourly_rate numeric,
  p_attivo boolean,
  p_payday int default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_id is null then
    insert into employees (nome, pin, hourly_rate, attivo, payday, email)
    values (trim(p_nome), p_pin, p_hourly_rate, p_attivo, p_payday, nullif(trim(coalesce(p_email, '')), ''))
    returning id into v_id;
  else
    update employees
      set nome = trim(p_nome), pin = p_pin, hourly_rate = p_hourly_rate, attivo = p_attivo, payday = p_payday,
          email = nullif(trim(coalesce(p_email, '')), '')
      where id = p_id
      returning id into v_id;
  end if;
  return v_id;
end;
$$;
grant execute on function admin_save_employee(uuid, text, text, numeric, boolean, int, text) to anon;

-- ---------------------------------------------------------------------
-- Funzioni RPC: gestione turni da parte del Titolare
-- ---------------------------------------------------------------------
create or replace function admin_update_shift(
  p_shift_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_end_time <= p_start_time then
    raise exception 'L''orario di uscita deve essere dopo quello di entrata';
  end if;
  update shifts set date = p_date, start_time = p_start_time, end_time = p_end_time
    where id = p_shift_id;
end;
$$;
grant execute on function admin_update_shift(uuid, date, time, time) to anon;

create or replace function admin_delete_shift(p_shift_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from shifts where id = p_shift_id;
$$;
grant execute on function admin_delete_shift(uuid) to anon;

-- ---------------------------------------------------------------------
-- Funzioni RPC: risoluzione richieste (con nota facoltativa del Titolare,
-- che il dipendente vede al prossimo accesso col PIN) e conferma di
-- lettura da parte del dipendente.
-- ---------------------------------------------------------------------
-- Rimuove la vecchia firma a 2 argomenti se presente da un'installazione
-- precedente, per evitare ambiguità con la nuova a 3 argomenti (la terza,
-- p_risposta, ha un default e resterebbe altrimenti "nascosta" dietro la
-- firma più vecchia).
drop function if exists resolve_edit_request(uuid, boolean);
drop function if exists resolve_absence_request(uuid, boolean);

-- Se la richiesta accettata è una proposta di nuovo turno (shift_id nullo,
-- giorno passato senza turno esistente), accettarla crea automaticamente
-- il turno con i dati proposti dal dipendente.
create or replace function resolve_edit_request(p_id uuid, p_accetta boolean, p_risposta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id uuid;
  v_employee_id uuid;
  v_proposed_date date;
  v_proposed_start time;
  v_proposed_end time;
begin
  select shift_id, employee_id, proposed_date, proposed_start_time, proposed_end_time
    into v_shift_id, v_employee_id, v_proposed_date, v_proposed_start, v_proposed_end
    from edit_requests
    where id = p_id and stato = 'in_attesa'
    for update;

  if not found then
    return;
  end if;

  if p_accetta and v_shift_id is null then
    insert into shifts (employee_id, date, start_time, end_time, locked)
    values (v_employee_id, v_proposed_date, v_proposed_start, v_proposed_end, true);
  end if;

  update edit_requests
    set stato = case when p_accetta then 'accettata' else 'rifiutata' end,
        risolta_at = now(),
        risposta = p_risposta,
        vista = false
    where id = p_id;
end;
$$;
grant execute on function resolve_edit_request(uuid, boolean, text) to anon;

create or replace function resolve_absence_request(p_id uuid, p_accetta boolean, p_risposta text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update absence_requests
    set stato = case when p_accetta then 'accettata' else 'rifiutata' end,
        risolta_at = now(),
        risposta = p_risposta,
        vista = false
    where id = p_id and stato = 'in_attesa';
$$;
grant execute on function resolve_absence_request(uuid, boolean, text) to anon;

create or replace function mark_edit_request_seen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update edit_requests set vista = true where id = p_id;
$$;
grant execute on function mark_edit_request_seen(uuid) to anon;

create or replace function mark_absence_request_seen(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update absence_requests set vista = true where id = p_id;
$$;
grant execute on function mark_absence_request_seen(uuid) to anon;

-- ---------------------------------------------------------------------
-- Funzioni RPC: pagamenti e riepiloghi (calcolo al minuto esatto)
-- ---------------------------------------------------------------------
create or replace function mark_paid(p_employee_id uuid, p_date_to date)
returns void
language sql
security definer
set search_path = public
as $$
  insert into payments (employee_id, date_to) values (p_employee_id, p_date_to);
$$;
grant execute on function mark_paid(uuid, date) to anon;

-- Annulla un pagamento registrato per errore: le ore fino a quella data
-- tornano subito a comparire in "Da pagare" (il calcolo si basa sempre
-- sull'ultimo pagamento rimasto).
create or replace function admin_delete_payment(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from payments where id = p_id;
$$;
grant execute on function admin_delete_payment(uuid) to anon;

-- Corregge la data di un pagamento già registrato, senza doverlo prima
-- annullare e poi rifare da capo.
create or replace function admin_update_payment(p_id uuid, p_date_to date)
returns void
language sql
security definer
set search_path = public
as $$
  update payments set date_to = p_date_to where id = p_id;
$$;
grant execute on function admin_update_payment(uuid, date) to anon;

-- Ore/costo non ancora pagati per ogni dipendente attivo, calcolati dal
-- giorno successivo all'ultimo pagamento registrato (o da sempre, se il
-- dipendente non è mai stato pagato).
-- Cambiare le colonne restituite richiede di eliminare prima la funzione
-- esistente (CREATE OR REPLACE non permette di cambiare il RETURNS TABLE).
drop function if exists get_pending_hours();

create or replace function get_pending_hours()
returns table (
  employee_id uuid,
  nome text,
  hourly_rate numeric,
  payday int,
  from_date date,
  total_minutes bigint,
  total_hours numeric,
  total_cost numeric
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.nome,
    e.hourly_rate,
    e.payday,
    p.last_paid,
    coalesce(sum(extract(epoch from (s.end_time - s.start_time)) / 60), 0)::bigint,
    round(coalesce(sum(extract(epoch from (s.end_time - s.start_time)) / 60), 0) / 60.0, 2),
    round(coalesce(sum(extract(epoch from (s.end_time - s.start_time)) / 60), 0) / 60.0 * e.hourly_rate, 2)
  from employees e
  left join lateral (
    select max(date_to) as last_paid from payments where payments.employee_id = e.id
  ) p on true
  left join shifts s
    on s.employee_id = e.id
    and (p.last_paid is null or s.date > p.last_paid)
  where e.attivo = true
  group by e.id, e.nome, e.hourly_rate, e.payday, p.last_paid
  order by e.nome;
$$;
grant execute on function get_pending_hours() to anon;

-- Riepilogo mensile per ogni dipendente con almeno un turno nel mese
-- indicato (resta consultabile anche dopo che le ore sono state pagate,
-- e include anche i dipendenti nel frattempo disattivati).
create or replace function get_monthly_summary(p_year int, p_month int)
returns table (
  employee_id uuid,
  nome text,
  attivo boolean,
  hourly_rate numeric,
  total_minutes bigint,
  total_hours numeric,
  total_cost numeric,
  shift_count bigint
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.nome,
    e.attivo,
    e.hourly_rate,
    sum(extract(epoch from (s.end_time - s.start_time)) / 60)::bigint,
    round(sum(extract(epoch from (s.end_time - s.start_time)) / 60) / 60.0, 2),
    round(sum(extract(epoch from (s.end_time - s.start_time)) / 60) / 60.0 * e.hourly_rate, 2),
    count(s.id)
  from employees e
  join shifts s on s.employee_id = e.id
  where s.date >= make_date(p_year, p_month, 1)
    and s.date < (make_date(p_year, p_month, 1) + interval '1 month')::date
  group by e.id, e.nome, e.attivo, e.hourly_rate
  order by e.nome;
$$;
grant execute on function get_monthly_summary(int, int) to anon;

-- ---------------------------------------------------------------------
-- Notifiche email al Titolare per le nuove richieste (facoltativo:
-- funziona solo se email e chiave Resend sono impostate dalle
-- Impostazioni; altrimenti le funzioni sotto non fanno nulla).
-- Invio tramite Resend (resend.com) via l'estensione pg_net, già
-- disponibile su Supabase: una singola chiamata HTTP asincrona, che non
-- blocca né fa fallire la richiesta del dipendente se non è configurata
-- o se l'invio fallisce.
-- ---------------------------------------------------------------------
create extension if not exists pg_net;

create or replace function set_notification_email(p_email text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into settings (key, value) values ('notification_email', jsonb_build_object('email', p_email))
  on conflict (key) do update set value = excluded.value;
$$;
grant execute on function set_notification_email(text) to anon;

create or replace function get_notification_email()
returns text
language sql
security definer
set search_path = public
as $$
  select value->>'email' from settings where key = 'notification_email';
$$;
grant execute on function get_notification_email() to anon;

-- La chiave Resend è scrivibile ma mai restituita in chiaro: solo
-- has_resend_api_key() dice se risulta impostata (stesso principio dei
-- PIN e del codice Titolare).
create or replace function set_resend_api_key(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into settings (key, value) values ('resend_api_key', jsonb_build_object('key', p_key))
  on conflict (key) do update set value = excluded.value;
$$;
grant execute on function set_resend_api_key(text) to anon;

create or replace function has_resend_api_key()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from settings where key = 'resend_api_key' and coalesce(value->>'key', '') != ''
  );
$$;
grant execute on function has_resend_api_key() to anon;

-- Mittente sul dominio verificato su Resend. Se in futuro cambi dominio,
-- basta rieseguire questo file dopo aver modificato la riga qui sotto.
-- Invio generico: usato sia per notificare il Titolare sia per
-- notificare un dipendente. Fire-and-forget, non fa mai fallire chi lo
-- chiama (richiesta del dipendente o risoluzione del Titolare).
create or replace function send_email(p_to text, p_subject text, p_html text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  select value->>'key' into v_key from settings where key = 'resend_api_key';
  if coalesce(v_key, '') = '' or coalesce(p_to, '') = '' then
    return;
  end if;
  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
      body := jsonb_build_object(
        'from', 'ORE <notifiche@notifiche.fitpointactive.com>',
        'to', jsonb_build_array(p_to),
        'subject', p_subject,
        'html', p_html
      )
    );
  exception when others then
    null;
  end;
end;
$$;
grant execute on function send_email(text, text, text) to anon;

create or replace function notify_owner(p_subject text, p_html text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  select value->>'email' into v_email from settings where key = 'notification_email';
  perform send_email(v_email, p_subject, p_html);
end;
$$;
grant execute on function notify_owner(text, text) to anon;

create or replace function notify_edit_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_subject text;
  v_html text;
begin
  select nome into v_nome from employees where id = new.employee_id;
  if new.shift_id is not null then
    v_subject := 'ORE: richiesta di modifica turno da ' || coalesce(v_nome, 'un dipendente');
    v_html := '<p><b>' || coalesce(v_nome, 'Un dipendente') || '</b> ha richiesto la modifica di un turno.</p>'
      || '<p>Motivo: ' || coalesce(new.motivo, '') || '</p>';
  else
    v_subject := 'ORE: nuovo turno proposto da ' || coalesce(v_nome, 'un dipendente');
    v_html := '<p><b>' || coalesce(v_nome, 'Un dipendente') || '</b> ha proposto un turno per il '
      || to_char(new.proposed_date, 'DD/MM/YYYY') || ' (' || new.proposed_start_time || '–' || new.proposed_end_time || ').</p>'
      || '<p>Nota: ' || coalesce(new.motivo, '(nessuna)') || '</p>';
  end if;
  perform notify_owner(v_subject, v_html);
  return new;
end;
$$;

drop trigger if exists trg_notify_edit_request on edit_requests;
create trigger trg_notify_edit_request
  after insert on edit_requests
  for each row execute function notify_edit_request();

create or replace function notify_absence_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_subject text;
  v_html text;
begin
  select nome into v_nome from employees where id = new.employee_id;
  v_subject := 'ORE: richiesta di assenza da ' || coalesce(v_nome, 'un dipendente');
  v_html := '<p><b>' || coalesce(v_nome, 'Un dipendente') || '</b> ha richiesto un''assenza dal '
    || to_char(new.date_from, 'DD/MM/YYYY') || ' al ' || to_char(new.date_to, 'DD/MM/YYYY') || '.</p>'
    || '<p>' || (case when new.intera_giornata then 'Giornata intera' else 'Dalle ' || new.time_from || ' alle ' || new.time_to end) || '</p>'
    || '<p>Motivo: ' || coalesce(new.motivo, '(nessuno)') || '</p>';
  perform notify_owner(v_subject, v_html);
  return new;
end;
$$;

drop trigger if exists trg_notify_absence_request on absence_requests;
create trigger trg_notify_absence_request
  after insert on absence_requests
  for each row execute function notify_absence_request();

-- ---------------------------------------------------------------------
-- Notifica email al dipendente quando il Titolare accetta/rifiuta una
-- sua richiesta (solo se quel dipendente ha un'email impostata; se non
-- ce l'ha, l'esito resta comunque visibile in-app al prossimo PIN).
-- Scatta solo sulla transizione "in_attesa" -> risolta, non ad ogni
-- update (es. mark_*_seen non la fa scattare di nuovo).
-- ---------------------------------------------------------------------
create or replace function notify_employee_edit_request_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_esito text;
  v_subject text;
  v_html text;
begin
  select email into v_email from employees where id = new.employee_id;
  if coalesce(v_email, '') = '' then
    return new;
  end if;
  v_esito := case when new.stato = 'accettata' then 'accettata' else 'rifiutata' end;
  if new.shift_id is not null then
    v_subject := 'ORE: la tua richiesta di modifica turno è stata ' || v_esito;
    v_html := '<p>La tua richiesta di modifica turno è stata <b>' || v_esito || '</b>.</p>';
  else
    v_subject := 'ORE: il turno che hai proposto è stato ' || v_esito;
    v_html := '<p>Il turno che hai proposto per il ' || to_char(new.proposed_date, 'DD/MM/YYYY')
      || ' è stato <b>' || v_esito || '</b>.</p>';
  end if;
  if coalesce(new.risposta, '') != '' then
    v_html := v_html || '<p>Nota del Titolare: ' || new.risposta || '</p>';
  end if;
  perform send_email(v_email, v_subject, v_html);
  return new;
end;
$$;

drop trigger if exists trg_notify_employee_edit_request on edit_requests;
create trigger trg_notify_employee_edit_request
  after update on edit_requests
  for each row
  when (old.stato = 'in_attesa' and new.stato != 'in_attesa')
  execute function notify_employee_edit_request_resolved();

create or replace function notify_employee_absence_request_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_esito text;
  v_subject text;
  v_html text;
begin
  select email into v_email from employees where id = new.employee_id;
  if coalesce(v_email, '') = '' then
    return new;
  end if;
  v_esito := case when new.stato = 'accettata' then 'accettata' else 'rifiutata' end;
  v_subject := 'ORE: la tua richiesta di assenza è stata ' || v_esito;
  v_html := '<p>La tua richiesta di assenza dal ' || to_char(new.date_from, 'DD/MM/YYYY')
    || ' al ' || to_char(new.date_to, 'DD/MM/YYYY') || ' è stata <b>' || v_esito || '</b>.</p>';
  if coalesce(new.risposta, '') != '' then
    v_html := v_html || '<p>Nota del Titolare: ' || new.risposta || '</p>';
  end if;
  perform send_email(v_email, v_subject, v_html);
  return new;
end;
$$;

drop trigger if exists trg_notify_employee_absence_request on absence_requests;
create trigger trg_notify_employee_absence_request
  after update on absence_requests
  for each row
  when (old.stato = 'in_attesa' and new.stato != 'in_attesa')
  execute function notify_employee_absence_request_resolved();

-- ---------------------------------------------------------------------
-- Turni proposti dal Titolare (es. sostituzione): il Titolare propone un
-- turno (data, orario, nota facoltativa) a un dipendente specifico, che
-- deve accettarlo o rifiutarlo (con motivazione) al prossimo accesso col
-- PIN. Accettando, il turno viene creato automaticamente. In entrambi i
-- casi il Titolare riceve un'email con l'esito (se configurata).
-- ---------------------------------------------------------------------
create table if not exists shift_proposals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  motivo text,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'accettata', 'rifiutata')),
  created_at timestamptz not null default now(),
  risolta_at timestamptz,
  risposta text,
  check (end_time > start_time)
);

create index if not exists shift_proposals_employee_idx on shift_proposals (employee_id, stato);

alter table shift_proposals enable row level security;
-- Nessuna policy per anon sulla tabella base: creazione, lettura admin e
-- risposta del dipendente passano solo dalle funzioni RPC qui sotto (la
-- creazione è riservata alla schermata Titolare, protetta dal codice a 6
-- cifre; la risposta dal PIN del dipendente).

create or replace function create_shift_proposal(
  p_employee_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_end_time <= p_start_time then
    raise exception 'L''orario di uscita deve essere dopo quello di entrata';
  end if;
  insert into shift_proposals (employee_id, date, start_time, end_time, motivo)
  values (p_employee_id, p_date, p_start_time, p_end_time, nullif(trim(coalesce(p_motivo, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_shift_proposal(uuid, date, time, time, text) to anon;

create or replace function get_shift_proposals_admin()
returns setof shift_proposals
language sql
security definer
set search_path = public
as $$
  select * from shift_proposals order by created_at desc;
$$;
grant execute on function get_shift_proposals_admin() to anon;

create or replace function get_pending_shift_proposals(p_employee_id uuid)
returns setof shift_proposals
language sql
security definer
set search_path = public
as $$
  select * from shift_proposals
    where employee_id = p_employee_id and stato = 'in_attesa'
    order by created_at;
$$;
grant execute on function get_pending_shift_proposals(uuid) to anon;

-- Se il dipendente accetta, il turno proposto viene creato subito nella
-- tabella shifts (bloccato come ogni altro turno).
create or replace function respond_shift_proposal(p_id uuid, p_accetta boolean, p_risposta text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee_id uuid;
  v_date date;
  v_start time;
  v_end time;
begin
  select employee_id, date, start_time, end_time
    into v_employee_id, v_date, v_start, v_end
    from shift_proposals
    where id = p_id and stato = 'in_attesa'
    for update;

  if not found then
    return;
  end if;

  if p_accetta then
    insert into shifts (employee_id, date, start_time, end_time, locked)
    values (v_employee_id, v_date, v_start, v_end, true);
  end if;

  update shift_proposals
    set stato = case when p_accetta then 'accettata' else 'rifiutata' end,
        risolta_at = now(),
        risposta = p_risposta
    where id = p_id;
end;
$$;
grant execute on function respond_shift_proposal(uuid, boolean, text) to anon;

-- Notifica email al dipendente quando il Titolare gli propone un nuovo
-- turno (solo se ha un'email impostata).
create or replace function notify_employee_shift_proposal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_subject text;
  v_html text;
begin
  select email into v_email from employees where id = new.employee_id;
  if coalesce(v_email, '') = '' then
    return new;
  end if;
  v_subject := 'ORE: ti è stato proposto un turno per il ' || to_char(new.date, 'DD/MM/YYYY');
  v_html := '<p>Ti è stato proposto un turno per il ' || to_char(new.date, 'DD/MM/YYYY')
    || ', dalle ' || new.start_time || ' alle ' || new.end_time || '.</p>';
  if coalesce(new.motivo, '') != '' then
    v_html := v_html || '<p>Nota del Titolare: ' || new.motivo || '</p>';
  end if;
  v_html := v_html || '<p>Accedi con il tuo PIN per accettarlo o rifiutarlo.</p>';
  perform send_email(v_email, v_subject, v_html);
  return new;
end;
$$;

drop trigger if exists trg_notify_employee_shift_proposal on shift_proposals;
create trigger trg_notify_employee_shift_proposal
  after insert on shift_proposals
  for each row execute function notify_employee_shift_proposal();

-- Notifica email al Titolare quando il dipendente accetta o rifiuta un
-- turno proposto (con la motivazione, se il dipendente l'ha scritta).
create or replace function notify_owner_shift_proposal_resolved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_esito text;
  v_subject text;
  v_html text;
begin
  select nome into v_nome from employees where id = new.employee_id;
  v_esito := case when new.stato = 'accettata' then 'accettato' else 'rifiutato' end;
  v_subject := 'ORE: ' || coalesce(v_nome, 'un dipendente') || ' ha ' || v_esito || ' il turno proposto';
  v_html := '<p><b>' || coalesce(v_nome, 'Un dipendente') || '</b> ha <b>' || v_esito || '</b> il turno proposto per il '
    || to_char(new.date, 'DD/MM/YYYY') || ' (' || new.start_time || '–' || new.end_time || ').</p>';
  if coalesce(new.risposta, '') != '' then
    v_html := v_html || '<p>Motivazione: ' || new.risposta || '</p>';
  end if;
  perform notify_owner(v_subject, v_html);
  return new;
end;
$$;

drop trigger if exists trg_notify_owner_shift_proposal on shift_proposals;
create trigger trg_notify_owner_shift_proposal
  after update on shift_proposals
  for each row
  when (old.stato = 'in_attesa' and new.stato != 'in_attesa')
  execute function notify_owner_shift_proposal_resolved();

-- ---------------------------------------------------------------------
-- Ore da pagare per il singolo dipendente (mostrate sulla sua home dopo
-- il PIN). A differenza di get_pending_hours() (riservata al Titolare),
-- non restituisce mai il costo orario né i dati di altri dipendenti: solo
-- le ore proprie, dallo stesso ultimo pagamento registrato in poi.
create or replace function get_pending_hours_for_employee(p_employee_id uuid)
returns table (
  from_date date,
  total_minutes bigint,
  total_hours numeric
)
language sql
security definer
set search_path = public
as $$
  select
    p.last_paid,
    coalesce(sum(extract(epoch from (s.end_time - s.start_time)) / 60), 0)::bigint,
    round(coalesce(sum(extract(epoch from (s.end_time - s.start_time)) / 60), 0) / 60.0, 2)
  from employees e
  left join lateral (
    select max(date_to) as last_paid from payments where payments.employee_id = e.id
  ) p on true
  left join shifts s
    on s.employee_id = e.id
    and (p.last_paid is null or s.date > p.last_paid)
  where e.id = p_employee_id
  group by p.last_paid;
$$;
grant execute on function get_pending_hours_for_employee(uuid) to anon;

-- ---------------------------------------------------------------------
-- Dati iniziali (eseguire una sola volta; ON CONFLICT evita duplicati)
-- ---------------------------------------------------------------------
insert into settings (key, value) values
  ('owner_code', '{"code": "123456"}')
on conflict (key) do nothing;
