// Tutte le funzioni qui sotto ragionano sempre sul fuso orario
// Europe/Rome, indipendentemente dal fuso del dispositivo che apre
// l'app: importante perché più dipendenti in palestra potrebbero avere
// il telefono impostato su fusi diversi, ma "oggi" deve essere lo
// stesso per tutti.

const TZ = "Europe/Rome";

const partsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function getRomeParts(date = new Date()) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === "24" ? "0" : parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function getRomeTodayISO(date = new Date()) {
  const { year, month, day } = getRomeParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getRomeHour(date = new Date()) {
  return getRomeParts(date).hour;
}

// Chiaro di giorno (7:00-19:59), scuro la sera/notte (20:00-6:59).
export function isRomeDaytime(date = new Date()) {
  const h = getRomeHour(date);
  return h >= 7 && h < 20;
}

const dateFormatterLong = new Intl.DateTimeFormat("it-IT", {
  timeZone: TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const dateFormatterShort = new Intl.DateTimeFormat("it-IT", {
  timeZone: TZ,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function parseISODateAsUTCNoon(isoDate) {
  // Interpreta una data "YYYY-MM-DD" (senza ora) a mezzogiorno UTC, così
  // la formattazione in qualunque fuso non fa slittare il giorno.
  return new Date(`${isoDate}T12:00:00Z`);
}

export function formatDateLong(isoDate) {
  return dateFormatterLong.format(parseISODateAsUTCNoon(isoDate));
}

export function formatDateShort(isoDate) {
  return dateFormatterShort.format(parseISODateAsUTCNoon(isoDate));
}

export function formatTimeHM(time) {
  // time arriva da Postgres come "HH:MM:SS"
  return (time || "").slice(0, 5);
}

export function minutesBetween(startTime, endTime) {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

export function formatDurationHM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);
}

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];

export function monthLabel(year, month) {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function shiftMonth(year, month, delta) {
  const total = (year * 12 + (month - 1)) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function addDaysISO(isoDate, days) {
  const d = parseISODateAsUTCNoon(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysInMonth(year, month) {
  // Giorno 0 del mese successivo (1-indicizzato) = ultimo giorno del mese richiesto.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Prossima data di paga a partire da `payday` (0 = fine mese, 1-31 = giorno
// del mese, con clamp sui mesi più corti), calcolata dalla data indicata
// (o da oggi). Puramente informativo: non incide sul calcolo delle ore.
export function nextPaydayISO(payday, fromISO = getRomeTodayISO()) {
  if (payday === null || payday === undefined) return null;
  const [y, m] = fromISO.split("-").map(Number);

  function candidateFor(year, month) {
    const last = daysInMonth(year, month);
    const day = payday === 0 ? last : Math.min(payday, last);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const thisMonth = candidateFor(y, m);
  if (thisMonth >= fromISO) return thisMonth;

  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return candidateFor(nextYear, nextMonth);
}

export function paydayLabel(payday) {
  if (payday === null || payday === undefined) return "";
  return payday === 0 ? "Fine mese" : `Giorno ${payday}`;
}
