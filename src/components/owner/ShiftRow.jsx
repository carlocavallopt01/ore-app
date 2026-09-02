import React, { useState } from "react";
import { PencilLine, Trash2, X, Check } from "lucide-react";
import { adminUpdateShift, adminDeleteShift } from "../../lib/api";
import { formatDateShort, formatTimeHM, minutesBetween, formatDurationHM } from "../../lib/time";
import { Button, Input, ErrorText, Spinner } from "../ui";

// Riga-turno compatta, riusata ovunque il Titolare rivede i turni di un
// dipendente (Da pagare, Riepilogo mensile) per poterli correggere o
// eliminare sul posto, senza dover passare dalla tab Turni.
export default function ShiftRow({ shift, showDate = true, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(shift.date);
  const [startTime, setStartTime] = useState(shift.startTime.slice(0, 5));
  const [endTime, setEndTime] = useState(shift.endTime.slice(0, 5));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (endTime <= startTime) return setError("L'uscita deve essere dopo l'entrata.");
    setSaving(true);
    setError("");
    try {
      await adminUpdateShift({ id: shift.id, date, startTime, endTime });
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm("Eliminare questo turno?")) return;
    setSaving(true);
    setError("");
    try {
      await adminDeleteShift(shift.id);
      onChanged();
    } catch (e) {
      setError(e.message || "Errore nell'eliminazione.");
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2">
          {showDate && <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto flex-1" />}
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-auto flex-1" />
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-auto flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
            <X size={14} />
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Spinner size={14} /> : <Check size={14} />}
          </Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {showDate && <span className="text-slate-600 dark:text-slate-300">{formatDateShort(shift.date)}</span>}
        <span className="text-slate-500 dark:text-slate-400">
          {formatTimeHM(shift.startTime)} – {formatTimeHM(shift.endTime)}
        </span>
        <span className="font-600 text-slate-700 dark:text-slate-200">
          {formatDurationHM(minutesBetween(shift.startTime, shift.endTime))}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          title="Modifica turno"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <PencilLine size={14} />
        </button>
        <button
          onClick={remove}
          disabled={saving}
          title="Elimina turno"
          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
        >
          {saving ? <Spinner size={14} /> : <Trash2 size={14} />}
        </button>
      </div>
    </div>
  );
}
