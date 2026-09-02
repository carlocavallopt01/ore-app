import React, { useState, useEffect, useCallback } from "react";
import { Wallet, ChevronDown, ChevronUp } from "lucide-react";
import { getPendingHours, markPaid, getShiftsAdmin } from "../../lib/api";
import {
  getRomeTodayISO,
  formatDateShort,
  formatTimeHM,
  minutesBetween,
  formatDurationHM,
  formatCurrency,
  addDaysISO,
} from "../../lib/time";
import { Button, Card, Field, Input, Modal, ErrorText, Spinner, EmptyState } from "../ui";

const today = getRomeTodayISO();

export default function PendingHours() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [payingFor, setPayingFor] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [detailByEmployee, setDetailByEmployee] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await getPendingHours());
    } catch (e) {
      setError(e.message || "Errore nel caricamento.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleExpand(row) {
    if (expandedId === row.employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.employeeId);
    if (detailByEmployee[row.employeeId]) return;
    setDetailLoading(true);
    try {
      const shifts = await getShiftsAdmin({
        employeeId: row.employeeId,
        dateFrom: row.fromDate ? addDaysISO(row.fromDate, 1) : undefined,
      });
      setDetailByEmployee((prev) => ({ ...prev, [row.employeeId]: shifts }));
    } catch (e) {
      setError(e.message || "Errore nel caricamento dei turni.");
    } finally {
      setDetailLoading(false);
    }
  }

  if (!rows) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="text-indigo-600" size={24} />
      </div>
    );
  }

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>

      <Card className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-600 text-slate-600 dark:text-slate-300">Totale da pagare (dipendenti attivi)</span>
        <span className="text-lg font-700 text-slate-900 dark:text-white">{formatCurrency(totalCost)}</span>
      </Card>

      {rows.length === 0 ? (
        <EmptyState>Nessun dipendente attivo.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const expanded = expandedId === r.employeeId;
            const detail = detailByEmployee[r.employeeId];
            return (
              <Card key={r.employeeId} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => toggleExpand(r)}
                    disabled={r.totalMinutes === 0}
                    className="flex flex-1 items-center justify-between gap-2 text-left disabled:cursor-default"
                  >
                    <div>
                      <p className="font-600 text-slate-900 dark:text-white">{r.nome}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {formatDurationHM(r.totalMinutes)} · {formatCurrency(r.totalCost)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        dal {r.fromDate ? formatDateShort(r.fromDate) : "sempre"}
                      </p>
                    </div>
                    {r.totalMinutes > 0 &&
                      (expanded ? (
                        <ChevronUp size={16} className="shrink-0 text-slate-400" />
                      ) : (
                        <ChevronDown size={16} className="shrink-0 text-slate-400" />
                      ))}
                  </button>
                  <Button variant="secondary" size="sm" disabled={r.totalMinutes === 0} onClick={() => setPayingFor(r)}>
                    <Wallet size={14} /> Segna come pagato
                  </Button>
                </div>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-1.5 border-t border-slate-200 pt-3 dark:border-slate-800">
                    {detailLoading && !detail ? (
                      <Spinner size={16} className="text-indigo-600" />
                    ) : !detail || detail.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">Nessun turno trovato.</p>
                    ) : (
                      detail.map((s) => (
                        <div key={s.id} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600 dark:text-slate-300">{formatDateShort(s.date)}</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {formatTimeHM(s.startTime)} – {formatTimeHM(s.endTime)}
                          </span>
                          <span className="font-600 text-slate-700 dark:text-slate-200">
                            {formatDurationHM(minutesBetween(s.startTime, s.endTime))}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {payingFor && (
        <MarkPaidModal
          row={payingFor}
          onClose={() => setPayingFor(null)}
          onSaved={() => {
            setPayingFor(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function MarkPaidModal({ row, onClose, onSaved }) {
  const [dateTo, setDateTo] = useState(today);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!dateTo) return setError("Inserisci una data.");
    setSaving(true);
    setError("");
    try {
      await markPaid(row.employeeId, dateTo);
      onSaved();
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`Segna come pagato · ${row.nome}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Conferma pagamento"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Periodo: dal {row.fromDate ? formatDateShort(row.fromDate) : "sempre"} al{" "}
          <span className="font-600">{formatDateShort(dateTo)}</span> ({formatDurationHM(row.totalMinutes)},{" "}
          {formatCurrency(row.totalCost)})
        </p>
        <Field label="Pagato fino al" hint="Modificabile: le ore successive a questa data resteranno da pagare.">
          <Input type="date" value={dateTo} min={row.fromDate || undefined} max={today} onChange={(e) => setDateTo(e.target.value)} />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
