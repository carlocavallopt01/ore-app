import React, { useState, useEffect, useCallback } from "react";
import { Plus, PencilLine } from "lucide-react";
import { getEmployeesAdmin, saveEmployee } from "../../lib/api";
import { formatCurrency } from "../../lib/time";
import { Button, Card, Field, Input, Modal, ErrorText, Spinner, Badge, EmptyState } from "../ui";

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

export default function EmployeesAdmin() {
  const [employees, setEmployees] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (nuovo) | employee

  const load = useCallback(async () => {
    try {
      setEmployees(await getEmployeesAdmin());
    } catch (e) {
      setError(e.message || "Errore nel caricamento dei dipendenti.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const attivi = (employees || []).filter((e) => e.attivo);
  const disattivi = (employees || []).filter((e) => !e.attivo);

  return (
    <div className="flex flex-col gap-6">
      <ErrorText>{error}</ErrorText>
      <Button className="self-start" onClick={() => setEditing({ nome: "", pin: randomPin(), hourlyRate: 0, attivo: true })}>
        <Plus size={16} /> Nuovo dipendente
      </Button>

      {!employees ? (
        <div className="flex justify-center py-12">
          <Spinner className="text-indigo-600" size={24} />
        </div>
      ) : (
        <>
          <Section title="Attivi" items={attivi} onEdit={setEditing} empty="Nessun dipendente attivo." />
          {disattivi.length > 0 && <Section title="Disattivati" items={disattivi} onEdit={setEditing} empty="" />}
        </>
      )}

      {editing && (
        <EmployeeFormModal
          employee={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Section({ title, items, onEdit, empty }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-700 uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h2>
      {items.length === 0 ? (
        <EmptyState>{empty}</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((e) => (
            <Card key={e.id} className={`flex items-center justify-between px-4 py-3 ${!e.attivo ? "opacity-60" : ""}`}>
              <div>
                <p className="font-600 text-slate-900 dark:text-white">{e.nome}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  PIN {e.pin} · {formatCurrency(e.hourlyRate)}/h
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!e.attivo && <Badge tone="slate">Disattivato</Badge>}
                <button
                  onClick={() => onEdit(e)}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <PencilLine size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function EmployeeFormModal({ employee, onClose, onSaved }) {
  const isNew = !employee.id;
  const [nome, setNome] = useState(employee.nome);
  const [pin, setPin] = useState(employee.pin);
  const [hourlyRate, setHourlyRate] = useState(String(employee.hourlyRate));
  const [attivo, setAttivo] = useState(employee.attivo);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!nome.trim()) return setError("Inserisci il nome.");
    if (!/^\d{4}$/.test(pin)) return setError("Il PIN deve avere esattamente 4 cifre.");
    const rate = Number(hourlyRate.replace(",", "."));
    if (Number.isNaN(rate) || rate < 0) return setError("Costo orario non valido.");
    setSaving(true);
    setError("");
    try {
      await saveEmployee({ id: employee.id, nome: nome.trim(), pin, hourlyRate: rate, attivo });
      onSaved();
    } catch (e) {
      if (e.code === "23505" || /duplicate|unique/i.test(e.message || "")) {
        setError("Questo PIN è già usato da un altro dipendente attivo.");
      } else {
        setError(e.message || "Errore nel salvataggio.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={isNew ? "Nuovo dipendente" : "Modifica dipendente"} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
        </Field>
        <Field label="PIN (4 cifre)" hint="Univoco tra i dipendenti attivi.">
          <Input
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            required
          />
        </Field>
        <Field label="Costo orario (€)" hint="Non è mai visibile al dipendente.">
          <Input inputMode="decimal" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} required />
        </Field>
        {!isNew && (
          <label className="flex items-center gap-2 text-sm font-600 text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={attivo} onChange={(e) => setAttivo(e.target.checked)} className="h-4 w-4 rounded" />
            Dipendente attivo
          </label>
        )}
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={saving}>
          {saving ? <Spinner size={16} /> : "Salva"}
        </Button>
      </form>
    </Modal>
  );
}
