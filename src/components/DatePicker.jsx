import React, { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { formatDateShort, monthLabel, shiftMonth, getRomeTodayISO } from "../lib/time";

const WEEKDAY_LABELS = ["L", "M", "M", "G", "V", "S", "D"];

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoOf(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Offset (0=lunedì..6=domenica) del primo giorno del mese.
function firstWeekdayOffset(year, month) {
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=domenica
  return (jsDay + 6) % 7;
}

function buildGrid(year, month) {
  const total = daysInMonth(year, month);
  const offset = firstWeekdayOffset(year, month);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(d);
  return cells;
}

function MonthNav({ year, month, onPrev, onNext }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <button
        type="button"
        onClick={onPrev}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-700 text-slate-900 dark:text-white">{monthLabel(year, month)}</span>
      <button
        type="button"
        onClick={onNext}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function Weekdays() {
  return (
    <div className="grid grid-cols-7 gap-1 text-center text-xs font-600 text-slate-400 dark:text-slate-500">
      {WEEKDAY_LABELS.map((w, i) => (
        <div key={i}>{w}</div>
      ))}
    </div>
  );
}

function CalendarGrid({ year, month, today, onDayClick, isSelected, isInRange, isDisabled }) {
  const cells = buildGrid(year, month);
  return (
    <div className="grid grid-cols-7 gap-1 text-center">
      {cells.map((d, i) => {
        if (d === null) return <div key={i} />;
        const iso = isoOf(year, month, d);
        const disabled = isDisabled ? isDisabled(iso) : false;
        const selected = isSelected(iso);
        const inRange = isInRange ? isInRange(iso) : false;
        const isToday = iso === today;
        return (
          <button
            key={i}
            type="button"
            disabled={disabled}
            onClick={() => onDayClick(iso)}
            className={`aspect-square rounded-lg text-sm font-600 transition ${
              disabled
                ? "cursor-not-allowed text-slate-300 dark:text-slate-700"
                : selected
                  ? "bg-indigo-600 text-white"
                  : inRange
                    ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                    : isToday
                      ? "border border-indigo-400 text-slate-900 dark:text-white"
                      : "text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            }`}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

function TriggerButton({ label, placeholder, hasValue, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left text-base text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
    >
      <span className={hasValue ? "" : "text-slate-400 dark:text-slate-500"}>{hasValue ? label : placeholder}</span>
      <Calendar size={18} className="shrink-0 text-slate-400" />
    </button>
  );
}

// Campo con calendario a comparsa per una singola data. `value` è una
// stringa ISO "YYYY-MM-DD" (o vuota); `onChange(iso)` riceve la nuova data.
// `min`/`max` (ISO, opzionali) limitano le date selezionabili.
export function DatePickerField({ value, onChange, min, max, placeholder = "Seleziona una data" }) {
  const today = getRomeTodayISO();
  const [open, setOpen] = useState(false);
  const initial = value || min || max || today;
  const [y, m] = initial.split("-").map(Number);
  const [viewYear, setViewYear] = useState(y);
  const [viewMonth, setViewMonth] = useState(m);

  function isDisabled(iso) {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function goPrev() {
    const { year, month } = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(year);
    setViewMonth(month);
  }
  function goNext() {
    const { year, month } = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(year);
    setViewMonth(month);
  }

  return (
    <div>
      <TriggerButton
        label={value ? formatDateShort(value) : ""}
        placeholder={placeholder}
        hasValue={Boolean(value)}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <MonthNav year={viewYear} month={viewMonth} onPrev={goPrev} onNext={goNext} />
          <Weekdays />
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            today={today}
            isSelected={(iso) => iso === value}
            isDisabled={isDisabled}
            onDayClick={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

// Campo con calendario a comparsa per un intervallo (dal/al): il primo
// tocco imposta l'inizio, il secondo (su una data successiva) imposta la
// fine e chiude il calendario; toccare una data precedente all'inizio fa
// ricominciare l'intervallo da lì. `from`/`to` sono ISO, `onChange`
// riceve `{ from, to }`.
export function DateRangePickerField({ from, to, onChange, min, max }) {
  const today = getRomeTodayISO();
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(null);
  const initial = from || min || max || today;
  const [y, m] = initial.split("-").map(Number);
  const [viewYear, setViewYear] = useState(y);
  const [viewMonth, setViewMonth] = useState(m);

  function isDisabled(iso) {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }

  function goPrev() {
    const { year, month } = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(year);
    setViewMonth(month);
  }
  function goNext() {
    const { year, month } = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(year);
    setViewMonth(month);
  }

  function handleDayClick(iso) {
    if (draftFrom === null || iso < draftFrom) {
      setDraftFrom(iso);
      onChange({ from: iso, to: iso });
    } else {
      onChange({ from: draftFrom, to: iso });
      setDraftFrom(null);
      setOpen(false);
    }
  }

  const hasValue = Boolean(from && to);
  const label = hasValue ? (from === to ? formatDateShort(from) : `${formatDateShort(from)} – ${formatDateShort(to)}`) : "";
  const hint =
    draftFrom === null
      ? "Tocca il primo giorno del periodo"
      : "Ora tocca l'ultimo giorno (o lo stesso giorno per un'assenza di un giorno solo)";

  return (
    <div>
      <TriggerButton label={label} placeholder="Seleziona il periodo" hasValue={hasValue} onClick={() => { setDraftFrom(null); setOpen((v) => !v); }} />
      {open && (
        <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <MonthNav year={viewYear} month={viewMonth} onPrev={goPrev} onNext={goNext} />
          <Weekdays />
          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            today={today}
            isSelected={(iso) => iso === from || iso === to}
            isInRange={(iso) => Boolean(from && to) && iso > from && iso < to}
            isDisabled={isDisabled}
            onDayClick={handleDayClick}
          />
          <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">{hint}</p>
        </div>
      )}
    </div>
  );
}
