import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDurationHM, formatDateShort, formatTimeHM } from "./time";

// `rows`: riepilogo per dipendente nel periodo, es. da get_monthly_summary
//   [{ nome, totalMinutes, totalHours, totalCost, shiftCount }]
// `details` (opzionale, solo per export di un singolo dipendente): elenco
//   turni del periodo [{ date, startTime, endTime, minutes }]
function buildFileBase(title, periodLabel) {
  return `${title}_${periodLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function exportSummaryToExcel({ title, periodLabel, rows, details }) {
  const wb = XLSX.utils.book_new();

  const summarySheet = XLSX.utils.json_to_sheet(
    rows.map((r) => ({
      Dipendente: r.nome,
      "Ore lavorate": formatDurationHM(r.totalMinutes),
      "Turni": r.shiftCount ?? "",
      Costo: r.totalCost,
    }))
  );
  XLSX.utils.book_append_sheet(wb, summarySheet, "Riepilogo");

  if (details && details.length) {
    const detailSheet = XLSX.utils.json_to_sheet(
      details.map((d) => ({
        Data: formatDateShort(d.date),
        Entrata: formatTimeHM(d.startTime),
        Uscita: formatTimeHM(d.endTime),
        Ore: formatDurationHM(d.minutes),
      }))
    );
    XLSX.utils.book_append_sheet(wb, detailSheet, "Turni");
  }

  XLSX.writeFile(wb, `${buildFileBase(title, periodLabel)}.xlsx`);
}

export function exportSummaryToPdf({ title, periodLabel, rows, details }) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.text(periodLabel, 14, 23);

  autoTable(doc, {
    startY: 28,
    head: [["Dipendente", "Ore lavorate", "Turni", "Costo"]],
    body: rows.map((r) => [r.nome, formatDurationHM(r.totalMinutes), r.shiftCount ?? "", formatCurrency(r.totalCost)]),
    foot: [[
      "Totale",
      formatDurationHM(rows.reduce((s, r) => s + r.totalMinutes, 0)),
      rows.reduce((s, r) => s + (r.shiftCount || 0), 0),
      formatCurrency(rows.reduce((s, r) => s + r.totalCost, 0)),
    ]],
    headStyles: { fillColor: [20, 24, 43] },
    footStyles: { fillColor: [230, 230, 230], textColor: [20, 24, 43] },
  });

  if (details && details.length) {
    const lastY = doc.lastAutoTable.finalY || 28;
    doc.setFontSize(11);
    doc.text("Dettaglio turni", 14, lastY + 10);
    autoTable(doc, {
      startY: lastY + 14,
      head: [["Data", "Entrata", "Uscita", "Ore"]],
      body: details.map((d) => [
        formatDateShort(d.date),
        formatTimeHM(d.startTime),
        formatTimeHM(d.endTime),
        formatDurationHM(d.minutes),
      ]),
      headStyles: { fillColor: [20, 24, 43] },
    });
  }

  doc.save(`${buildFileBase(title, periodLabel)}.pdf`);
}
