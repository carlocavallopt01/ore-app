import React, { useState, useEffect, useCallback } from "react";
import { Wallet, ChevronDown, ChevronUp, Undo2, PencilLine, Check, X } from "lucide-react";
import {
  getPendingHours,
  markPaid,
  getShiftsAdmin,
  getPaymentsForEmployee,
  adminDeletePayment,
  adminUpdatePayment,
} from "../../lib/api";
import {
  getRomeTodayISO,
  formatDateShort,
  formatDurationHM,
  formatCurrency,
  addDaysISO,
  nextPaydayISO,
  lastPaydayISO,
  minutesBetween,
} from "../../lib/time";
import { Button, Card, Field, Input, Modal, ErrorText, Spinner, EmptyState } from "../ui";
import ShiftRow from "./ShiftRow";

const today = getRomeTodayISO();

export default function PendingHours() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [payingFor, setPayingFor] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [detailByEmployee, setDetailByEmployee] = useState({});
  const [paymentsByEmployee, setPaymentsByEmployee] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [splitByEmployee, setSplitByEmployee] = useState({});

  // Per i dipendenti con giorno di paga impostato e un periodo già scaduto
  // senza essere stato pagato, calcola separatamente "scaduto" (fino
  // all'ultima scadenza passata) e "in corso" (da lì a oggi), così in
  // lista non restano mescolati in un unico totale.
  const loadSplits = useCallback(async (data) => {
    const needsSplit = data.filter((r) => {
      if (r.payday === null || r.payday === undefined) return false;
      const splitPoint = lastPaydayISO(r.payday, today);
      // fromDate nullo = mai pagato: in quel caso c'è sempre uno scaduto
      // da separare, non solo quando è già passato un pagamento.
      return splitPoint && (!r.fromDate || splitPoint > r.fromDate);
    });
    if (needsSplit.length === 0) {
      setSplitByEmployee({});
      return;
    }
    try {
      const entries = await Promise.all(
        needsSplit.map(async (r) => {
          const splitPoint = lastPaydayISO(r.payday, today);
          const shifts = await getShiftsAdmin({
            employeeId: r.employeeId,
            dateFrom: r.fromDate ? addDaysISO(r.fromDate, 1) : undefined,
          });
          let overdueMinutes = 0;
          let currentMinutes = 0;
          for (const s of shifts) {
            const mins = minutesBetween(s.startTime, s.endTime);
            if (s.date <= splitPoint) overdueMinutes += mins;
            else currentMinutes += mins;
          }
          return [
            r.employeeId,
            {
              splitPoint,
              overdueMinutes,
              overdueCost: Math.round((overdueMinutes / 60) * r.hourlyRate * 100) / 100,
              currentMinutes,
              currentCost: Math.round((currentMinutes / 60) * r.hourlyRate * 100) / 100,
            },
          ];
        })
      );
      // Mostra lo spacco solo se esiste davvero un "in corso" oltre allo
      // scaduto: altrimenti non aggiunge nulla rispetto alla vista normale.
      setSplitByEmployee(Object.fromEntries(entries.filter(([, v]) => v.currentMinutes > 0)));
    } catch {
      // silenzioso: non è critico, la vista resta quella non spaccata
    }
  }, []);

  const loadDetail = useCallback(async (row) => {
    setDetailLoading(true);
    try {
      const [shifts, payments] = await Promise.all([
        getShiftsAdmin({
          employeeId: row.employeeId,
          dateFrom: row.fromDate ? addDaysISO(row.fromDate, 1) : undefined,
        }),
        getPaymentsForEmployee(row.employeeId),
      ]);
      setDetailByEmployee((prev) => ({ ...prev, [row.employeeId]: shifts }));
      setPaymentsByEmployee((prev) => ({ ...prev, [row.employeeId]: payments }));
    } catch (e) {
      setError(e.message || "Errore nel caricamento dei turni.");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Ricarica i totali; se un dipendente è espanso, aggiorna anche il suo
  // dettaglio con il "pagato fino al" più recente (es. dopo un pagamento
  // registrato, cambia il periodo da mostrare).
  const load = useCallback(async () => {
    try {
      const data = await getPendingHours();
      setRows(data);
      if (expandedId) {
        const row = data.find((r) => r.employeeId === expandedId);
        if (row) loadDetail(row);
      }
      loadSplits(data);
    } catch (e) {
      setError(e.message || "Errore nel caricamento.");
    }
  }, [expandedId, loadDetail, loadSplits]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleExpand(row) {
    if (expandedId === row.employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(row.employeeId);
    if (!detailByEmployee[row.employeeId]) loadDetail(row);
  }

  // Dopo una modifica/eliminazione il totale ore/costo può essere
  // cambiato: ricarico sia il dettaglio del dipendente sia i totali.
  async function onShiftChanged(row) {
    await Promise.all([loadDetail(row), load()]);
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
            const payments = paymentsByEmployee[r.employeeId];
            const split = splitByEmployee[r.employeeId];
            return (
              <Card key={r.employeeId} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => toggleExpand(r)}
                    className="flex flex-1 items-center justify-between gap-2 text-left"
                  >
                    <div className="flex-1">
                      <p className="font-600 text-slate-900 dark:text-white">{r.nome}</p>
                      {split ? (
                        <div className="mt-1 flex flex-col gap-1.5">
                          <div className="rounded-lg bg-amber-50 px-2 py-1 dark:bg-amber-900/20">
                            <p className="text-xs font-700 text-amber-700 dark:text-amber-400">
                              Scaduto · paga prevista {formatDateShort(split.splitPoint)}
                            </p>
                            <p className="text-sm font-600 text-slate-800 dark:text-slate-100">
                              {formatDurationHM(split.overdueMinutes)} · {formatCurrency(split.overdueCost)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-700 uppercase tracking-wide text-slate-400 dark:text-slate-500">In corso</p>
                            <p className="text-sm text-slate-600 dark:text-slate-300">
                              {formatDurationHM(split.currentMinutes)} · {formatCurrency(split.currentCost)}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {formatDurationHM(r.totalMinutes)} · {formatCurrency(r.totalCost)}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            dal {r.fromDate ? formatDateShort(r.fromDate) : "sempre"}
                            {(r.payday === 0 || r.payday) && ` · prossima paga: ${formatDateShort(nextPaydayISO(r.payday))}`}
                          </p>
                        </>
                      )}
                    </div>
                    {expanded ? (
                      <ChevronUp size={16} className="shrink-0 text-slate-400" />
                    ) : (
                      <ChevronDown size={16} className="shrink-0 text-slate-400" />
                    )}
                  </button>
                  <Button variant="secondary" size="sm" disabled={r.totalMinutes === 0} onClick={() => setPayingFor(r)}>
                    <Wallet size={14} /> Segna come pagato
                  </Button>
                </div>

                {expanded && (
                  <div className="mt-3 flex flex-col gap-3 border-t border-slate-200 pt-3 dark:border-slate-800">
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-700 uppercase text-slate-500 dark:text-slate-400">Turni da pagare</p>
                      {detailLoading && !detail ? (
                        <Spinner size={16} className="text-indigo-600" />
                      ) : !detail || detail.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Nessun turno trovato.</p>
                      ) : (
                        detail.map((s) => <ShiftRow key={s.id} shift={s} onChanged={() => onShiftChanged(r)} />)
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-700 uppercase text-slate-500 dark:text-slate-400">Pagamenti registrati</p>
                      {detailLoading && !payments ? (
                        <Spinner size={16} className="text-indigo-600" />
                      ) : !payments || payments.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">Nessun pagamento registrato.</p>
                      ) : (
                        payments.map((p) => <PaymentRow key={p.id} payment={p} onChanged={() => onShiftChanged(r)} />)
                      )}
                    </div>
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
          split={splitByEmployee[payingFor.employeeId]}
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

// Se il dipendente ha un giorno di paga impostato, propone come default
// l'ultima scadenza già passata (anche se si sta pagando in ritardo),
// invece di "oggi": così le giornate lavorate dopo quella scadenza non
// finiscono per sbaglio dentro questo pagamento.
function defaultPaidThrough(row) {
  if (row.payday === null || row.payday === undefined) return today;
  const lastPayday = lastPaydayISO(row.payday, today);
  if (lastPayday && (!row.fromDate || lastPayday > row.fromDate)) return lastPayday;
  return today;
}

function MarkPaidModal({ row, split, onClose, onSaved }) {
  const suggested = defaultPaidThrough(row);
  const [dateTo, setDateTo] = useState(suggested);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Se esiste uno spacco scaduto/in corso, mostra il totale della sola
  // parte scaduta (quella che la data proposta di default sta per
  // saldare), non il totale combinato con il periodo ancora in corso.
  const displayMinutes = split ? split.overdueMinutes : row.totalMinutes;
  const displayCost = split ? split.overdueCost : row.totalCost;

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
          <span className="font-600">{formatDateShort(dateTo)}</span> ({formatDurationHM(displayMinutes)},{" "}
          {formatCurrency(displayCost)})
        </p>
        <Field
          label="Pagato fino al"
          hint={
            suggested !== today
              ? `Proposta in base al giorno di paga impostato (${formatDateShort(suggested)}), anche se oggi è un'altra data: così le ore successive restano da pagare. Modificabile.`
              : "Modificabile: le ore successive a questa data resteranno da pagare."
          }
        >
          <div className="flex gap-2">
            <Input type="date" value={dateTo} min={row.fromDate || undefined} max={today} onChange={(e) => setDateTo(e.target.value)} className="flex-1" />
            <Button type="button" variant="secondary" onClick={() => setDateTo(lastPaydayISO(0, today))}>
              Fine mese
            </Button>
          </div>
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

function PaymentRow({ payment, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [dateTo, setDateTo] = useState(payment.dateTo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await adminUpdatePayment(payment.id, dateTo);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Annullare il pagamento fino al ${formatDateShort(payment.dateTo)}? Quelle ore torneranno visibili come da pagare.`)) return;
    setSaving(true);
    setError("");
    try {
      await adminDeletePayment(payment.id);
      onChanged();
    } catch (e) {
      setError(e.message || "Errore nell'eliminazione.");
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Input type="date" value={dateTo} max={today} onChange={(e) => setDateTo(e.target.value)} className="flex-1" />
          <Button size="sm" variant="secondary" onClick={() => setDateTo(lastPaydayISO(0, today))}>
            Fine mese
          </Button>
        </div>
        <div className="flex items-center justify-end gap-2">
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
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600 dark:text-slate-300">Pagato fino al {formatDateShort(payment.dateTo)}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          title="Modifica data pagamento"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <PencilLine size={13} />
        </button>
        <button
          onClick={remove}
          disabled={saving}
          title="Annulla questo pagamento"
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-600 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
        >
          {saving ? <Spinner size={13} /> : <Undo2 size={13} />} Annulla
        </button>
      </div>
    </div>
  );
}
