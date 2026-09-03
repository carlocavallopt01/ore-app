import React, { useState } from "react";
import { RotateCw } from "lucide-react";

// Ricarica la pagina. Prima chiede al service worker (PWA) di controllare
// se c'è una versione più recente, così chi ha l'app installata/in cache
// vede subito l'ultimo aggiornamento invece di dover chiudere e riaprire.
export default function RefreshButton() {
  const [spinning, setSpinning] = useState(false);

  async function reload() {
    setSpinning(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update().catch(() => {})));
      }
    } finally {
      window.location.reload();
    }
  }

  return (
    <button
      onClick={reload}
      title="Ricarica pagina"
      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-600 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <RotateCw size={14} className={spinning ? "animate-spin" : ""} />
    </button>
  );
}
