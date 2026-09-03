import React, { useState, useEffect, useCallback } from "react";
import { Clock, Plus, Lock, PencilLine, CalendarOff, CalendarDays, ChevronLeft, ArrowRight } from "lucide-react";
import {
  getEmployeesPublic,
  verifyEmployeePin,
  getShiftsForEmployeeDate,
  addShift,
  createEditRequest,
  createAbsenceRequest,
  getUnseenResolvedRequests,
  markEditRequestSeen,
  markAbsenceRequestSeen,
} from "../lib/api";
import { getRomeTodayISO, formatDateLong, formatDateShort, formatTimeHM, minutesBetween, formatDurationHM } from "../lib/time";
import ThemeToggle from "../components/ThemeToggle";
import RefreshButton from "../components/RefreshButton";
import PinPad from "../components/PinPad";
import { Button, Card, Field, Input, Textarea, Modal, ErrorText, EmptyState, Spinner } from "../components/ui";

const today = getRomeTodayISO();

export default function EmployeeSide({ navigate }) {
  const [employees, setEmployees] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState(null); // { id, nome }
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [shifts, setShifts] = useState([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [editRequestFor, setEditRequestFor] = useState(null); // true (scegli data) | oggetto turno | null
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [toast, setToast] = useState("");
  const [notifications, setNotifications] = useState(null); // { edits: [], absences: [] } | null

  useEffect(() => {
    getEmployeesPublic()
      .then(setEmployees)
      .catch((e) => setLoadError(e.message || "Errore nel caricamento dei dipendenti."));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 3000);
    return () => clearTimeout(id);
  }, [toast]);

  const loadToday = useCallback(async (employeeId) => {
    setShiftsLoading(true);
    try {
      const data = await getShiftsForEmployeeDate(employeeId, today);
      setShifts(data);
    } finally {
      setShiftsLoading(false);
    }
  }, []);

  function selectEmployee(emp) {
    setSelected(emp);
    setPinValue("");
    setPinError("");
  }

  function backToGrid() {
    setSelected(null);
    setUnlocked(false);
    setPinValue("");
    setPinError("");
    setShifts([]);
    setNotifications(null);
  }

  const handlePinComplete = useCallback(
    async (pin) => {
      setVerifying(true);
      setPinError("");
      try {
        const ok = await verifyEmployeePin(selected.id, pin);
        if (ok) {
          setUnlocked(true);
          loadToday(selected.id);
          getUnseenResolvedRequests(selected.id)
            .then((n) => {
              if (n.edits.length > 0 || n.absences.length > 0) setNotifications(n);
            })
            .catch(() => {
              // silenzioso: le notifiche non sono critiche per timbrare
            });
        } else {
          setPinError("PIN errato, riprova.");
          setPinValue("");
        }
      } catch (e) {
        setPinError(e.message || "Errore di verifica.");
        setPinValue("");
      } finally {
        setVerifying(false);
      }
    },
    [selected, loadToday]
  );

  if (loadError) {
    return (
      <Shell>
        <Card className="p-6">
          <ErrorText>{loadError}</ErrorText>
        </Card>
      </Shell>
    );
  }

  if (!selected) {
    return (
      <Shell footer navigate={navigate}>
        <h1 className="mb-1 text-2xl font-700 text-slate-900 dark:text-white">ORE</h1>
        <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">Seleziona il tuo nome per timbrare</p>
        {!employees ? (
          <div className="flex justify-center py-12">
            <Spinner className="text-indigo-600" size={28} />
          </div>
        ) : employees.length === 0 ? (
          <EmptyState>Nessun dipendente attivo. Contatta il Titolare.</EmptyState>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {employees.map((e) => (
              <button
                key={e.id}
                onClick={() => selectEmployee(e)}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center shadow-sm transition active:scale-95 dark:border-slate-800 dark:bg-slate-900"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-lg font-700 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {e.nome.trim().charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-600 text-slate-800 dark:text-slate-100">{e.nome}</span>
              </button>
            ))}
          </div>
        )}
      </Shell>
    );
  }

  if (!unlocked) {
    return (
      <Shell>
        <button onClick={backToGrid} className="mb-6 flex items-center gap-1 text-sm font-600 text-slate-500 dark:text-slate-400">
          <ChevronLeft size={16} /> Cambia dipendente
        </button>
        <h1 className="mb-1 text-xl font-700 text-slate-900 dark:text-white">Ciao {selected.nome}</h1>
        <p className="mb-8 text-sm text-slate-500 dark:text-slate-400">Inserisci il tuo PIN a 4 cifre</p>
        <PinPad length={4} value={pinValue} onChange={setPinValue} onComplete={handlePinComplete} error={pinError} />
        {verifying && (
          <div className="mt-6 flex justify-center">
            <Spinner className="text-indigo-600" size={20} />
          </div>
        )}
      </Shell>
    );
  }

  const totalMinutesToday = shifts.reduce((s, sh) => s + minutesBetween(sh.startTime, sh.endTime), 0);

  return (
    <Shell>
      <div className="mb-6 flex items-center justify-between">
        <button onClick={backToGrid} className="flex items-center gap-1 text-sm font-600 text-slate-500 dark:text-slate-400">
          <ChevronLeft size={16} /> Esci
        </button>
        <span className="text-sm font-600 text-slate-800 dark:text-slate-100">{selected.nome}</span>
      </div>

      <h1 className="text-xl font-700 capitalize text-slate-900 dark:text-white">{formatDateLong(today)}</h1>
      <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        {shifts.length === 0 ? "Nessun turno registrato oggi" : `Totale oggi: ${formatDurationHM(totalMinutesToday)}`}
      </p>

      {toast && (
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-600 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          {toast}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3">
        {shiftsLoading ? (
          <div className="flex justify-center py-8">
            <Spinner className="text-indigo-600" size={24} />
          </div>
        ) : shifts.length === 0 ? (
          <EmptyState>Nessun turno oggi. Registra il tuo primo turno.</EmptyState>
        ) : (
          shifts.map((s) => (
            <Card key={s.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-indigo-600 dark:text-indigo-400" />
                <div>
                  <p className="font-600 text-slate-900 dark:text-white">
                    {formatTimeHM(s.startTime)} – {formatTimeHM(s.endTime)}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{formatDurationHM(minutesBetween(s.startTime, s.endTime))}</p>
                </div>
              </div>
              <button
                onClick={() => setEditRequestFor(s)}
                title="Richiedi modifica"
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-600 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <Lock size={13} /> <PencilLine size={13} />
              </button>
            </Card>
          ))
        )}
      </div>

      {showShiftForm ? (
        <ShiftFormInline
          employeeId={selected.id}
          onCancel={() => setShowShiftForm(false)}
          onSaved={() => {
            setShowShiftForm(false);
            loadToday(selected.id);
            setToast("Turno registrato.");
          }}
        />
      ) : (
        <Button size="lg" className="w-full" onClick={() => setShowShiftForm(true)}>
          <Plus size={18} /> Nuovo turno
        </Button>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Button variant="secondary" onClick={() => setEditRequestFor(true)}>
          <CalendarDays size={16} /> Turno di un giorno passato
        </Button>
        <Button variant="secondary" onClick={() => setShowAbsenceModal(true)}>
          <CalendarOff size={16} /> Richiedi assenza
        </Button>
      </div>

      {editRequestFor && (
        <EditRequestModal
          employeeId={selected.id}
          initialShift={editRequestFor === true ? null : editRequestFor}
          onClose={() => setEditRequestFor(null)}
          onSubmitted={() => {
            setEditRequestFor(null);
            setToast("Richiesta inviata. In attesa di approvazione.");
          }}
        />
      )}

      {showAbsenceModal && (
        <AbsenceRequestModal
          employeeId={selected.id}
          onClose={() => setShowAbsenceModal(false)}
          onSubmitted={() => {
            setShowAbsenceModal(false);
            setToast("Richiesta di assenza inviata. In attesa di approvazione.");
          }}
        />
      )}

      {notifications && (notifications.edits.length > 0 || notifications.absences.length > 0) && (
        <NotificationsModal notifications={notifications} setNotifications={setNotifications} />
      )}
    </Shell>
  );
}

function Shell({ children, footer, navigate }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="mx-auto flex max-w-lg flex-col px-4 pb-24 pt-6 sm:pt-10">
        <div className="mb-4 flex justify-end gap-2">
          <RefreshButton />
          <ThemeToggle />
        </div>
        {children}
        {footer && (
          <button
            onClick={() => navigate("/titolare")}
            className="mt-10 flex items-center justify-center gap-1 text-xs font-600 text-slate-400 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-400"
          >
            Area Titolare <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

const STATO_LABEL = { accettata: "Accettata", rifiutata: "Rifiutata" };
const STATO_TONE = { accettata: "text-emerald-700 dark:text-emerald-400", rifiutata: "text-red-700 dark:text-red-400" };

function NotificationsModal({ notifications, setNotifications }) {
  const [busyId, setBusyId] = useState(null);

  async function dismissEdit(item) {
    setBusyId(item.id);
    try {
      await markEditRequestSeen(item.id);
      setNotifications((prev) => ({ ...prev, edits: prev.edits.filter((e) => e.id !== item.id) }));
    } finally {
      setBusyId(null);
    }
  }

  async function dismissAbsence(item) {
    setBusyId(item.id);
    try {
      await markAbsenceRequestSeen(item.id);
      setNotifications((prev) => ({ ...prev, absences: prev.absences.filter((a) => a.id !== item.id) }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title="Esito richieste" onClose={() => {}}>
      <div className="flex flex-col gap-3">
        {notifications.edits.map((r) => (
          <Card key={r.id} className="p-4">
            <p className={`font-700 ${STATO_TONE[r.stato]}`}>
              {r.shift ? "Richiesta di modifica turno" : "Turno per un giorno passato"} · {STATO_LABEL[r.stato]}
            </p>
            {r.shift ? (
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Turno del {formatDateShort(r.shift.date)}, {formatTimeHM(r.shift.startTime)} – {formatTimeHM(r.shift.endTime)}
              </p>
            ) : (
              r.proposedDate && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {formatDateShort(r.proposedDate)}, {formatTimeHM(r.proposedStartTime)} – {formatTimeHM(r.proposedEndTime)}
                  {r.stato === "accettata" ? " (turno aggiunto)" : ""}
                </p>
              )
            )}
            {r.motivo && <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">Tuo motivo: "{r.motivo}"</p>}
            {r.risposta && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">Nota del Titolare: "{r.risposta}"</p>}
            <Button size="sm" className="mt-3" disabled={busyId === r.id} onClick={() => dismissEdit(r)}>
              {busyId === r.id ? <Spinner size={14} /> : "Ho capito"}
            </Button>
          </Card>
        ))}
        {notifications.absences.map((r) => (
          <Card key={r.id} className="p-4">
            <p className={`font-700 ${STATO_TONE[r.stato]}`}>Richiesta di assenza · {STATO_LABEL[r.stato]}</p>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {formatDateShort(r.dateFrom)}
              {r.dateTo !== r.dateFrom ? ` – ${formatDateShort(r.dateTo)}` : ""}
              {r.interaGiornata ? " · giornata intera" : ` · ${formatTimeHM(r.timeFrom)} – ${formatTimeHM(r.timeTo)}`}
            </p>
            {r.motivo && <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">Tuo motivo: "{r.motivo}"</p>}
            {r.risposta && <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">Nota del Titolare: "{r.risposta}"</p>}
            <Button size="sm" className="mt-3" disabled={busyId === r.id} onClick={() => dismissAbsence(r)}>
              {busyId === r.id ? <Spinner size={14} /> : "Ho capito"}
            </Button>
          </Card>
        ))}
      </div>
    </Modal>
  );
}

function ShiftFormInline({ employeeId, onCancel, onSaved }) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!startTime || !endTime) return setError("Inserisci entrambi gli orari.");
    if (endTime <= startTime) return setError("L'uscita deve essere dopo l'entrata.");
    setSaving(true);
    setError("");
    try {
      await addShift({ employeeId, date: today, startTime, endTime });
      onSaved();
    } catch (e) {
      setError(e.message || "Errore nel salvataggio.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-3 p-4">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entrata">
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </Field>
          <Field label="Uscita">
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving ? <Spinner size={16} /> : "Salva turno"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// Due modalità:
// - initialShift dato (click sul lucchetto di un turno di oggi): corregge
//   direttamente quel turno, come prima.
// - nessun initialShift (pulsante "Turno di un giorno passato"): il
//   dipendente sceglie prima una data. Se quel giorno ha già turni li
//   mostra per la correzione; altrimenti (o su richiesta) fa proporre
//   entrata/uscita per un turno nuovo, che verrà creato automaticamente
//   se il Titolare accetta.
function EditRequestModal({ employeeId, initialShift, onClose, onSubmitted }) {
  const [date, setDate] = useState(initialShift?.date || "");
  const [dayShifts, setDayShifts] = useState(initialShift ? [initialShift] : null);
  const [dayLoading, setDayLoading] = useState(false);
  const [selection, setSelection] = useState(initialShift ? { type: "existing", shiftId: initialShift.id } : null);
  const [proposedStart, setProposedStart] = useState("");
  const [proposedEnd, setProposedEnd] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialShift || !date) return;
    setDayLoading(true);
    setError("");
    getShiftsForEmployeeDate(employeeId, date)
      .then((data) => {
        setDayShifts(data);
        setSelection(data.length > 0 ? { type: "existing", shiftId: data[0].id } : { type: "new" });
      })
      .catch((e) => setError(e.message || "Errore nel caricamento."))
      .finally(() => setDayLoading(false));
  }, [date, employeeId, initialShift]);

  async function submit() {
    if (!date) return setError("Seleziona una data.");
    if (!selection) return setError("Seleziona un turno o aggiungine uno nuovo.");
    if (selection.type === "existing") {
      if (!motivo.trim()) return setError("Scrivi il motivo della richiesta.");
    } else {
      if (!proposedStart || !proposedEnd) return setError("Inserisci entrata e uscita.");
      if (proposedEnd <= proposedStart) return setError("L'uscita deve essere dopo l'entrata.");
    }
    setSaving(true);
    setError("");
    try {
      if (selection.type === "existing") {
        await createEditRequest({ shiftId: selection.shiftId, employeeId, motivo: motivo.trim() });
      } else {
        await createEditRequest({
          employeeId,
          motivo: motivo.trim(),
          proposedDate: date,
          proposedStartTime: proposedStart,
          proposedEndTime: proposedEnd,
        });
      }
      onSubmitted();
    } catch (e) {
      setError(e.message || "Errore nell'invio della richiesta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={initialShift ? "Richiedi modifica turno" : "Turno di un giorno passato"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Invia richiesta"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {initialShift ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Turno del {formatDateShort(initialShift.date)}, {formatTimeHM(initialShift.startTime)} – {formatTimeHM(initialShift.endTime)}
          </p>
        ) : (
          <>
            <Field label="Data">
              <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </Field>

            {date && dayLoading && <Spinner size={18} className="text-indigo-600" />}

            {date && !dayLoading && dayShifts && dayShifts.length > 0 && (
              <Field label="Turni già registrati quel giorno">
                <div className="flex flex-col gap-1.5">
                  {dayShifts.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelection({ type: "existing", shiftId: s.id })}
                      className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                        selection?.type === "existing" && selection.shiftId === s.id
                          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      {formatTimeHM(s.startTime)} – {formatTimeHM(s.endTime)}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setSelection({ type: "new" })}
                  className={`mt-2 self-start text-sm font-600 underline ${
                    selection?.type === "new" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  Il turno che cerchi non c'è? Aggiungi un turno mancante per questo giorno
                </button>
              </Field>
            )}

            {date && !dayLoading && dayShifts && dayShifts.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400">Nessun turno registrato per questo giorno. Inserisci gli orari lavorati:</p>
            )}

            {date && !dayLoading && selection?.type === "new" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Entrata">
                  <Input type="time" value={proposedStart} onChange={(e) => setProposedStart(e.target.value)} />
                </Field>
                <Field label="Uscita">
                  <Input type="time" value={proposedEnd} onChange={(e) => setProposedEnd(e.target.value)} />
                </Field>
              </div>
            )}
          </>
        )}

        <Field label={selection?.type === "new" ? "Nota (facoltativa)" : "Motivo"}>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder={selection?.type === "new" ? "Es. giorno lavorato prima di usare l'app" : "Es. ho sbagliato l'orario di uscita"}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

function AbsenceRequestModal({ employeeId, onClose, onSubmitted }) {
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [interaGiornata, setInteraGiornata] = useState(true);
  const [timeFrom, setTimeFrom] = useState("");
  const [timeTo, setTimeTo] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!dateFrom || !dateTo) return setError("Inserisci il periodo.");
    if (dateTo < dateFrom) return setError("La data 'al' deve essere dopo la data 'dal'.");
    if (!interaGiornata && (!timeFrom || !timeTo || timeTo <= timeFrom)) {
      return setError("Inserisci un intervallo orario valido.");
    }
    setSaving(true);
    setError("");
    try {
      await createAbsenceRequest({ employeeId, dateFrom, dateTo, interaGiornata, timeFrom, timeTo, motivo: motivo.trim() });
      onSubmitted();
    } catch (e) {
      setError(e.message || "Errore nell'invio della richiesta.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Richiedi assenza"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Spinner size={16} /> : "Invia richiesta"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dal">
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </Field>
          <Field label="Al">
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm font-600 text-slate-700 dark:text-slate-300">
          <input type="checkbox" checked={interaGiornata} onChange={(e) => setInteraGiornata(e.target.checked)} className="h-4 w-4 rounded" />
          Giornata intera
        </label>
        {!interaGiornata && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dalle">
              <Input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} />
            </Field>
            <Field label="Alle">
              <Input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} />
            </Field>
          </div>
        )}
        <Field label="Motivo (facoltativo)">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Es. visita medica" />
        </Field>
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
