import { supabase } from "./supabaseClient";

function mapEmployee(row) {
  return {
    id: row.id,
    nome: row.nome,
    pin: row.pin,
    hourlyRate: Number(row.hourly_rate) || 0,
    attivo: row.attivo,
    createdAt: row.created_at,
  };
}

function mapShift(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    locked: row.locked,
    createdAt: row.created_at,
  };
}

function mapEditRequest(row) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    employeeId: row.employee_id,
    motivo: row.motivo,
    stato: row.stato,
    createdAt: row.created_at,
    risoltaAt: row.risolta_at,
    risposta: row.risposta,
    vista: row.vista,
    shift: row.shift
      ? { date: row.shift.date, startTime: row.shift.start_time, endTime: row.shift.end_time }
      : null,
    proposedDate: row.proposed_date,
    proposedStartTime: row.proposed_start_time,
    proposedEndTime: row.proposed_end_time,
  };
}

function mapAbsenceRequest(row) {
  return {
    id: row.id,
    employeeId: row.employee_id,
    dateFrom: row.date_from,
    dateTo: row.date_to,
    interaGiornata: row.intera_giornata,
    timeFrom: row.time_from,
    timeTo: row.time_to,
    motivo: row.motivo,
    stato: row.stato,
    createdAt: row.created_at,
    risoltaAt: row.risolta_at,
    risposta: row.risposta,
    vista: row.vista,
  };
}

function mapPendingHours(row) {
  return {
    employeeId: row.employee_id,
    nome: row.nome,
    hourlyRate: Number(row.hourly_rate) || 0,
    fromDate: row.from_date,
    totalMinutes: Number(row.total_minutes) || 0,
    totalHours: Number(row.total_hours) || 0,
    totalCost: Number(row.total_cost) || 0,
  };
}

function mapMonthlySummary(row) {
  return {
    employeeId: row.employee_id,
    nome: row.nome,
    attivo: row.attivo,
    hourlyRate: Number(row.hourly_rate) || 0,
    totalMinutes: Number(row.total_minutes) || 0,
    totalHours: Number(row.total_hours) || 0,
    totalCost: Number(row.total_cost) || 0,
    shiftCount: Number(row.shift_count) || 0,
  };
}

// ---------------------------------------------------------------------
// Dipendenti
// ---------------------------------------------------------------------
export async function getEmployeesPublic() {
  const { data, error } = await supabase.from("employees_public").select("*").order("nome");
  if (error) throw error;
  return data.map((e) => ({ id: e.id, nome: e.nome }));
}

export async function getEmployeesAdmin() {
  const { data, error } = await supabase.rpc("get_employees_admin");
  if (error) throw error;
  return data.map(mapEmployee);
}

export async function saveEmployee({ id, nome, pin, hourlyRate, attivo }) {
  const { data, error } = await supabase.rpc("admin_save_employee", {
    p_id: id || null,
    p_nome: nome,
    p_pin: pin,
    p_hourly_rate: hourlyRate,
    p_attivo: attivo,
  });
  if (error) throw error;
  return data;
}

export async function verifyEmployeePin(employeeId, pin) {
  const { data, error } = await supabase.rpc("verify_employee_pin", {
    p_employee_id: employeeId,
    p_pin: pin,
  });
  if (error) throw error;
  return Boolean(data);
}

// ---------------------------------------------------------------------
// Codice Titolare
// ---------------------------------------------------------------------
export async function verifyOwnerCode(code) {
  const { data, error } = await supabase.rpc("verify_owner_code", { p_code: code });
  if (error) throw error;
  return Boolean(data);
}

export async function setOwnerCode(code) {
  const { error } = await supabase.rpc("set_owner_code", { p_code: code });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Turni
// ---------------------------------------------------------------------
export async function getShiftsForEmployeeDate(employeeId, date) {
  const { data, error } = await supabase
    .from("shifts")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("date", date)
    .order("start_time");
  if (error) throw error;
  return data.map(mapShift);
}

export async function addShift({ employeeId, date, startTime, endTime }) {
  const { error } = await supabase
    .from("shifts")
    .insert({ employee_id: employeeId, date, start_time: startTime, end_time: endTime, locked: true });
  if (error) throw error;
}

export async function getShiftsAdmin({ employeeId, dateFrom, dateTo } = {}) {
  let query = supabase.from("shifts").select("*").order("date", { ascending: false }).order("start_time");
  if (employeeId) query = query.eq("employee_id", employeeId);
  if (dateFrom) query = query.gte("date", dateFrom);
  if (dateTo) query = query.lte("date", dateTo);
  const { data, error } = await query;
  if (error) throw error;
  return data.map(mapShift);
}

export async function adminUpdateShift({ id, date, startTime, endTime }) {
  const { error } = await supabase.rpc("admin_update_shift", {
    p_shift_id: id,
    p_date: date,
    p_start_time: startTime,
    p_end_time: endTime,
  });
  if (error) throw error;
}

export async function adminDeleteShift(id) {
  const { error } = await supabase.rpc("admin_delete_shift", { p_shift_id: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Richieste di modifica turno
// ---------------------------------------------------------------------
// Correzione di un turno esistente: passare shiftId. Proposta di un turno
// per un giorno passato che non ne ha ancora nessuno: passare invece
// proposedDate/proposedStartTime/proposedEndTime (shiftId omesso).
export async function createEditRequest({ shiftId, employeeId, motivo, proposedDate, proposedStartTime, proposedEndTime }) {
  const { error } = await supabase.from("edit_requests").insert({
    shift_id: shiftId || null,
    employee_id: employeeId,
    motivo: motivo || null,
    proposed_date: proposedDate || null,
    proposed_start_time: proposedStartTime || null,
    proposed_end_time: proposedEndTime || null,
  });
  if (error) throw error;
}

export async function getEditRequestsAdmin() {
  const { data, error } = await supabase
    .from("edit_requests")
    .select("*, shift:shifts(date,start_time,end_time)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapEditRequest);
}

export async function resolveEditRequest(id, accetta, risposta) {
  const { error } = await supabase.rpc("resolve_edit_request", {
    p_id: id,
    p_accetta: accetta,
    p_risposta: risposta || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Richieste di assenza
// ---------------------------------------------------------------------
export async function createAbsenceRequest({
  employeeId,
  dateFrom,
  dateTo,
  interaGiornata,
  timeFrom,
  timeTo,
  motivo,
}) {
  const { error } = await supabase.from("absence_requests").insert({
    employee_id: employeeId,
    date_from: dateFrom,
    date_to: dateTo,
    intera_giornata: interaGiornata,
    time_from: interaGiornata ? null : timeFrom,
    time_to: interaGiornata ? null : timeTo,
    motivo: motivo || null,
  });
  if (error) throw error;
}

export async function getAbsenceRequestsAdmin() {
  const { data, error } = await supabase
    .from("absence_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data.map(mapAbsenceRequest);
}

export async function resolveAbsenceRequest(id, accetta, risposta) {
  const { error } = await supabase.rpc("resolve_absence_request", {
    p_id: id,
    p_accetta: accetta,
    p_risposta: risposta || null,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Esito richieste per il dipendente (mostrato al prossimo accesso col PIN)
// ---------------------------------------------------------------------
export async function getUnseenResolvedRequests(employeeId) {
  const [edits, absences] = await Promise.all([
    supabase
      .from("edit_requests")
      .select("*, shift:shifts(date,start_time,end_time)")
      .eq("employee_id", employeeId)
      .eq("vista", false)
      .neq("stato", "in_attesa")
      .order("risolta_at", { ascending: false }),
    supabase
      .from("absence_requests")
      .select("*")
      .eq("employee_id", employeeId)
      .eq("vista", false)
      .neq("stato", "in_attesa")
      .order("risolta_at", { ascending: false }),
  ]);
  if (edits.error) throw edits.error;
  if (absences.error) throw absences.error;
  return {
    edits: edits.data.map(mapEditRequest),
    absences: absences.data.map(mapAbsenceRequest),
  };
}

export async function markEditRequestSeen(id) {
  const { error } = await supabase.rpc("mark_edit_request_seen", { p_id: id });
  if (error) throw error;
}

export async function markAbsenceRequestSeen(id) {
  const { error } = await supabase.rpc("mark_absence_request_seen", { p_id: id });
  if (error) throw error;
}

// ---------------------------------------------------------------------
// Pagamenti e riepiloghi
// ---------------------------------------------------------------------
export async function getPendingHours() {
  const { data, error } = await supabase.rpc("get_pending_hours");
  if (error) throw error;
  return data.map(mapPendingHours);
}

export async function markPaid(employeeId, dateTo) {
  const { error } = await supabase.rpc("mark_paid", { p_employee_id: employeeId, p_date_to: dateTo });
  if (error) throw error;
}

export async function getMonthlySummary(year, month) {
  const { data, error } = await supabase.rpc("get_monthly_summary", { p_year: year, p_month: month });
  if (error) throw error;
  return data.map(mapMonthlySummary);
}
