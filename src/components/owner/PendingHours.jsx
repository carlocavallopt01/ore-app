import React, { useState, useEffect, useCallback } from "react";
import { Wallet } from "lucide-react";
import { getPendingHours, markPaid } from "../../lib/api";
import { getRomeTodayISO, formatDateShort, formatDurationHM, formatCurrency } from "../../lib/time";
import { Button, Card, Field, Input, Modal, ErrorText, Spinner, EmptyState } from "../ui";

const today = getRomeTodayISO();

export default function PendingHours() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [payingFor, setPayingFor] = useState(null);

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
          {rows.map((r) => (
            <Card key={r.employeeId} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-600 text-slate-900 dark:text-white">{r.nome}</p>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {formatDurationHM(r.totalMinutes)} · {formatCurrency(r.totalCost)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  dal {r.fromDate ? formatDateShort(r.fromDate) : "sempre"}
                </p>
              </div>
              <Button variant="secondary" size="sm" disabled={r.totalMinutes === 0} onClick={() => setPayingFor(r)}>
                <Wallet size={14} /> Segna come pagato
              </Button>
            </Card>
          ))}
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
