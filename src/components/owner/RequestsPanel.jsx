import React, { useState, useEffect, useCallback } from "react";
import { Check, X } from "lucide-react";
import {
  getEmployeesAdmin,
  getEditRequestsAdmin,
  resolveEditRequest,
  getAbsenceRequestsAdmin,
  resolveAbsenceRequest,
} from "../../lib/api";
import { formatDateShort, formatTimeHM } from "../../lib/time";
import { Button, Card, Badge, Spinner, EmptyState, ErrorText } from "../ui";

const STATO_TONE = { in_attesa: "amber", accettata: "emerald", rifiutata: "red" };
const STATO_LABEL = { in_attesa: "In attesa", accettata: "Accettata", rifiutata: "Rifiutata" };

export default function RequestsPanel({ onResolved }) {
  const [employees, setEmployees] = useState(null);
  const [edits, setEdits] = useState(null);
  const [absences, setAbsences] = useState(null);
  const [error, setError] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [emps, e, a] = await Promise.all([getEmployeesAdmin(), getEditRequestsAdmin(), getAbsenceRequestsAdmin()]);
      setEmployees(emps);
      setEdits(e);
      setAbsences(a);
    } catch (err) {
      setError(err.message || "Errore nel caricamento delle richieste.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const nameById = Object.fromEntries((employees || []).map((e) => [e.id, e.nome]));

  async function resolve(kind, id, accetta) {
    setBusyId(id);
    try {
      if (kind === "edit") await resolveEditRequest(id, accetta);
      else await resolveAbsenceRequest(id, accetta);
      await load();
      onResolved?.();
    } finally {
      setBusyId(null);
    }
  }

  if (!edits || !absences) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="text-indigo-600" size={24} />
      </div>
    );
  }

  const editsToShow = showResolved ? edits : edits.filter((r) => r.stato === "in_attesa");
  const absencesToShow = showResolved ? absences : absences.filter((r) => r.stato === "in_attesa");

  return (
    <div className="flex flex-col gap-6">
      <ErrorText>{error}</ErrorText>
      <label className="flex items-center gap-2 self-start text-sm font-600 text-slate-600 dark:text-slate-300">
        <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="h-4 w-4 rounded" />
        Mostra anche le richieste già risolte
      </label>

      <section>
        <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-slate-500 dark:text-slate-400">Modifiche turno</h2>
        {editsToShow.length === 0 ? (
          <EmptyState>Nessuna richiesta di modifica.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {editsToShow.map((r) => (
              <Card key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <p className="font-600 text-slate-900 dark:text-white">{nameById[r.employeeId] || "—"}</p>
                    <Badge tone={STATO_TONE[r.stato]}>{STATO_LABEL[r.stato]}</Badge>
                  </div>
                  {r.shift && (
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Turno del {formatDateShort(r.shift.date)}, {formatTimeHM(r.shift.startTime)} – {formatTimeHM(r.shift.endTime)}
                    </p>
                  )}
                  <p className="text-sm italic text-slate-500 dark:text-slate-400">"{r.motivo}"</p>
                </div>
                {r.stato === "in_attesa" && (
                  <div className="flex gap-2">
                    <Button variant="success" size="sm" disabled={busyId === r.id} onClick={() => resolve("edit", r.id, true)}>
                      <Check size={14} /> Accetta
                    </Button>
                    <Button variant="danger" size="sm" disabled={busyId === r.id} onClick={() => resolve("edit", r.id, false)}>
                      <X size={14} /> Rifiuta
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-slate-500 dark:text-slate-400">Assenze</h2>
        {absencesToShow.length === 0 ? (
          <EmptyState>Nessuna richiesta di assenza.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {absencesToShow.map((r) => (
              <Card key={r.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="mb-1 flex items-center gap-2">
                    <p className="font-600 text-slate-900 dark:text-white">{nameById[r.employeeId] || "—"}</p>
                    <Badge tone={STATO_TONE[r.stato]}>{STATO_LABEL[r.stato]}</Badge>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    {formatDateShort(r.dateFrom)}
                    {r.dateTo !== r.dateFrom ? ` – ${formatDateShort(r.dateTo)}` : ""}
                    {r.interaGiornata ? " · giornata intera" : ` · ${formatTimeHM(r.timeFrom)} – ${formatTimeHM(r.timeTo)}`}
                  </p>
                  {r.motivo && <p className="text-sm italic text-slate-500 dark:text-slate-400">"{r.motivo}"</p>}
                </div>
                {r.stato === "in_attesa" && (
                  <div className="flex gap-2">
                    <Button variant="success" size="sm" disabled={busyId === r.id} onClick={() => resolve("absence", r.id, true)}>
                      <Check size={14} /> Accetta
                    </Button>
                    <Button variant="danger" size="sm" disabled={busyId === r.id} onClick={() => resolve("absence", r.id, false)}>
                      <X size={14} /> Rifiuta
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
