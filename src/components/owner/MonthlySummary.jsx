import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileDown, FileSpreadsheet } from "lucide-react";
import { getMonthlySummary, getShiftsAdmin } from "../../lib/api";
import { getRomeParts, monthLabel, shiftMonth, formatDurationHM, formatCurrency } from "../../lib/time";
import { exportSummaryToExcel, exportSummaryToPdf } from "../../lib/export";
import { Button, Card, Select, ErrorText, Spinner, EmptyState } from "../ui";
import ShiftRow from "./ShiftRow";

const nowParts = getRomeParts();

export default function MonthlySummary() {
  const [year, setYear] = useState(nowParts.year);
  const [month, setMonth] = useState(nowParts.month);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [exporting, setExporting] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [detailByEmployee, setDetailByEmployee] = useState({});
  const [detailLoading, setDetailLoading] = useState(false);

  function monthRange() {
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return { from, to };
  }

  const load = useCallback(async () => {
    try {
      setRows(await getMonthlySummary(year, month));
    } catch (e) {
      setError(e.message || "Errore nel caricamento del riepilogo.");
    }
  }, [year, month]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setEmployeeFilter("");
    setExpandedId(null);
    setDetailByEmployee({});
  }, [year, month]);

  const loadDetail = useCallback(
    async (employeeId) => {
      setDetailLoading(true);
      try {
        const { from, to } = monthRange();
        const shifts = await getShiftsAdmin({ employeeId, dateFrom: from, dateTo: to });
        setDetailByEmployee((prev) => ({ ...prev, [employeeId]: shifts }));
      } catch (e) {
        setError(e.message || "Errore nel caricamento dei turni.");
      } finally {
        setDetailLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [year, month]
  );

  function toggleExpand(employeeId) {
    if (expandedId === employeeId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(employeeId);
    if (!detailByEmployee[employeeId]) loadDetail(employeeId);
  }

  // Una modifica/eliminazione può cambiare ore e costo del mese: ricarico
  // sia il dettaglio del dipendente sia il riepilogo.
  async function onShiftChanged(employeeId) {
    await Promise.all([loadDetail(employeeId), load()]);
  }

  function go(delta) {
    const next = shiftMonth(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  }

  const label = monthLabel(year, month);
  const totals = (rows || []).reduce(
    (acc, r) => ({ minutes: acc.minutes + r.totalMinutes, cost: acc.cost + r.totalCost }),
    { minutes: 0, cost: 0 }
  );

  async function doExport(format) {
    setExporting(true);
    try {
      const scoped = employeeFilter ? rows.filter((r) => r.employeeId === employeeFilter) : rows;
      let details;
      if (employeeFilter) {
        const { from, to } = monthRange();
        const shifts = await getShiftsAdmin({ employeeId: employeeFilter, dateFrom: from, dateTo: to });
        details = shifts.map((s) => ({
          date: s.date,
          startTime: s.startTime,
          endTime: s.endTime,
          minutes: Math.round((new Date(`1970-01-01T${s.endTime}`) - new Date(`1970-01-01T${s.startTime}`)) / 60000),
        }));
      }
      const args = { title: "Riepilogo ORE", periodLabel: label, rows: scoped, details };
      if (format === "pdf") exportSummaryToPdf(args);
      else exportSummaryToExcel(args);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ErrorText>{error}</ErrorText>

      <Card className="flex items-center justify-between px-4 py-3">
        <button onClick={() => go(-1)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <ChevronLeft size={18} />
        </button>
        <span className="text-lg font-700 capitalize text-slate-900 dark:text-white">{label}</span>
        <button onClick={() => go(1)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
          <ChevronRight size={18} />
        </button>
      </Card>

      {!rows ? (
        <div className="flex justify-center py-12">
          <Spinner className="text-indigo-600" size={24} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState>Nessun turno registrato in questo mese.</EmptyState>
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-2.5">Dipendente</th>
                  <th className="px-4 py-2.5">Turni</th>
                  <th className="px-4 py-2.5">Ore</th>
                  <th className="px-4 py-2.5">Costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  const expanded = expandedId === r.employeeId;
                  const detail = detailByEmployee[r.employeeId];
                  return (
                    <React.Fragment key={r.employeeId}>
                      <tr
                        className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900 ${!r.attivo ? "opacity-60" : ""}`}
                        onClick={() => toggleExpand(r.employeeId)}
                      >
                        <td className="px-4 py-2.5 font-600 text-slate-900 dark:text-white">
                          <span className="flex items-center gap-1.5">
                            {expanded ? (
                              <ChevronUp size={14} className="shrink-0 text-slate-400" />
                            ) : (
                              <ChevronDown size={14} className="shrink-0 text-slate-400" />
                            )}
                            {r.nome}
                            {!r.attivo && <span className="text-xs font-400 text-slate-400">(disattivato)</span>}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{r.shiftCount}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatDurationHM(r.totalMinutes)}</td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{formatCurrency(r.totalCost)}</td>
                      </tr>
                      {expanded && (
                        <tr>
                          <td colSpan={4} className="bg-slate-50 px-4 py-3 dark:bg-slate-950">
                            <div className="flex flex-col gap-1.5">
                              {detailLoading && !detail ? (
                                <Spinner size={16} className="text-indigo-600" />
                              ) : !detail || detail.length === 0 ? (
                                <p className="text-sm text-slate-500 dark:text-slate-400">Nessun turno trovato.</p>
                              ) : (
                                detail.map((s) => (
                                  <ShiftRow key={s.id} shift={s} onChanged={() => onShiftChanged(r.employeeId)} />
                                ))
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-700 dark:border-slate-800 dark:bg-slate-900">
                  <td className="px-4 py-2.5 text-slate-900 dark:text-white">Totale</td>
                  <td />
                  <td className="px-4 py-2.5 text-slate-900 dark:text-white">{formatDurationHM(totals.minutes)}</td>
                  <td className="px-4 py-2.5 text-slate-900 dark:text-white">{formatCurrency(totals.cost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:justify-between">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="text-sm font-600 text-slate-700 dark:text-slate-300">Esporta</span>
              <Select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
                <option value="">Tutti i dipendenti (aggregato)</option>
                {rows.map((r) => (
                  <option key={r.employeeId} value={r.employeeId}>
                    {r.nome}
                  </option>
                ))}
              </Select>
            </label>
            <div className="flex gap-2">
              <Button variant="secondary" disabled={exporting} onClick={() => doExport("excel")}>
                {exporting ? <Spinner size={16} /> : <FileSpreadsheet size={16} />} Excel
              </Button>
              <Button variant="secondary" disabled={exporting} onClick={() => doExport("pdf")}>
                {exporting ? <Spinner size={16} /> : <FileDown size={16} />} PDF
              </Button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
