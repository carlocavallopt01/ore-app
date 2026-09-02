import React, { useEffect } from "react";
import { Delete } from "lucide-react";

// Tastierino numerico touch-friendly per inserire un codice di `length`
// cifre. Chiama `onComplete(code)` non appena raggiunta la lunghezza.
export default function PinPad({ length, value, onChange, onComplete, error }) {
  useEffect(() => {
    if (value.length === length) onComplete(value);
  }, [value, length, onComplete]);

  function press(digit) {
    if (value.length >= length) return;
    onChange(value + digit);
  }

  function backspace() {
    onChange(value.slice(0, -1));
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3">
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition ${
              i < value.length
                ? "border-indigo-600 bg-indigo-600"
                : "border-slate-300 bg-transparent dark:border-slate-600"
            }`}
          />
        ))}
      </div>
      {error && <p className="text-sm font-600 text-red-600 dark:text-red-400">{error}</p>}
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => press(d)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-xl font-700 text-slate-800 transition active:scale-95 active:bg-slate-200 dark:bg-slate-800 dark:text-white dark:active:bg-slate-700"
          >
            {d}
          </button>
        ))}
        <div />
        <button
          type="button"
          onClick={() => press("0")}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-xl font-700 text-slate-800 transition active:scale-95 active:bg-slate-200 dark:bg-slate-800 dark:text-white dark:active:bg-slate-700"
        >
          0
        </button>
        <button
          type="button"
          onClick={backspace}
          className="flex h-16 w-16 items-center justify-center rounded-full text-slate-500 transition active:scale-95 dark:text-slate-400"
        >
          <Delete size={22} />
        </button>
      </div>
    </div>
  );
}
