import { useMemo, useState } from 'react';

const EMP_KEY = 'geocheck:employees';
const SITE_KEY = 'geocheck:sites';
const RECORD_KEY = 'geocheck:registros';
const demoEmployees = [
  { id: 'EMP-001', name: 'Carlos Medina', pin: '1234', siteId: 'SITE-001', active: true },
  { id: 'EMP-002', name: 'Ana Rodríguez', pin: '4821', siteId: 'SITE-001', active: true },
  { id: 'EMP-003', name: 'Luis Pérez', pin: '7305', siteId: 'SITE-001', active: true },
];
const demoSites = [{ id: 'SITE-001', name: 'Obra Norte', lat: 10.4806, lng: -66.9036, radiusM: 150, active: true }];

function load(key, fallback) {
  try { const value = JSON.parse(localStorage.getItem(key)); return Array.isArray(value) && value.length ? value : fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function csvCell(value) { return '"' + String(value ?? '').replace(/"/g, '""') + '"'; }

export function getAdminData() {
  return {
    employees: load(EMP_KEY, demoEmployees),
    sites: load(SITE_KEY, demoSites),
  };
}
export function getActiveEmployeeByPin(pin) {
  return load(EMP_KEY, demoEmployees).find(e => e.pin === pin && e.active !== false) || null;
}
export function getActiveSites() { return load(SITE_KEY, demoSites).filter(s => s.active !== false); }

export default function Admin({ onBack }) {
  const [section, setSection] = useState('employees');
  const [employees, setEmployees] = useState(() => load(EMP_KEY, demoEmployees));
  const [sites, setSites] = useState(() => load(SITE_KEY, demoSites));
  const [records, setRecords] = useState(() => load(RECORD_KEY, []));
  const [employeeForm, setEmployeeForm] = useState({ id: '', name: '', pin: '', siteId: '', active: true });
  const [siteForm, setSiteForm] = useState({ id: '', name: '', lat: '', lng: '', radiusM: 150, active: true });
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [siteFilter, setSiteFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [notice, setNotice] = useState('');

  const persistEmployees = value => { setEmployees(value); save(EMP_KEY, value); };
  const persistSites = value => { setSites(value); save(SITE_KEY, value); };
  const filtered = useMemo(() => records.filter(r => {
    const date = (r.timestamp || '').slice(0, 10);
    return (!from || date >= from) && (!to || date <= to) &&
      (!employeeFilter || r.employeeId === employeeFilter) &&
      (!siteFilter || (r.siteId || '') === siteFilter);
  }), [records, from, to, employeeFilter, siteFilter]);

  function saveEmployee(event) {
    event.preventDefault();
    const name = employeeForm.name.trim(), pin = employeeForm.pin.trim();
    if (!name || !/^\d{4}$/.test(pin) || !employeeForm.siteId) { setNotice('Completa el nombre, un NIP de 4 dígitos y el lugar.'); return; }
    if (employees.some(e => e.pin === pin && e.id !== employeeForm.id)) { setNotice('Ese NIP ya está asignado a otro empleado.'); return; }
    const id = employeeForm.id || 'EMP-' + Date.now().toString().slice(-7);
    const next = employeeForm.id ? employees.map(e => e.id === id ? { ...employeeForm, id, name, pin } : e) : [...employees, { ...employeeForm, id, name, pin }];
    persistEmployees(next); setEmployeeForm({ id: '', name: '', pin: '', siteId: sites[0]?.id || '', active: true }); setNotice('Empleado guardado en este navegador.');
  }
  function saveSite(event) {
    event.preventDefault();
    const lat = Number(siteForm.lat), lng = Number(siteForm.lng), radiusM = Number(siteForm.radiusM);
    if (!siteForm.name.trim() || !siteForm.lat || !siteForm.lng || !Number.isFinite(lat) || Math.abs(lat) > 90 || !Number.isFinite(lng) || Math.abs(lng) > 180 || radiusM < 1) { setNotice('Revisa el nombre, coordenadas y radio. Latitud: -90 a 90; longitud: -180 a 180.'); return; }
    const id = siteForm.id || 'SITE-' + Date.now().toString().slice(-7);
    const item = { ...siteForm, id, name: siteForm.name.trim(), lat, lng, radiusM, active: siteForm.active };
    persistSites(siteForm.id ? sites.map(s => s.id === id ? item : s) : [...sites, item]);
    setEmployeeForm(f => ({ ...f, siteId: f.siteId || id }));
    setSiteForm({ id: '', name: '', lat: '', lng: '', radiusM: 150, active: true }); setNotice('Lugar guardado en este navegador.');
  }
  function exportCsv() {
    const rows = [['Fecha y hora', 'Empleado', 'ID empleado', 'Entrada/salida', 'Lugar', 'Distancia (m)', 'Precisión GPS (m)'],
      ...filtered.map(r => [r.timestamp ? new Date(r.timestamp).toLocaleString() : '', r.name, r.employeeId, r.tipo, r.siteName, r.distance, r.accuracy])];
    const blob = new Blob(['\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'geocheck-asistencia.csv'; a.click(); URL.revokeObjectURL(url);
  }
  function refreshRecords() { setRecords(load(RECORD_KEY, [])); setNotice('Historial actualizado.'); }
  const fieldStyle = { width: '100%', padding: '10px', border: '1px solid #cbd5e1', borderRadius: '9px', marginTop: '5px' };
  const labelStyle = { display: 'block', fontSize: '13px', marginBottom: '10px', color: '#334155' };
  const buttonStyle = { border: '1px solid #cbd5e1', borderRadius: '9px', padding: '9px 12px', background: '#fff', color: '#12315a', fontWeight: 600 };
  const primary = { ...buttonStyle, background: '#12315a', color: '#fff', borderColor: '#12315a' };

  return <div className="admin-shell">
    <header className="admin-header"><div><p className="admin-eyebrow">GEOCHECK · ADMINISTRACIÓN</p><h1>Panel de control</h1><p>Gestiona empleados, lugares de trabajo y reportes.</p></div><button style={buttonStyle} onClick={onBack}>Volver al checador</button></header>
    <nav className="admin-nav">{[['employees','Empleados'],['sites','Lugares'],['reports','Historial y reportes']].map(([id,label]) => <button key={id} style={section === id ? primary : buttonStyle} onClick={() => { setSection(id); setNotice(''); }}>{label}</button>)}</nav>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {section === 'employees' && <section className="admin-grid">
      <form className="admin-card" onSubmit={saveEmployee}><h2>{employeeForm.id ? 'Editar empleado' : 'Agregar empleado'}</h2>
        <label style={labelStyle}>Nombre completo<input style={fieldStyle} value={employeeForm.name} onChange={e => setEmployeeForm({ ...employeeForm, name: e.target.value })} required /></label>
        <label style={labelStyle}>NIP (4 dígitos)<input style={fieldStyle} inputMode="numeric" maxLength={4} value={employeeForm.pin} onChange={e => setEmployeeForm({ ...employeeForm, pin: e.target.value.replace(/\D/g, '').slice(0,4) })} required /></label>
        <label style={labelStyle}>Lugar asignado<select style={fieldStyle} value={employeeForm.siteId} onChange={e => setEmployeeForm({ ...employeeForm, siteId: e.target.value })} required><option value="">Selecciona lugar</option>{sites.filter(s => s.active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label style={labelStyle}><input type="checkbox" checked={employeeForm.active} onChange={e => setEmployeeForm({ ...employeeForm, active: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} />Empleado activo</label>
        <div className="admin-actions"><button style={primary} type="submit">Guardar empleado</button><button style={buttonStyle} type="button" onClick={() => setEmployeeForm({ id:'', name:'', pin:'', siteId: sites[0]?.id || '', active:true })}>Limpiar</button></div>
      </form>
      <section className="admin-card"><h2>Directorio ({employees.length})</h2>{employees.length === 0 && <p>No hay empleados registrados.</p>}<div className="admin-list">{employees.map(e => <article className="admin-list-item" key={e.id}><div><strong>{e.name}</strong><p>{e.id} · NIP {e.pin} · {sites.find(s => s.id === e.siteId)?.name || 'Sin lugar'}</p><span className={e.active === false ? 'admin-status inactive' : 'admin-status'}>{e.active === false ? 'Inactivo' : 'Activo'}</span></div><button style={buttonStyle} onClick={() => setEmployeeForm({ ...e })}>Editar</button></article>)}</div><p className="admin-warning">Demo local: los NIP se guardan en este navegador. No uses NIP reales hasta configurar un servidor seguro.</p></section>
    </section>}
    {section === 'sites' && <section className="admin-grid">
      <form className="admin-card" onSubmit={saveSite}><h2>{siteForm.id ? 'Editar lugar' : 'Agregar lugar'}</h2>
        <label style={labelStyle}>Nombre del lugar<input style={fieldStyle} value={siteForm.name} onChange={e => setSiteForm({ ...siteForm, name: e.target.value })} required /></label>
        <label style={labelStyle}>Latitud<input style={fieldStyle} type="number" step="any" value={siteForm.lat} onChange={e => setSiteForm({ ...siteForm, lat: e.target.value })} placeholder="Ej. 10.4806" required /></label>
        <label style={labelStyle}>Longitud<input style={fieldStyle} type="number" step="any" value={siteForm.lng} onChange={e => setSiteForm({ ...siteForm, lng: e.target.value })} placeholder="Ej. -66.9036" required /></label>
        <label style={labelStyle}>Radio permitido (metros)<input style={fieldStyle} type="number" min="1" value={siteForm.radiusM} onChange={e => setSiteForm({ ...siteForm, radiusM: e.target.value })} required /></label>
        <label style={labelStyle}><input type="checkbox" checked={siteForm.active} onChange={e => setSiteForm({ ...siteForm, active: e.target.checked })} style={{ width: 'auto', marginRight: 8 }} />Lugar activo</label>
        <div className="admin-actions"><button style={primary} type="submit">Guardar lugar</button><button style={buttonStyle} type="button" onClick={() => setSiteForm({ id:'', name:'', lat:'', lng:'', radiusM:150, active:true })}>Limpiar</button></div>
        <p className="admin-warning">Coordenadas de ejemplo precargadas; reemplázalas por las de tu ubicación real.</p>
      </form>
      <section className="admin-card"><h2>Lugares registrados ({sites.length})</h2><div className="admin-list">{sites.map(s => <article className="admin-list-item" key={s.id}><div><strong>{s.name}</strong><p>{s.lat}, {s.lng} · Radio {s.radiusM} m</p><span className={s.active === false ? 'admin-status inactive' : 'admin-status'}>{s.active === false ? 'Inactivo' : 'Activo'}</span></div><button style={buttonStyle} onClick={() => setSiteForm({ ...s, lat: String(s.lat), lng: String(s.lng), radiusM: String(s.radiusM) })}>Editar</button></article>)}</div></section>
    </section>}
    {section === 'reports' && <section className="admin-card"><div className="admin-report-heading"><div><h2>Historial de asistencia</h2><p>{filtered.length} registro(s) con los filtros seleccionados.</p></div><div className="admin-actions"><button style={buttonStyle} onClick={refreshRecords}>Actualizar</button><button style={primary} onClick={exportCsv}>Exportar CSV para Excel</button></div></div>
      <div className="admin-filters"><label style={labelStyle}>Desde<input style={fieldStyle} type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label style={labelStyle}>Hasta<input style={fieldStyle} type="date" value={to} onChange={e => setTo(e.target.value)} /></label><label style={labelStyle}>Empleado<select style={fieldStyle} value={employeeFilter} onChange={e => setEmployeeFilter(e.target.value)}><option value="">Todos</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label><label style={labelStyle}>Lugar<select style={fieldStyle} value={siteFilter} onChange={e => setSiteFilter(e.target.value)}><option value="">Todos</option>{sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div>
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Fecha y hora</th><th>Empleado</th><th>Tipo</th><th>Lugar</th><th>Distancia</th></tr></thead><tbody>{filtered.map((r,i) => <tr key={r.id || i}><td>{r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}</td><td>{r.name || '—'}<small>{r.employeeId}</small></td><td>{r.tipo || '—'}</td><td>{r.siteName || '—'}</td><td>{r.distance ?? '—'} m</td></tr>)}</tbody></table>{filtered.length === 0 && <p className="admin-empty">No hay registros para estos filtros. Los registros nuevos aparecerán aquí si se hacen en este navegador.</p>}</div>
      <p className="admin-warning">Esta primera versión de reportes lee el historial local del navegador y exporta CSV compatible con Excel. No es todavía una base de datos compartida entre dispositivos.</p>
    </section>}
  </div>;
}
