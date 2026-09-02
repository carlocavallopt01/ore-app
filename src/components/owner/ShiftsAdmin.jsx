import React, { useState, useEffect, useCallback } from "react";
import { Plus, PencilLine, Trash2, X, Check } from "lucide-react";
import { getEmployeesAdmin, getShiftsAdmin, adminUpdateShift, adminDeleteShift, addShift } from "../../lib/api";
import { getRomeTodayISO, formatDateShort, formatTimeHM, minutesBetween, formatDurationHM } from "../../lib/time";
import { Button, Card, Field, Input, Select, ErrorText, Spinner, EmptyState } from "../ui";

const today = getRomeTodayISO();

export default function ShiftsAdmin() {
  const [employees, setEmployees] = useState(null);
  const [shifts, setShifts] = useState(null);
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [error, setError] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [emps, shs] = await Promise.all([
        getEmployeesAdmin(),
        getShiftsAdmin({ employeeId: employeeFilter || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined }),
      ]);
      setEmployees(emps);
      setShifts(shs);
    } catch (e) {
      setError(e.message || "Errore nel caricamento dei turni.");
    }
  }, [employeeFilter, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  const nameById = Object.fromEntries((employees || []).map((e) => [e.id, e.nome]));

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>

      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <Field label="Dipendente" className="flex-1">
          <Select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">Tutti</option>
            {(employees || []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {!e.attivo ? " (disattivato)" : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Dal">
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </Field>
        <Field label="Al">
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <Button variant="secondary" onClick={() => setShowAdd((v) => !v)}>
          <Plus size={16} /> Turno
        </Button>
      </Card>

      {showAdd && (
        <AddShiftForm
          employees={employees || []}
          onCancel={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false);
            load();
          }}
        />
      )}

      {!shifts ? (
        <div className="flex justify-center py-12">
          <Spinner className="text-indigo-600" size={24} />
        </div>
      ) : shifts.length === 0 ? (
        <EmptyState>Nessun turno trovato con questi filtri.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {shifts.map((s) =>
            editingId === s.id ? (
              <EditShiftRow
                key={s.id}
                shift={s}
                nome={nameById[s.employeeId]}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  load();
                }}
              />
            ) : (
              <Card key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-600 text-slate-900 dark:text-white">{nameById[s.employeeId] || "—"}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDateShort(s.date)} · {formatTimeHM(s.startTime)} – {formatTimeHM(s.endTime)} ·{" "}
                    {formatDurationHM(minutesBetween(s.startTime, s.endTime))}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditingId(s.id)}
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <PencilLine size={16} />
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Eliminare questo turno?")) return;
                      await adminDeleteShift(s.id);
                      load();
                    }}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}

function AddShiftForm({ employees, onCancel, onSaved }) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!employeeId) return setError("Seleziona un dipendente.");
    if (!date || !startTime || !endTime) return setError("Compila tutti i campi.");
    if (endTime <= startTime) return setError("L'uscita deve essere dopo l'entrata.");
    setSaving(true);
    setError("");
    try {
      await addShift({ employeeId, date, startTime, endTime });
      onSaved();
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Dipendente" className="flex-1">
          <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Data">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Entrata">
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Uscita">
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            <X size={16} />
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size={16} /> : <Check size={16} />}
          </Button>
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function EditShiftRow({ shift, nome, onCancel, onSaved }) {
  const [date, setDate] = useState(shift.date);
  const [startTime, setStartTime] = useState(shift.startTime.slice(0, 5));
  const [endTime, setEndTime] = useState(shift.endTime.slice(0, 5));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (endTime <= startTime) return setError("L'uscita deve essere dopo l'entrata.");
    setSaving(true);
    setError("");
    try {
      await adminUpdateShift({ id: shift.id, date, startTime, endTime });
      onSaved();
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-2 text-xs font-600 uppercase text-slate-500 dark:text-slate-400">{nome}</p>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Data">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Entrata">
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
        <Field label="Uscita">
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            <X size={16} />
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size={16} /> : <Check size={16} />}
          </Button>
        </div>
      </form>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
