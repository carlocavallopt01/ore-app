import React from "react";
import { Sun, Moon, CircleDot } from "lucide-react";
import { useTheme } from "../context/ThemeContext";

const LABELS = { auto: "Auto", light: "Chiaro", dark: "Scuro" };

export default function ThemeToggle() {
  const { mode, isDark, cycleMode } = useTheme();
  const Icon = mode === "auto" ? CircleDot : isDark ? Moon : Sun;
  return (
    <button
      onClick={cycleMode}
      title="Cambia tema (automatico / chiaro / scuro)"
      className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-600 text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <Icon size={14} />
      {LABELS[mode]}
    </button>
  );
}
