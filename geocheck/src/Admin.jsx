import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';

const EMP_KEY = 'geocheck:employees';
const SITE_KEY = 'geocheck:sites';
const RECORD_KEY = 'geocheck:registros';
const AUTH_KEY = 'geocheck:admin-auth';
const REASONS_KEY = 'geocheck:late-reasons';
const DEFAULT_REASONS = ['Tráfico','Transporte público','Problema con vehículo','Inconveniente personal','Cita médica','Otro'].map((label,i)=>({id:'REASON-'+i,label,active:true}));
export function getLateReasons() { try { const value=JSON.parse(localStorage.getItem(REASONS_KEY)||'null'); return Array.isArray(value) && value.length ? value : DEFAULT_REASONS; } catch { return DEFAULT_REASONS; } }
const DAYS = [
  ['mon', 'Lunes'], ['tue', 'Martes'], ['wed', 'Miércoles'],
  ['thu', 'Jueves'], ['fri', 'Viernes'], ['sat', 'Sábado'], ['sun', 'Domingo'],
];
const defaultSchedule = () => Object.fromEntries(DAYS.map(([key]) => [key, { work: !['sat', 'sun'].includes(key), start: '08:00', end: '17:00' }]));
const demoEmployees = [
  { id: 'EMP-001', name: 'Carlos Medina', pin: '1234', siteId: 'SITE-001', active: true, status: 'Activo', role: '', department: '', schedule: defaultSchedule(), tolerances: { late: 5, earlyIn: 30, earlyOut: 5, lateOut: 30 } },
  { id: 'EMP-002', name: 'Ana Rodríguez', pin: '4821', siteId: 'SITE-001', active: true, status: 'Activo', role: '', department: '', schedule: defaultSchedule(), tolerances: { late: 5, earlyIn: 30, earlyOut: 5, lateOut: 30 } },
  { id: 'EMP-003', name: 'Luis Pérez', pin: '7305', siteId: 'SITE-001', active: true, status: 'Activo', role: '', department: '', schedule: defaultSchedule(), tolerances: { late: 5, earlyIn: 30, earlyOut: 5, lateOut: 30 } },
];
const demoSites = [{ id: 'SITE-001', name: 'Obra Norte', lat: 10.4806, lng: -66.9036, radiusM: 150, accuracyM: 100, active: true }];
const statuses = ['Activo', 'De permiso', 'De vacaciones', 'Cesante'];

function load(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) && value.length ? value : fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function csvCell(value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }
function normalizeEmployee(e) {
  return { ...e, status: e.status || (e.active === false ? 'Cesante' : 'Activo'), schedule: { ...defaultSchedule(), ...(e.schedule || {}) }, tolerances: { late: 5, earlyIn: 30, earlyOut: 5, lateOut: 30, ...(e.tolerances || {}) } };
}
function dateKey(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'), String(d.getDate()).padStart(2,'0')].join('-');
}
function minutes(value) { if (!value || !/^\d{2}:\d{2}$/.test(value)) return null; const [h,m] = value.split(':').map(Number); return h * 60 + m; }
function classify(actual, expected, tolerance, direction) {
  const a = minutes(actual), e = minutes(expected);
  if (a === null || e === null) return 'Sin horario';
  const delta = a - e;
  if (direction === 'entry') return delta < -tolerance ? 'Temprano' : delta > tolerance ? 'Tarde' : 'A tiempo';
  return delta < -tolerance ? 'Temprano' : delta > tolerance ? 'Posterior' : 'A tiempo';
}
function recordRows(records, employees, sites) {
  const groups = new Map();
  records.forEach(r => {
    const day = dateKey(r.timestamp), key = (r.employeeId || '') + '|' + day;
    if (!groups.has(key)) groups.set(key, { day, employeeId: r.employeeId, name: r.name, siteName: r.siteName, device: r.device || '', entrada: '', salida: '', distance: r.distance ?? '', accuracy: r.accuracy ?? '' });
    const row = groups.get(key);
    if (r.tipo === 'entrada') { row.entrada = r.timestamp; row.siteName = r.siteName || row.siteName; row.device = r.device || row.device; row.distance = r.distance ?? row.distance; row.accuracy = r.accuracy ?? row.accuracy; }
    if (r.tipo === 'salida') row.salida = r.timestamp;
  });
  return [...groups.values()].map(row => {
    const emp = employees.find(e => e.id === row.employeeId);
    const weekday = row.day ? ['sun','mon','tue','wed','thu','fri','sat'][new Date(row.day + 'T12:00:00').getDay()] : '';
    const plan = emp?.schedule?.[weekday];
    const expectedIn = plan?.work ? plan.start : '';
    const expectedOut = plan?.work ? plan.end : '';
    const actualIn = row.entrada ? new Date(row.entrada).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    const actualOut = row.salida ? new Date(row.salida).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    const tol = emp?.tolerances || {};
    return {
      'Fecha': row.day, 'Empleado': row.name || emp?.name || '', 'ID empleado': row.employeeId || '',
      'Departamento': emp?.department || '', 'Cargo': emp?.role || '', 'Estado': emp?.status || '',
      'Lugar': row.siteName || sites.find(s => s.id === emp?.siteId)?.name || '',
      'Entrada esperada': expectedIn, 'Entrada registrada': actualIn,
      'Estado entrada': expectedIn && actualIn ? classify(actualIn, expectedIn, Number(tol.late ?? 5), 'entry') : 'Sin registro/horario',
      'Salida esperada': expectedOut, 'Salida registrada': actualOut,
      'Estado salida': expectedOut && actualOut ? classify(actualOut, expectedOut, Number(tol.earlyOut ?? 5), 'exit') : 'Sin registro/horario',
      'Dispositivo': row.device, 'Distancia (m)': row.distance, 'Precisión GPS (m)': row.accuracy,
    };
  }).sort((a,b) => String(a.Fecha).localeCompare(String(b.Fecha)) || String(a.Empleado).localeCompare(String(b.Empleado)));
}

export function getAdminData() {
  return { employees: load(EMP_KEY, demoEmployees).map(normalizeEmployee), sites: load(SITE_KEY, demoSites) };
}
export function getActiveEmployeeByPin(pin) {
  return load(EMP_KEY, demoEmployees).map(normalizeEmployee).find(e => e.pin === pin && e.status === 'Activo' && e.active !== false) || null;
}
export function getActiveSites() { return load(SITE_KEY, demoSites).filter(s => s.active !== false); }

export default function Admin({ onBack }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [authExists, setAuthExists] = useState(() => Boolean(localStorage.getItem(AUTH_KEY)));
  const [loginUser, setLoginUser] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [section, setSection] = useState('employees');
  const [employees, setEmployees] = useState(() => load(EMP_KEY, demoEmployees).map(normalizeEmployee));
  const [sites, setSites] = useState(() => load(SITE_KEY, demoSites));
  const [records, setRecords] = useState(() => load(RECORD_KEY, []));
  const [reasons, setReasons] = useState(() => getLateReasons());
  const [reasonDraft, setReasonDraft] = useState('');
  const emptyEmployee = () => ({ id: '', name: '', pin: '', siteId: '', active: true, status: 'Activo', role: '', department: '', schedule: defaultSchedule(), tolerances: { late: 5, earlyIn: 30, earlyOut: 5, lateOut: 30 } });
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [siteForm, setSiteForm] = useState({ id: '', name: '', lat: '', lng: '', radiusM: 150, accuracyM: 100, active: true });
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [appliedFilters, setAppliedFilters] = useState(()=>({from:dateKey(new Date()),to:dateKey(new Date()),employeeFilter:'',siteFilter:''}));
  const [selectedEmployees, setSelectedEmployees] = useState([]);
  const [selectedSites, setSelectedSites] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [notice, setNotice] = useState('');
  const [bulkPreview, setBulkPreview] = useState(null);
  const [bulkFileName, setBulkFileName] = useState('');

  const persistEmployees = value => { setEmployees(value); save(EMP_KEY, value); };
  const persistSites = value => { setSites(value); save(SITE_KEY, value); };
  const filtered = useMemo(() => records.filter(r => {
    const date = dateKey(r.timestamp);
    return (!appliedFilters.from || date >= appliedFilters.from) && (!appliedFilters.to || date <= appliedFilters.to) && (!appliedFilters.employeeFilter || r.employeeId === appliedFilters.employeeFilter) && (!appliedFilters.siteFilter || (r.siteId || '') === appliedFilters.siteFilter);
  }), [records, appliedFilters]);
  const reportRows = useMemo(() => {
    const rows = recordRows(filtered, employees, sites);
    const today = dateKey(new Date());
    const startDate = appliedFilters.from || appliedFilters.to || today;
    const requestedEndDate = appliedFilters.to || appliedFilters.from || today;
    const endDate = requestedEndDate > today ? today : requestedEndDate;
    const start = new Date(startDate + 'T12:00:00');
    const end = new Date(endDate + 'T12:00:00');
    const dayCount = Math.max(0, Math.min(366, Math.floor((end - start) / 86400000) + 1));
    const attended = new Set(filtered.map(r => (r.employeeId || '') + '|' + dateKey(r.timestamp)));
    const absences = [];
    for (let offset = 0; offset < dayCount; offset++) {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      const dayKey = dateKey(date);
      const weekday = ['sun','mon','tue','wed','thu','fri','sat'][date.getDay()];
      employees.filter(e => e.status === 'Activo' && e.active !== false && (!appliedFilters.employeeFilter || e.id === appliedFilters.employeeFilter) && (!appliedFilters.siteFilter || e.siteId === appliedFilters.siteFilter)).forEach(e => {
        const schedule = e.schedule?.[weekday];
        if (!schedule?.work || attended.has(e.id + '|' + dayKey)) return;
        absences.push({
          'Fecha': dayKey, 'Empleado': e.name, 'ID empleado': e.id,
          'Departamento': e.department || '', 'Cargo': e.role || '', 'Estado': e.status || 'Activo',
          'Lugar': sites.find(s => s.id === e.siteId)?.name || '',
          'Entrada esperada': schedule.start || '', 'Entrada registrada': '',
          'Estado entrada': 'Ausente',
          'Salida esperada': schedule.end || '', 'Salida registrada': '',
          'Estado salida': 'Ausente', 'Dispositivo': '', 'Distancia (m)': '',
          'Precisión GPS (m)': '', 'Motivo / comprobante': ''
        });
      });
    }
    const dayOffRows = rows.filter(row => filtered.some(record => record.employeeId === row['ID empleado'] && dateKey(record.timestamp) === row.Fecha && record.dayOffWork)).map(row => ({...row, 'Estado entrada':'Entrada en día libre', 'Motivo / comprobante': filtered.find(record => record.employeeId === row['ID empleado'] && dateKey(record.timestamp) === row.Fecha && record.dayOffWork)?.dayOffReason || ''}));
    const enrichedRows = rows.map(row => dayOffRows.find(dayOff => dayOff.Fecha === row.Fecha && dayOff['ID empleado'] === row['ID empleado']) || row);
    return [...enrichedRows, ...absences].sort((a,b) => String(a.Fecha).localeCompare(String(b.Fecha)) || String(a.Empleado).localeCompare(String(b.Empleado)));
  }, [filtered, employees, sites, appliedFilters]);

  function handleAuth(event) {
    event.preventDefault(); setAuthError('');
    const user = loginUser.trim();
    if (!user || !/^[a-zA-Z0-9]{6}$/.test(loginPassword)) { setAuthError('La contraseña debe tener exactamente 6 caracteres alfanuméricos.'); return; }
    if (!authExists) {
      localStorage.setItem(AUTH_KEY, JSON.stringify({ user, password: loginPassword }));
      setAuthExists(true); setAuthenticated(true); setLoginPassword(''); setNotice('Acceso de administrador configurado en este navegador.');
      return;
    }
    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
      if (saved && saved.user === user && saved.password === loginPassword) { setAuthenticated(true); setLoginPassword(''); }
      else setAuthError('Usuario o contraseña incorrectos.');
    } catch { setAuthError('No se pudo validar el acceso.'); }
  }

  const employeeTemplateHeaders = [
    'Nombre completo','NIP (4 dígitos)','Lugar asignado (nombre o ID)','Cargo','Departamento','Estado del trabajador',
    ...DAYS.flatMap(([, day]) => [`${day} trabaja (Sí/No)`, `${day} entrada (HH:MM)`, `${day} salida (HH:MM)`]),
    'Retraso permitido al entrar (min)','Anticipación permitida al entrar (min)','Anticipación permitida al salir (min)','Retraso permitido al salir (min)'
  ];
  function employeeTemplateRow() {
    const row = {
      'Nombre completo':'','NIP (4 dígitos)':'','Lugar asignado (nombre o ID)':sites.find(s=>s.active!==false)?.name || '',
      'Cargo':'','Departamento':'','Estado del trabajador':'Activo'
    };
    DAYS.forEach(([key, day]) => {
      const work = !['sat','sun'].includes(key);
      row[`${day} trabaja (Sí/No)`] = work ? 'Sí' : 'No';
      row[`${day} entrada (HH:MM)`] = '08:00';
      row[`${day} salida (HH:MM)`] = '17:00';
    });
    row['Retraso permitido al entrar (min)']=5;
    row['Anticipación permitida al entrar (min)']=30;
    row['Anticipación permitida al salir (min)']=5;
    row['Retraso permitido al salir (min)']=30;
    return row;
  }
  function downloadEmployeeTemplate(format) {
    const row = employeeTemplateRow();
    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet([row], { header: employeeTemplateHeaders });
      ws['!cols'] = employeeTemplateHeaders.map(h => ({ wch: Math.max(16, Math.min(30, h.length + 2)) }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
      XLSX.writeFile(wb, 'plantilla-carga-empleados-quia-check.xlsx');
    } else {
      const rows = [employeeTemplateHeaders, employeeTemplateHeaders.map(h => row[h] ?? '')];
      const blob = new Blob(['\ufeff' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')], {type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href=url; link.download='plantilla-carga-empleados-quia-check.csv'; link.click();
      URL.revokeObjectURL(url);
    }
    setNotice('Plantilla descargada. Completa una fila por empleado y vuelve a subir el archivo.');
  }
  function readBulkEmployees(file) {
    if (!file) return;
    setNotice('');
    setBulkPreview(null);
    setBulkFileName(file.name);
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const workbook = XLSX.read(event.target.result, {type:'array', cellDates:false});
        const first = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(first, {defval:'', raw:false});
        if (!rows.length) { setBulkPreview({rows:[], errors:['El archivo no contiene filas de empleados.'], valid:[]}); return; }
        const existingPins = new Set(employees.map(e=>String(e.pin)));
        const seenPins = new Set();
        const errors = [];
        const valid = [];
        const textValue = value => String(value ?? '').trim();
        const isYes = value => ['si','sí','s','yes','true','1','x'].includes(textValue(value).toLowerCase());
        const timeValid = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(textValue(value));
        rows.forEach((row, index) => {
          const line = index + 2;
          const name = textValue(row['Nombre completo']);
          const pin = textValue(row['NIP (4 dígitos)']).replace(/\.0$/, '');
          const siteInput = textValue(row['Lugar asignado (nombre o ID)']);
          const site = sites.find(s => s.id === siteInput || s.name.toLowerCase() === siteInput.toLowerCase());
          const status = textValue(row['Estado del trabajador']) || 'Activo';
          const errorsForRow = [];
          if (!name) errorsForRow.push('falta Nombre completo');
          if (!/^\d{4}$/.test(pin)) errorsForRow.push('NIP debe tener 4 dígitos');
          if (pin && (existingPins.has(pin) || seenPins.has(pin))) errorsForRow.push('NIP duplicado');
          if (pin) seenPins.add(pin);
          if (!site || site.active === false) errorsForRow.push('Lugar asignado no existe o está inactivo');
          if (!statuses.includes(status)) errorsForRow.push('Estado no válido');
          const schedule = {};
          DAYS.forEach(([key, day]) => {
            const workValue = row[`${day} trabaja (Sí/No)`];
            const work = isYes(workValue);
            const start = textValue(row[`${day} entrada (HH:MM)`]) || '08:00';
            const end = textValue(row[`${day} salida (HH:MM)`]) || '17:00';
            if (work && !timeValid(start)) errorsForRow.push(`${day}: hora de entrada inválida`);
            if (work && !timeValid(end)) errorsForRow.push(`${day}: hora de salida inválida`);
            schedule[key] = {work, start, end};
          });
          const toleranceFields = [
            ['late','Retraso permitido al entrar (min)',5],
            ['earlyIn','Anticipación permitida al entrar (min)',30],
            ['earlyOut','Anticipación permitida al salir (min)',5],
            ['lateOut','Retraso permitido al salir (min)',30]
          ];
          const tolerances = {};
          toleranceFields.forEach(([key, header, fallback]) => {
            const raw = textValue(row[header]);
            const value = raw === '' ? fallback : Number(raw);
            if (!Number.isInteger(value) || value < 0 || value > 240) errorsForRow.push(`${header}: usa un número entre 0 y 240`);
            tolerances[key] = value;
          });
          if (errorsForRow.length) errors.push(`Fila ${line}: ${errorsForRow.join('; ')}.`);
          else valid.push(normalizeEmployee({
            id:'EMP-' + (Date.now().toString().slice(-6)) + '-' + String(index+1).padStart(3,'0'),
            name, pin, siteId:site.id, role:textValue(row['Cargo']), department:textValue(row['Departamento']),
            status, active:status === 'Activo', schedule, tolerances
          }));
        });
        setBulkPreview({rows, errors, valid});
      } catch {
        setBulkPreview({rows:[], errors:['No se pudo leer el archivo. Usa una plantilla CSV o Excel (.xlsx) descargada desde esta pantalla.'], valid:[]});
      }
    };
    reader.onerror = () => setBulkPreview({rows:[],errors:['No se pudo leer el archivo seleccionado.'],valid:[]});
    reader.readAsArrayBuffer(file);
  }
  function importBulkEmployees() {
    if (!bulkPreview || bulkPreview.errors.length || !bulkPreview.valid.length) return;
    const next = [...employees, ...bulkPreview.valid];
    persistEmployees(next);
    setBulkPreview(null); setBulkFileName('');
    setNotice(`Carga completada: se agregaron ${next.length - employees.length} empleados. Los datos quedaron guardados en este navegador.`);
  }

  function deleteSelectedEmployees() {
    if (!selectedEmployees.length) { setNotice('Selecciona al menos un empleado.'); return; }
    const names = employees.filter(e => selectedEmployees.includes(e.id)).map(e => e.name);
    if (!window.confirm(`¿Eliminar ${names.length} empleado(s) seleccionado(s)? Sus registros históricos se conservarán.`)) return;
    persistEmployees(employees.filter(e => !selectedEmployees.includes(e.id)));
    setSelectedEmployees([]);
    setNotice(`Se eliminaron ${names.length} empleado(s). Los registros históricos se conservaron.`);
  }
  function deleteSite(site) {
    if (!window.confirm(`¿Eliminar el lugar «${site.name}»? Los empleados asignados y los registros históricos conservarán sus datos, pero ya no podrán seleccionarlo como lugar activo.`)) return;
    persistSites(sites.filter(s => s.id !== site.id));
    setSelectedSites(items => items.filter(id => id !== site.id));
    setNotice(`Se eliminó el lugar «${site.name}».`);
  }
  function deleteSelectedSites() {
    if (!selectedSites.length) { setNotice('Selecciona al menos un lugar.'); return; }
    if (!window.confirm(`¿Eliminar ${selectedSites.length} lugar(es) seleccionado(s)?`)) return;
    persistSites(sites.filter(s => !selectedSites.includes(s.id)));
    setSelectedSites([]);
    setNotice(`Se eliminaron ${selectedSites.length} lugar(es).`);
  }

  function deleteEmployee(employee) {
    const confirmed = window.confirm(`¿Eliminar a ${employee.name} del directorio? Esta acción no se puede deshacer. Los registros de asistencia anteriores se conservarán.`);
    if (!confirmed) return;
    const next = employees.filter(e => e.id !== employee.id);
    persistEmployees(next);
    if (employeeForm.id === employee.id) setEmployeeForm({ ...emptyEmployee(), siteId: sites[0]?.id || '' });
    setNotice(`Se eliminó a ${employee.name} del directorio. Se conservaron sus registros históricos.`);
  }

  function saveEmployee(event) {
    event.preventDefault();
    const name = employeeForm.name.trim(), pin = employeeForm.pin.trim();
    if (!name || !/^\d{4}$/.test(pin) || !employeeForm.siteId) { setNotice('Completa nombre, NIP de 4 dígitos y lugar asignado.'); return; }
    if (employees.some(e => e.pin === pin && e.id !== employeeForm.id)) { setNotice('Ese NIP ya está asignado a otro empleado.'); return; }
    const status = employeeForm.status || 'Activo';
    const id = employeeForm.id || 'EMP-' + Date.now().toString().slice(-7);
    const item = normalizeEmployee({ ...employeeForm, id, name, pin, status, active: status === 'Activo' });
    const next = employeeForm.id ? employees.map(e => e.id === id ? item : e) : [...employees, item];
    persistEmployees(next); setEmployeeForm({ ...emptyEmployee(), siteId: sites[0]?.id || '' }); setNotice('Empleado guardado en este navegador.');
  }
  function saveSite(event) {
    event.preventDefault();
    const lat = Number(siteForm.lat), lng = Number(siteForm.lng), radiusM = Number(siteForm.radiusM), accuracyM = Number(siteForm.accuracyM);
    if (!siteForm.name.trim() || !siteForm.lat || !siteForm.lng || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 || radiusM < 1 || accuracyM < 1) { setNotice('Revisa nombre, coordenadas, radio y precisión GPS.'); return; }
    const id = siteForm.id || 'SITE-' + Date.now().toString().slice(-7);
    const item = { ...siteForm, id, name: siteForm.name.trim(), lat, lng, radiusM, accuracyM, active: siteForm.active };
    persistSites(siteForm.id ? sites.map(s => s.id === id ? item : s) : [...sites, item]);
    setEmployeeForm(f => ({ ...f, siteId: f.siteId || id }));
    setSiteForm({ id: '', name: '', lat: '', lng: '', radiusM: 150, accuracyM: 100, active: true }); setNotice('Lugar guardado en este navegador.');
  }
  function exportReport() {
    const headers = Object.keys(reportRows[0] || { 'Fecha':'', 'Empleado':'', 'ID empleado':'', 'Entrada esperada':'', 'Entrada registrada':'', 'Estado entrada':'', 'Salida esperada':'', 'Salida registrada':'', 'Estado salida':'', 'Dispositivo':'', 'Distancia (m)':'', 'Precisión GPS (m)':'' });
    const baseName = 'geocheck-reporte-asistencia';
    if (exportFormat === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(reportRows, { header: headers });
      ws['!cols'] = headers.map(h => ({ wch: Math.max(14, Math.min(28, h.length + 3)) }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Asistencia'); XLSX.writeFile(wb, baseName + '.xlsx');
    } else if (exportFormat === 'csv') {
      const rows = [headers, ...reportRows.map(row => headers.map(h => row[h] ?? ''))];
      const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = baseName + '.csv'; a.click(); URL.revokeObjectURL(url);
    } else {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      pdf.setFontSize(14); pdf.text('GeoCheck - Reporte de asistencia', 35, 35);
      pdf.setFontSize(8);
      const cols = headers;
      const maxRowsPerPage = 22;
      reportRows.forEach((row, index) => {
        if (index > 0 && index % maxRowsPerPage === 0) { pdf.addPage(); pdf.setFontSize(8); }
        const y = 58 + (index % maxRowsPerPage) * 22;
        let x = 35;
        cols.forEach((h, colIndex) => {
          const widths = [52,72,48,60,50,55,65,55,55,70,55,55,65,90,45,55];
          const w = widths[colIndex] || 55;
          const text = String(row[h] ?? '').slice(0, 20);
          pdf.text(text, x, y, { maxWidth: w - 3 }); x += w;
        });
      });
      pdf.save(baseName + '.pdf');
    }
    setNotice('Exportación preparada: ' + exportFormat.toUpperCase() + '.');
  }
  function refreshRecords() { setRecords(load(RECORD_KEY, [])); setNotice('Historial actualizado.'); }
  function persistReasons(next) { setReasons(next); save(REASONS_KEY,next); }
  function addReason(event) { event.preventDefault(); const label=reasonDraft.trim(); if(!label) return; if(reasons.some(r=>r.label.toLowerCase()===label.toLowerCase())) { setNotice('Ese motivo ya existe.'); return; } persistReasons([...reasons,{id:'REASON-'+Date.now(),label,active:true}]); setReasonDraft(''); setNotice('Motivo agregado.'); }
  function uploadProof(recordId,file) { if(!file) return; if(file.size>5*1024*1024) { setNotice('El archivo debe pesar 5 MB o menos.'); return; } const reader=new FileReader(); reader.onload=()=>{ const next=records.map(r=>r.id===recordId?{...r,medicalProof:{name:file.name,type:file.type,data:reader.result}}:r); setRecords(next); save(RECORD_KEY,next); setNotice('Comprobante adjuntado al registro.'); }; reader.readAsDataURL(file); }
  function openProof(proof) { if(!proof?.data) return; const w=window.open(); if(w && proof.type?.startsWith('image/')) w.document.write('<img alt="Comprobante médico" style="max-width:100%" src="'+proof.data+'"/>'); else if(w) w.location.href=proof.data; }
  const fieldStyle = { width: '100%', padding: '10px 12px', border: '1px solid #D5CCFF', borderRadius: '10px', marginTop: '5px', background:'#fff', color:'#0F1226' };
  const labelStyle = { display: 'block', fontSize: '13px', marginBottom: '10px', color: '#5D6078', fontWeight:600 };
  const buttonStyle = { border: '1px solid #D5CCFF', borderRadius: '999px', padding: '10px 15px', background: '#fff', color: '#5B3DF5', fontWeight: 700 };
  const primary = { ...buttonStyle, background: '#5B3DF5', color: '#fff', borderColor: '#5B3DF5' };

  if (!authenticated) return <div className="admin-shell admin-theme"><section className="admin-card admin-login-card" style={{ maxWidth: 460, margin: '8vh auto' }}>
    <p className="admin-eyebrow">GEOCHECK · ACCESO RESTRINGIDO</p><h1>{authExists ? 'Iniciar sesión' : 'Configurar administrador'}</h1>
    <p>{authExists ? 'Introduce tu usuario y contraseña de administrador.' : 'Crea el usuario y la contraseña inicial de administrador. La contraseña debe tener 6 caracteres alfanuméricos.'}</p>
    <form onSubmit={handleAuth}><label style={labelStyle}>Usuario<input style={fieldStyle} autoComplete="username" value={loginUser} onChange={e => setLoginUser(e.target.value)} required /></label>
      <label style={labelStyle}>Contraseña (6 caracteres alfanuméricos)<input style={fieldStyle} type="password" autoComplete={authExists ? 'current-password' : 'new-password'} minLength={6} maxLength={6} pattern="[A-Za-z0-9]{6}" value={loginPassword} onChange={e => setLoginPassword(e.target.value.replace(/[^a-zA-Z0-9]/g, '').slice(0,6))} required /></label>
      {authError && <p className="admin-notice" role="alert">{authError}</p>}
      <button style={primary} type="submit">{authExists ? 'Entrar al panel' : 'Guardar acceso y entrar'}</button>
    </form><p className="admin-warning">Versión local de prueba: las credenciales se guardan en este navegador y no equivalen a autenticación segura de servidor.</p><button style={buttonStyle} onClick={onBack}>Volver al checador</button>
  </section></div>;

  return <div className="admin-shell admin-theme">
    <header className="admin-header"><div><p className="admin-eyebrow">GEOCHECK · ADMINISTRACIÓN</p><h1>Panel de control</h1><p>Gestiona empleados, lugares de trabajo y reportes.</p></div><div className="admin-actions"><button style={buttonStyle} onClick={() => { setAuthenticated(false); setLoginPassword(''); }}>Bloquear panel</button><button style={buttonStyle} onClick={onBack}>Volver al checador</button></div></header>
    <nav className="admin-nav">{[['employees','Empleados'],['sites','Lugares'],['reports','Historial y reportes']].map(([id,label]) => <button key={id} style={section === id ? primary : buttonStyle} onClick={() => { setSection(id); setNotice(''); }}>{label}</button>)}</nav>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {section === 'employees' && <><section className="admin-card bulk-employees-card">
      <div className="bulk-title-row"><div><p className="admin-eyebrow">CARGA MASIVA</p><h2>Importar empleados desde Excel o CSV</h2><p>Descarga la plantilla, completa una fila por empleado y súbela. Incluye los mismos datos del formulario manual: NIP, lugar, cargo, departamento, estado, horario semanal y tolerancias.</p></div><div className="bulk-download-actions"><button style={primary} type="button" onClick={()=>downloadEmployeeTemplate('xlsx')}>Descargar plantilla Excel</button><button style={buttonStyle} type="button" onClick={()=>downloadEmployeeTemplate('csv')}>Descargar plantilla CSV</button></div></div>
      <div className="bulk-upload-row"><label className="bulk-file-label">Seleccionar archivo CSV o Excel<input type="file" accept=".csv,.xlsx,.xls" onChange={e=>readBulkEmployees(e.target.files?.[0])}/></label><span className="bulk-file-name">{bulkFileName || 'Ningún archivo seleccionado'}</span></div>
      <p className="admin-warning">El lugar debe coincidir con el nombre o ID de un lugar activo ya registrado. Los NIP deben ser únicos y tener exactamente 4 dígitos. Si una fila tiene errores, no se importa ninguna fila hasta corregir el archivo.</p>
      {bulkPreview && <div className="bulk-preview" aria-live="polite"><h3>Revisión del archivo</h3><p>Filas leídas: <strong>{bulkPreview.rows.length}</strong> · Válidas: <strong>{bulkPreview.valid.length}</strong> · Errores: <strong>{bulkPreview.errors.length}</strong></p>
        {bulkPreview.errors.length > 0 && <div className="bulk-errors"><strong>Corrige lo siguiente:</strong><ul>{bulkPreview.errors.slice(0,30).map((error,i)=><li key={i}>{error}</li>)}</ul>{bulkPreview.errors.length>30 && <p>Se muestran los primeros 30 errores.</p>}</div>}
        {bulkPreview.errors.length === 0 && bulkPreview.valid.length > 0 && <div className="bulk-success">El archivo está listo para importar {bulkPreview.valid.length} empleado(s).</div>}
        <div className="admin-actions"><button type="button" style={primary} disabled={bulkPreview.errors.length>0 || !bulkPreview.valid.length} onClick={importBulkEmployees}>Importar {bulkPreview.valid.length} empleados</button><button type="button" style={buttonStyle} onClick={()=>{setBulkPreview(null);setBulkFileName('');}}>Cancelar</button></div>
      </div>}
    </section><section className="admin-grid">
      <form className="admin-card" onSubmit={saveEmployee}><h2>{employeeForm.id ? 'Editar empleado' : 'Agregar empleado'}</h2>
        <label style={labelStyle}>Nombre completo<input style={fieldStyle} value={employeeForm.name} onChange={e => setEmployeeForm({ ...employeeForm, name: e.target.value })} required /></label>
        <label style={labelStyle}>NIP (4 dígitos)<input style={fieldStyle} inputMode="numeric" maxLength={4} value={employeeForm.pin} onChange={e => setEmployeeForm({ ...employeeForm, pin: e.target.value.replace(/\D/g, '').slice(0,4) })} required /></label>
        <label style={labelStyle}>Lugar asignado<select style={fieldStyle} value={employeeForm.siteId} onChange={e => setEmployeeForm({ ...employeeForm, siteId: e.target.value })} required><option value="">Selecciona lugar</option>{sites.filter(s => s.active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label style={labelStyle}>Cargo<input style={fieldStyle} value={employeeForm.role} onChange={e => setEmployeeForm({ ...employeeForm, role: e.target.value })} /></label>
        <label style={labelStyle}>Departamento<input style={fieldStyle} value={employeeForm.department} onChange={e => setEmployeeForm({ ...employeeForm, department: e.target.value })} /></label>
        <label style={labelStyle}>Estado del trabajador<select style={fieldStyle} value={employeeForm.status} onChange={e => setEmployeeForm({ ...employeeForm, status: e.target.value, active: e.target.value === 'Activo' })}>{statuses.map(s => <option key={s}>{s}</option>)}</select></label>
        <h3>Horario semanal</h3><p className="admin-warning">Desmarca los días libres. Configura entrada y salida para cada día laborable.</p>
        {DAYS.map(([key,label]) => <div key={key} className="admin-day-row"><label><input type="checkbox" checked={Boolean(employeeForm.schedule?.[key]?.work)} onChange={e => setEmployeeForm(f => ({ ...f, schedule: { ...f.schedule, [key]: { ...(f.schedule?.[key] || { start:'08:00', end:'17:00' }), work:e.target.checked } } }))} /> {label}</label><label>Entrada<input style={fieldStyle} type="time" disabled={!employeeForm.schedule?.[key]?.work} value={employeeForm.schedule?.[key]?.start || '08:00'} onChange={e => setEmployeeForm(f => ({ ...f, schedule: { ...f.schedule, [key]: { ...f.schedule[key], start:e.target.value } } }))} /></label><label>Salida<input style={fieldStyle} type="time" disabled={!employeeForm.schedule?.[key]?.work} value={employeeForm.schedule?.[key]?.end || '17:00'} onChange={e => setEmployeeForm(f => ({ ...f, schedule: { ...f.schedule, [key]: { ...f.schedule[key], end:e.target.value } } }))} /></label></div>)}
        <h3>Tolerancias permitidas (minutos)</h3>
        {[['late','Retraso permitido al entrar'],['earlyIn','Anticipación permitida al entrar'],['earlyOut','Anticipación permitida al salir'],['lateOut','Retraso permitido al salir']].map(([key,label]) => <label key={key} style={labelStyle}>{label}<input style={fieldStyle} type="number" min="0" max="240" value={employeeForm.tolerances?.[key] ?? 0} onChange={e => setEmployeeForm(f => ({ ...f, tolerances: { ...f.tolerances, [key]: Number(e.target.value) } }))} required /></label>)}
        <div className="admin-actions"><button style={primary} type="submit">Guardar empleado</button><button style={buttonStyle} type="button" onClick={() => setEmployeeForm({ ...emptyEmployee(), siteId: sites[0]?.id || '' })}>Limpiar</button></div>
      </form>
      <section className="admin-card"><h2>Directorio ({employees.length})</h2><div className="admin-actions"><button type="button" style={buttonStyle} onClick={()=>setSelectedEmployees(selectedEmployees.length===employees.length?[]:employees.map(e=>e.id))}>{selectedEmployees.length===employees.length?'Deseleccionar todos':'Seleccionar todos'}</button><button type="button" style={{...buttonStyle,color:'#B42318',borderColor:'#F3B5AE'}} onClick={deleteSelectedEmployees}>Eliminar seleccionados ({selectedEmployees.length})</button></div>{employees.length === 0 && <p>No hay empleados registrados.</p>}<div className="admin-list">{employees.map(e => <article className="admin-list-item" key={e.id}><label><input type="checkbox" checked={selectedEmployees.includes(e.id)} onChange={ev=>setSelectedEmployees(items=>ev.target.checked?[...items,e.id]:items.filter(id=>id!==e.id))} aria-label={`Seleccionar ${e.name}`} /></label><div><strong>{e.name}</strong><p>{e.id} · NIP {e.pin} · {sites.find(s => s.id === e.siteId)?.name || 'Sin lugar'}</p><p>{e.role || 'Sin cargo'} · {e.department || 'Sin departamento'}</p><span className={e.status === 'Activo' ? 'admin-status' : 'admin-status inactive'}>{e.status}</span></div><div className="admin-actions"><button type="button" style={buttonStyle} onClick={() => setEmployeeForm(normalizeEmployee(e))}>Editar</button><button type="button" style={{...buttonStyle, color:'#B42318', borderColor:'#F3B5AE'}} onClick={() => deleteEmployee(e)}>Eliminar</button></div></article>)}</div><p className="admin-warning">Demo local: NIP y datos se guardan en este navegador. No uses datos sensibles reales hasta configurar un servidor seguro.</p></section>
    </section></>}
    {section === 'sites' && <section className="admin-grid">
      <form className="admin-card" onSubmit={saveSite}><h2>{siteForm.id ? 'Editar lugar' : 'Agregar lugar'}</h2>
        <label style={labelStyle}>Nombre del lugar<input style={fieldStyle} value={siteForm.name} onChange={e => setSiteForm({ ...siteForm, name: e.target.value })} required /></label>
        <label style={labelStyle}>Latitud<input style={fieldStyle} type="number" step="any" value={siteForm.lat} onChange={e => setSiteForm({ ...siteForm, lat: e.target.value })} placeholder="Ej. 10.4806" required /></label>
        <label style={labelStyle}>Longitud<input style={fieldStyle} type="number" step="any" value={siteForm.lng} onChange={e => setSiteForm({ ...siteForm, lng: e.target.value })} placeholder="Ej. -66.9036" required /></label>
        <label style={labelStyle}>Radio permitido (metros)<input style={fieldStyle} type="number" min="1" value={siteForm.radiusM} onChange={e => setSiteForm({ ...siteForm, radiusM: e.target.value })} required /></label>
        <label style={labelStyle}>Accuracy / precisión GPS máxima (metros)<input style={fieldStyle} type="number" min="1" value={siteForm.accuracyM} onChange={e => setSiteForm({ ...siteForm, accuracyM: e.target.value })} required /></label>
        <label style={labelStyle}><input type="checkbox" checked={siteForm.active} onChange={e => setSiteForm({ ...siteForm, active: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} />Lugar activo</label>
        <div className="admin-actions"><button style={primary} type="submit">Guardar lugar</button><button style={buttonStyle} type="button" onClick={() => setSiteForm({ id:'', name:'', lat:'', lng:'', radiusM:150, accuracyM:100, active:true })}>Limpiar</button></div>
        <p className="admin-warning">Accuracy establece la precisión GPS máxima aceptada para este lugar. Reemplaza las coordenadas de ejemplo por las reales.</p>
      </form>
      <section className="admin-card"><h2>Lugares registrados ({sites.length})</h2><div className="admin-actions"><button type="button" style={buttonStyle} onClick={()=>setSelectedSites(selectedSites.length===sites.length?[]:sites.map(s=>s.id))}>{selectedSites.length===sites.length?'Deseleccionar todos':'Seleccionar todos'}</button><button type="button" style={{...buttonStyle,color:'#B42318',borderColor:'#F3B5AE'}} onClick={deleteSelectedSites}>Eliminar seleccionados ({selectedSites.length})</button></div><div className="admin-list">{sites.map(s => <article className="admin-list-item" key={s.id}><label><input type="checkbox" checked={selectedSites.includes(s.id)} onChange={ev=>setSelectedSites(items=>ev.target.checked?[...items,s.id]:items.filter(id=>id!==s.id))} aria-label={`Seleccionar ${s.name}`} /></label><div><strong>{s.name}</strong><p>{s.lat}, {s.lng} · Radio {s.radiusM} m · Accuracy ±{s.accuracyM ?? 100} m</p><span className={s.active === false ? 'admin-status inactive' : 'admin-status'}>{s.active === false ? 'Inactivo' : 'Activo'}</span></div><div className="admin-actions"><button style={buttonStyle} onClick={() => setSiteForm({ ...s, lat: String(s.lat), lng: String(s.lng), radiusM: String(s.radiusM), accuracyM: String(s.accuracyM ?? 100) })}>Editar</button><button type="button" style={{...buttonStyle,color:'#B42318',borderColor:'#F3B5AE'}} onClick={()=>deleteSite(s)}>Eliminar</button></div></article>)}</div></section>
    </section>}
    {section === 'reasons' && <section className="admin-card"><h2>Motivos de retraso</h2><p>Estas opciones aparecerán al empleado cuando el sistema detecte una entrada tardía. La opción Otro exige una explicación.</p><form onSubmit={addReason} className="admin-actions"><input style={{...fieldStyle,maxWidth:360}} value={reasonDraft} onChange={e=>setReasonDraft(e.target.value)} placeholder="Nuevo motivo" required maxLength={80}/><button style={primary} type="submit">Agregar motivo</button></form><div className="admin-list">{reasons.map(reason=><article className="admin-list-item" key={reason.id}><div><strong>{reason.label}</strong><p>{reason.active===false?'Desactivado':'Disponible para empleados'}</p></div><div className="admin-actions">{reason.label!=='Otro' && <button style={buttonStyle} onClick={()=>{const nextLabel=window.prompt('Editar motivo',reason.label); if(nextLabel?.trim()) persistReasons(reasons.map(r=>r.id===reason.id?{...r,label:nextLabel.trim()}:r));}}>Editar</button>}<button style={buttonStyle} onClick={()=>persistReasons(reasons.map(r=>r.id===reason.id?{...r,active:r.active===false}:r))}>{reason.active===false?'Activar':'Desactivar'}</button></div></article>)}</div><p className="admin-warning">Los cambios se guardan en este navegador. La opción Otro se mantiene como opción especial para exigir explicación.</p></section>}\n    {section === 'reports' && <section className="admin-card"><div className="admin-report-heading"><div><h2>Historial de asistencia</h2><p>{reportRows.length} fila(s) de asistencia y ausencias con los filtros seleccionados.</p></div><div className="admin-actions"><button style={buttonStyle} onClick={refreshRecords}>Actualizar datos</button></div></div>
      <div className="admin-filters"><label style={labelStyle}>Desde<input style={fieldStyle} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label style={labelStyle}>Hasta<input style={fieldStyle} type="date" value={to} onChange={e => setTo(e.target.value)} /></label><label style={labelStyle}>Empleado<select style={fieldStyle} value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}><option value="">Todos</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label style={labelStyle}>Lugar<select style={fieldStyle} value={siteFilter} onChange={e => setSiteFilter(e.target.value)}><option value="">Todos</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div><div className="admin-actions"><button type="button" style={primary} onClick={()=>{setAppliedFilters({from,to,employeeFilter,siteFilter});setNotice('Filtros aplicados.');}}>Buscar</button><button type="button" style={buttonStyle} onClick={()=>{setFrom('');setTo('');setEmployeeFilter('');setSiteFilter('');setAppliedFilters({from:dateKey(new Date()),to:dateKey(new Date()),employeeFilter:'',siteFilter:''});setNotice('Filtros limpiados. Se muestran los registros de hoy.');}}>Limpiar</button></div>
      <label style={labelStyle}>Formato de exportación<select style={fieldStyle} value={exportFormat} onChange={e => setExportFormat(e.target.value)}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV</option><option value="pdf">PDF</option></select></label>
      <div className="admin-actions"><button style={primary} onClick={exportReport}>Exportar reporte</button><button type="button" style={buttonStyle} onClick={()=>{const today=dateKey(new Date());setFrom('');setTo('');setEmployeeFilter('');setSiteFilter('');setAppliedFilters({from:today,to:today,employeeFilter:'',siteFilter:''});setNotice('Panel de reporte limpiado. Se muestran las entradas y salidas de hoy.');}}>Limpiar panel</button></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Fecha</th><th>Empleado</th><th>Entrada prevista/real</th><th>Estado entrada</th><th>Salida prevista/real</th><th>Estado salida</th><th>Dispositivo</th><th>Motivo / comprobante</th></tr></thead><tbody>{reportRows.map((r,i) => <tr key={r['ID empleado'] + r.Fecha + i}><td>{r.Fecha}</td><td>{r.Empleado}<small>{r['ID empleado']}</small></td><td>{r['Entrada esperada'] || '—'} / {r['Entrada registrada'] || '—'}</td><td>{r['Estado entrada']}</td><td>{r['Salida esperada'] || '—'} / {r['Salida registrada'] || '—'}</td><td>{r['Estado salida']}</td><td>{r.Dispositivo || '—'}</td><td>{(()=>{const rec=filtered.find(x=>x.employeeId===r['ID empleado'] && dateKey(x.timestamp)===r.Fecha && x.tipo==='entrada'); return rec ? <div>{rec.dayOffWork ? 'Entrada en día libre: '+(rec.dayOffReason || 'Sin motivo') : (rec.lateReason || '—')}{rec.lateReasonDetail ? ': '+rec.lateReasonDetail : ''}{rec.medicalProof?.data ? <button style={buttonStyle} onClick={()=>openProof(rec.medicalProof)}>Ver comprobante</button> : rec.lateReason==='Cita médica' ? <label className="proof-upload">Adjuntar después<input type="file" accept="image/*,.pdf" onChange={e=>uploadProof(rec.id,e.target.files?.[0])}/></label> : null}</div> : '—';})()}</td></tr>)}</tbody></table>{reportRows.length === 0 && <p className="admin-empty">No hay registros para hoy o para los filtros seleccionados.</p>}</div>
      <p className="admin-warning">La clasificación compara la hora real con el horario de cada día y aplica la tolerancia de retraso en entrada y de adelanto en salida. La versión actual almacena el historial en este navegador, no en una base de datos compartida.</p>
    </section>}
    {detailRecord && <div className="modal-backdrop" role="presentation" onClick={()=>setDetailRecord(null)}>
      <section className="admin-card admin-detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onClick={e=>e.stopPropagation()}>
        <div className="admin-report-heading"><h2 id="detail-title">Ficha de {detailRecord.type==='employee'?'empleado':'lugar'}</h2><button type="button" style={buttonStyle} onClick={()=>setDetailRecord(null)}>Cerrar</button></div>
        {detailRecord.type==='employee' ? <div className="detail-grid">{[['Nombre',detailRecord.data.name],['ID',detailRecord.data.id],['NIP',detailRecord.data.pin],['Lugar asignado',sites.find(s=>s.id===detailRecord.data.siteId)?.name || 'Sin lugar'],['Cargo',detailRecord.data.role || 'Sin cargo'],['Departamento',detailRecord.data.department || 'Sin departamento'],['Estado',detailRecord.data.status || 'Activo'],['Puede elegir lugar',detailRecord.data.allowSiteSelection?'Sí':'No'],['Permite lugar no registrado',detailRecord.data.allowUnregisteredSite?'Sí':'No']].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}<h3>Horario semanal</h3>{DAYS.map(([key,label])=><div key={key}><small>{label}</small><strong>{detailRecord.data.schedule?.[key]?.work ? (detailRecord.data.schedule[key].start || '—')+' a '+(detailRecord.data.schedule[key].end || '—') : 'Día libre'}</strong></div>)}</div>
        : <div className="detail-grid">{[['Nombre',detailRecord.data.name],['ID',detailRecord.data.id],['Estado',detailRecord.data.active===false?'Inactivo':'Activo'],['Latitud',detailRecord.data.lat],['Longitud',detailRecord.data.lng],['Radio permitido',detailRecord.data.radiusM+' m'],['Precisión GPS máxima','±'+(detailRecord.data.accuracyM ?? 100)+' m'],['Empleados asignados',employees.filter(e=>e.siteId===detailRecord.data.id).map(e=>e.name).join(', ') || 'Ninguno']].map(([label,value])=><div key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>}
      </section></div>}
  </div>;
}
