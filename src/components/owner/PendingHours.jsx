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
import { getRomeTodayISO, formatDateShort, formatDurationHM, formatCurrency, addDaysISO, nextPaydayISO } from "../../lib/time";
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
    } catch (e) {
      setError(e.message || "Errore nel caricamento.");
    }
  }, [expandedId, loadDetail]);

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
            return (
              <Card key={r.employeeId} className="p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => toggleExpand(r)}
                    className="flex flex-1 items-center justify-between gap-2 text-left"
                  >
                    <div>
                      <p className="font-600 text-slate-900 dark:text-white">{r.nome}</p>
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {formatDurationHM(r.totalMinutes)} · {formatCurrency(r.totalCost)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        dal {r.fromDate ? formatDateShort(r.fromDate) : "sempre"}
                        {(r.payday === 0 || r.payday) && ` · prossima paga: ${formatDateShort(nextPaydayISO(r.payday))}`}
                      </p>
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
