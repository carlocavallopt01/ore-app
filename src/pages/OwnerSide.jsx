import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, Lock, Settings, Users, Clock, Inbox, Wallet, CalendarRange } from "lucide-react";
import {
  verifyOwnerCode,
  setOwnerCode,
  getEditRequestsAdmin,
  getAbsenceRequestsAdmin,
  getNotificationEmail,
  setNotificationEmail,
  hasResendApiKey,
  setResendApiKey,
} from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import RefreshButton from "../components/RefreshButton";
import PinPad from "../components/PinPad";
import { Button, Modal, Field, Input, ErrorText, Spinner } from "../components/ui";
import EmployeesAdmin from "../components/owner/EmployeesAdmin";
import ShiftsAdmin from "../components/owner/ShiftsAdmin";
import RequestsPanel from "../components/owner/RequestsPanel";
import PendingHours from "../components/owner/PendingHours";
import MonthlySummary from "../components/owner/MonthlySummary";

const SESSION_KEY = "ore-owner-unlocked";

const TABS = [
  { key: "richieste", label: "Richieste", icon: Inbox },
  { key: "dapagare", label: "Da pagare", icon: Wallet },
  { key: "dipendenti", label: "Dipendenti", icon: Users },
  { key: "turni", label: "Turni", icon: Clock },
  { key: "riepilogo", label: "Riepilogo", icon: CalendarRange },
];

export default function OwnerSide({ navigate }) {
  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(SESSION_KEY) === "true");
  const [codeValue, setCodeValue] = useState("");
  const [codeError, setCodeError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [tab, setTab] = useState("richieste");
  const [pendingCount, setPendingCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const [edits, absences] = await Promise.all([getEditRequestsAdmin(), getAbsenceRequestsAdmin()]);
      const count =
        edits.filter((r) => r.stato === "in_attesa").length + absences.filter((r) => r.stato === "in_attesa").length;
      setPendingCount(count);
    } catch {
      // silenzioso: il contatore non è critico
    }
  }, []);

  useEffect(() => {
    if (unlocked) refreshPendingCount();
  }, [unlocked, refreshPendingCount]);

  const handleCodeComplete = useCallback(async (code) => {
    setVerifying(true);
    setCodeError("");
    try {
      const ok = await verifyOwnerCode(code);
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, "true");
        setUnlocked(true);
      } else {
        setCodeError("Codice errato, riprova.");
        setCodeValue("");
      }
    } catch (e) {
      setCodeError(e.message || "Errore di verifica.");
      setCodeValue("");
    } finally {
      setVerifying(false);
    }
  }, []);

  function lock() {
    sessionStorage.removeItem(SESSION_KEY);
    setUnlocked(false);
    setCodeValue("");
  }

  if (!unlocked) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
        <div className="mx-auto flex max-w-lg flex-col px-4 pb-24 pt-6 sm:pt-10">
          <div className="mb-4 flex items-center justify-between">
            <button onClick={() => navigate("/")} className="flex items-center gap-1 text-sm font-600 text-slate-500 dark:text-slate-400">
              <ChevronLeft size={16} /> Torna alla timbratura
            </button>
            <div className="flex items-center gap-2">
              <RefreshButton />
              <ThemeToggle />
            </div>
          </div>
          <h1 className="mb-1 text-xl font-700 text-slate-900 dark:text-white">Area Titolare</h1>
          <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">Inserisci il codice a 6 cifre</p>
          <PinPad length={6} value={codeValue} onChange={setCodeValue} onComplete={handleCodeComplete} error={codeError} />
          {verifying && (
            <div className="mt-6 flex justify-center">
              <Spinner className="text-indigo-600" size={20} />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto flex max-w-4xl flex-col px-4 pb-28 pt-6 sm:pt-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-700 text-slate-900 dark:text-white">Area Titolare</h1>
          <div className="flex items-center gap-2">
            <RefreshButton />
            <ThemeToggle />
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Settings size={16} />
            </button>
            <button
              onClick={lock}
              className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              <Lock size={16} />
            </button>
          </div>
        </div>

        <div className="mb-6 flex gap-1.5 overflow-x-auto pb-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-600 transition ${
                  active
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                <Icon size={14} />
                {t.label}
                {t.key === "richieste" && pendingCount > 0 && (
                  <span className={`ml-0.5 rounded-full px-1.5 text-xs ${active ? "bg-white/25" : "bg-red-500 text-white"}`}>
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {tab === "richieste" && <RequestsPanel onResolved={refreshPendingCount} />}
        {tab === "dapagare" && <PendingHours />}
        {tab === "dipendenti" && <EmployeesAdmin />}
        {tab === "turni" && <ShiftsAdmin />}
        {tab === "riepilogo" && <MonthlySummary />}
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function SettingsModal({ onClose }) {
  return (
    <Modal title="Impostazioni" onClose={onClose}>
      <div className="flex flex-col gap-8">
        <OwnerCodeSection />
        <div className="border-t border-slate-200 dark:border-slate-800" />
        <NotificationsSection />
      </div>
    </Modal>
  );
}

function OwnerCodeSection() {
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Il codice deve avere esattamente 6 cifre.");
    if (code !== confirm) return setError("I due codici non coincidono.");
    setSaving(true);
    setError("");
    try {
      await setOwnerCode(code);
      setDone(true);
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="mb-3 text-sm font-700 uppercase tracking-wide text-slate-500 dark:text-slate-400">Codice Titolare</h3>
      {done ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">Codice aggiornato con successo.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nuovo codice (6 cifre)">
            <Input inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Conferma nuovo codice">
            <Input inputMode="numeric" maxLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size={16} /> : "Salva nuovo codice"}
          </Button>
        </form>
      )}
    </div>
  );
}

function NotificationsSection() {
  const [email, setEmail] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    Promise.all([getNotificationEmail(), hasResendApiKey()])
      .then(([e, k]) => {
        setEmail(e);
        setHasKey(k);
      })
      .catch((e) => setError(e.message || "Errore nel caricamento."))
      .finally(() => setLoaded(true));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setDone(false);
    try {
      await setNotificationEmail(email.trim());
      if (apiKey.trim()) {
        await setResendApiKey(apiKey.trim());
        setHasKey(true);
        setApiKey("");
      }
      setDone(true);
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h3 className="mb-1 text-sm font-700 uppercase tracking-wide text-slate-500 dark:text-slate-400">Notifiche email</h3>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Ricevi una email ogni volta che un dipendente invia una richiesta (modifica turno, nuovo turno passato, assenza).
        Serve una chiave API di{" "}
        <a href="https://resend.com" target="_blank" rel="noreferrer" className="underline">
          Resend
        </a>{" "}
        (gratis fino a 3000 email/mese).
      </p>
      {!loaded ? (
        <Spinner size={18} className="text-indigo-600" />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email di destinazione">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tuaemail@esempio.it" />
          </Field>
          <Field
            label="Chiave API Resend"
            hint={hasKey ? "Già impostata — lascia vuoto per non cambiarla." : "Non ancora impostata."}
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasKey ? "••••••••••••" : "re_xxxxxxxxxxxxxxxx"}
              autoComplete="off"
            />
          </Field>
          {done && <p className="text-sm text-emerald-700 dark:text-emerald-400">Impostazioni notifiche salvate.</p>}
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner size={16} /> : "Salva notifiche"}
          </Button>
        </form>
      )}
    </div>
  );
}
