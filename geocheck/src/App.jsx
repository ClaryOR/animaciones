import { useCallback, useEffect, useRef, useState } from 'react';
import { SHOW_DEMO_PANEL, WORK_SITE } from './lib/config.js';
import Admin, { getActiveEmployeeByPin, getActiveSites, getLateReasons } from './Admin.jsx';
import { evaluateArea, getPosition } from './lib/geo.js';
import { makePlaceholderPhoto, drawStamp } from './lib/photo.js';
import { submitAttendance } from './lib/api.js';
import { capitalize, formatDay, formatTime } from './lib/format.js';

export default function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [adminMode, setAdminMode] = useState(false);
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState('real');
  const [tipo, setTipo] = useState('entrada');
  const [cameraStatus, setCameraStatus] = useState('idle');
  const [cameraError, setCameraError] = useState('');
  const [locationStatus, setLocationStatus] = useState('idle');
  const [locationInfo, setLocationInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [result, setResult] = useState(null);
  const [lateReason, setLateReason] = useState('');
  const [lateOther, setLateOther] = useState('');
  const [medicalProof, setMedicalProof] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState('');
  const simulated = mode !== 'real';
  const employee = getActiveEmployeeByPin(pin);
  const activeSites = getActiveSites();
  const lateReasons = getLateReasons();
  const todaySchedule = employee?.schedule?.[['sun','mon','tue','wed','thu','fri','sat'][new Date().getDay()]];
  const lateMinutes = todaySchedule?.work ? Math.floor((Date.now() - new Date(new Date().toDateString() + ' ' + todaySchedule.start).getTime()) / 60000) : 0;
  const isLate = tipo === 'entrada' && Boolean(todaySchedule?.work) && lateMinutes > Number(employee?.tolerances?.late ?? 5);
  const workSite = activeSites.find(site => site.id === employee?.siteId) || activeSites[0] || WORK_SITE;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraStatus('idle');
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('error');
      setCameraError('La cámara requiere HTTPS o localhost.');
      return;
    }
    setCameraStatus('starting');
    setCameraError('');
    try {
      streamRef.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraStatus('ready');
    } catch (err) {
      setCameraStatus('error');
      setCameraError(err?.name === 'NotAllowedError' ? 'Permiso de cámara denegado. Actívalo en el navegador.' : 'No se pudo abrir la cámara.');
    }
  }, []);

  useEffect(() => { startCamera(); return () => streamRef.current?.getTracks().forEach(track => track.stop()); }, [startCamera]);
  useEffect(() => { setLocationStatus('idle'); setLocationInfo(null); }, [mode]);

  const checkLocation = useCallback(async () => {
    setLocationStatus('checking');
    setMessage('');
    try {
      const position = await getPosition(mode, workSite);
      const evaluated = evaluateArea(position, { ...workSite, accuracyM: workSite.accuracyM ?? 100 });
      setLocationInfo(evaluated);
      setLocationStatus(evaluated.inside ? 'inside' : 'outside');
      return evaluated;
    } catch (err) {
      setLocationStatus('error');
      setMessage(err.message || 'No se pudo obtener la ubicación.');
      return null;
    }
  }, [mode, workSite]);

  const capturePhoto = () => {
    const now = new Date();
    const lines = [`GeoCheck · ${workSite.name} · ${tipo}`, `${capitalize(formatDay(now))} · ${formatTime(now)}`];
    if (cameraStatus === 'ready' && videoRef.current?.videoWidth) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      drawStamp(ctx, canvas.width, canvas.height, lines);
      return canvas.toDataURL('image/jpeg', 0.85);
    }
    return simulated ? makePlaceholderPhoto(lines) : null;
  };

  const takePhoto = () => {
    const photo = capturePhoto();
    if (!photo) { setMessage('No se pudo tomar la foto. Activa la cámara y concede el permiso en el navegador.'); return; }
    setCapturedPhoto(photo);
    setMessage('Evidencia fotográfica capturada.');
  };

  const register = async () => {
    if (busy) return;
    setMessage('');
    if (!employee) { setMessage('Introduce un NIP válido de 4 dígitos. Verifica el NIP del empleado en administración.'); return; }
    if (tipo === 'entrada' && !todaySchedule?.work) { setMessage('Hoy figura como día libre en el horario del empleado. Contacta con administración si esto es incorrecto.'); return; }
    if (isLate && !lateReason) { setMessage('Selecciona un motivo de retraso antes de registrar la entrada.'); return; }
    if (isLate && lateReason === 'Otro' && !lateOther.trim()) { setMessage('Explica el motivo en el campo Otro.'); return; }
    if (locationStatus !== 'inside' || !locationInfo?.inside) { setMessage('Primero verifica que la ubicación esté dentro del área permitida.'); return; }
    if (!capturedPhoto) { setMessage('Toma la fotografía de evidencia antes de registrar.'); return; }
    if (!simulated && cameraStatus !== 'ready') { setMessage('Activa la cámara antes de registrar.'); return; }
    setBusy(true);
    try {
      const area = locationInfo;
      if (!area || !area.inside || locationStatus !== 'inside') { setMessage('Verifica la ubicación antes de registrar.'); return; }
      const photo = capturedPhoto;
      const now = new Date();
      const record = {
        id: globalThis.crypto?.randomUUID?.() ?? String(now.getTime()),
        tipo, employeeId: employee.id, name: employee.name, siteName: workSite.name, siteId: workSite.id,
        inside: true, distance: area.distance, accuracy: area.accuracy, device: navigator.userAgent || 'Dispositivo no identificado', timestamp: now.toISOString(), photo,
        late: isLate, lateReason: isLate ? lateReason : '', lateReasonDetail: isLate && lateReason === 'Otro' ? lateOther.trim() : '', medicalProof: medicalProof || null
      };
      await submitAttendance(record);
      stopCamera();
      setResult(record);
    } finally { setBusy(false); }
  };

  const closeResult = () => {
    setResult(null); setPin(''); setLocationStatus('idle'); setLocationInfo(null); setLateReason(''); setLateOther(''); setMedicalProof(null); setCapturedPhoto('');
    setTipo(current => current === 'entrada' ? 'salida' : 'entrada');
    setMessage('');
    if (!simulated) startCamera();
  };

  if (adminMode) return <div className="app-shell"><Admin onBack={() => setAdminMode(false)} /></div>;

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">⌖</div>
      <h1>GeoCheck Checador</h1>
      <p>Registro de asistencia</p><button className="admin-open-button" onClick={() => setAdminMode(true)}>Administración</button>
    </header>
    <main className="content">
      <p className="required-legend"><span className="required-star">*</span> Información obligatoria</p>
      <div className="tabs">
        {['entrada', 'salida'].map(value => <button key={value} className={tipo === value ? 'tab active' : 'tab'} onClick={() => { setTipo(value); setCapturedPhoto(''); setLocationStatus('idle'); setLocationInfo(null); setMessage(''); }}>{value}</button>)}
      </div>
      <section className="panel">
        <h2>1. NIP del empleado <span className="required-star" aria-label="obligatorio">*</span></h2>
        <input aria-label="NIP de cuatro dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setMessage(''); setCapturedPhoto(''); }} placeholder="Introduce 4 dígitos" />
        <p className={employee ? 'hint success' : 'hint'}>{employee ? `Empleado: ${employee.name}` : 'Introduce tu NIP de empleado activo'}</p>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>2. Ubicación <span className="required-star" aria-label="obligatorio">*</span></h2><span className="pill">{workSite.name}</span></div>
        <p className="hint">Radio permitido: {workSite.radiusM} m · Accuracy máximo: {workSite.accuracyM ?? 100} m</p>
        <div className={`status-box ${locationStatus}`}>
          {locationStatus === 'checking' ? 'Consultando ubicación…' :
           locationStatus === 'inside' ? `Dentro del área · ${locationInfo?.distance} m · precisión ±${locationInfo?.accuracy} m` :
           locationStatus === 'outside' ? `Fuera del área · ${locationInfo?.distance} m` :
           locationStatus === 'error' ? 'No se pudo verificar la ubicación' : 'Ubicación pendiente de verificar'}
        </div>
        <button className="secondary-button" onClick={checkLocation} disabled={locationStatus === 'checking'}>Verificar ubicación</button>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>3. Evidencia fotográfica <span className="required-star" aria-label="obligatorio">*</span></h2><span className={cameraStatus === 'ready' ? 'pill green' : 'pill'}>{simulated ? 'Modo de prueba' : cameraStatus === 'ready' ? 'Cámara activa' : cameraStatus === 'starting' ? 'Abriendo cámara…' : 'Cámara inactiva'}</span></div>
        <div className="camera-frame">
          <video ref={videoRef} autoPlay muted playsInline className={cameraStatus === 'ready' ? 'camera-video' : 'camera-video hidden'} />
          {cameraStatus !== 'ready' && <div className="camera-placeholder"><span>◎</span><p>{simulated ? 'Se usará una imagen de prueba' : cameraError || 'La vista previa aparecerá aquí'}</p></div>}
        </div>
        {cameraStatus !== 'ready' && <button className="secondary-button" onClick={startCamera}>Activar cámara</button>}
        {cameraStatus === 'ready' && <button className="secondary-button" onClick={takePhoto}>Tomar foto de evidencia</button>}
        {capturedPhoto && <div className="captured-evidence"><img src={capturedPhoto} alt="Fotografía de evidencia capturada" /><p>✓ Fotografía capturada</p><button type="button" className="secondary-button" onClick={takePhoto}>Tomar otra foto</button></div>}
      </section>
      {isLate && <section className="panel late-reason-panel"><h2>4. Motivo de retraso <span className="required-star" aria-label="obligatorio">*</span></h2><p className="hint">El horario indica que tu entrada está fuera de la tolerancia permitida. Selecciona un motivo para continuar.</p><label>Motivo<select value={lateReason} onChange={e => setLateReason(e.target.value)} required><option value="">Selecciona un motivo</option>{lateReasons.filter(r => r.active !== false).map(r => <option key={r.id || r.label} value={r.label}>{r.label}</option>)}</select></label>{lateReason === 'Otro' && <label>Justificación obligatoria<textarea value={lateOther} onChange={e => setLateOther(e.target.value)} required maxLength={500} placeholder="Explica el motivo del retraso" /></label>}{lateReason === 'Cita médica' && <label>Comprobante médico (opcional, puedes adjuntarlo después)<input type="file" accept="image/*,.pdf" onChange={e => {const file=e.target.files?.[0]; if(!file)return; if(file.size>5*1024*1024){setMessage('El archivo debe pesar 5 MB o menos.');return;} const reader=new FileReader();reader.onload=()=>setMedicalProof({name:file.name,type:file.type,data:reader.result});reader.readAsDataURL(file);}}/><small>Foto o PDF de hasta 5 MB. No es obligatorio adjuntarlo ahora.</small></label>}</section>}
      {SHOW_DEMO_PANEL && <details className="panel demo-panel">
        <summary>Modo de pruebas</summary>
        <p className="hint">Permite probar el flujo sin estar físicamente en el centro. No uses las simulaciones para asistencia real.</p>
        <div className="mode-buttons">
          {[['real','GPS real'],['inside','Simular dentro'],['outside','Simular fuera']].map(([id,label]) => <button key={id} className={mode === id ? 'mode-button selected' : 'mode-button'} onClick={() => setMode(id)}>{label}</button>)}
        </div>
      </details>}
      {message && <p className="message" role="alert">{message}</p>}
      <div className="required-checklist" aria-live="polite"><strong>Requisitos para registrar</strong><span className={tipo !== "entrada" || todaySchedule?.work ? "check-ok" : "check-pending"}>{tipo !== "entrada" || todaySchedule?.work ? "✓" : "×"} Horario laboral de hoy</span><span className={employee ? 'check-ok' : 'check-pending'}>{employee ? '✓' : '×'} Empleado válido</span><span className={locationStatus === 'inside' && locationInfo?.inside ? 'check-ok' : 'check-pending'}>{locationStatus === 'inside' && locationInfo?.inside ? '✓' : '×'} Ubicación dentro del área</span><span className={capturedPhoto ? 'check-ok' : 'check-pending'}>{capturedPhoto ? '✓' : '×'} Foto capturada</span>{isLate && <span className={lateReason && (lateReason !== 'Otro' || lateOther.trim()) ? 'check-ok' : 'check-pending'}>{lateReason && (lateReason !== 'Otro' || lateOther.trim()) ? '✓' : '×'} Motivo del retraso</span>}<p className="checklist-help">Completa los requisitos marcados con ×. Si el horario de hoy aparece pendiente, revisa los días y horas asignados al empleado en Administración.</p></div>
      <button className="primary-button" onClick={register} disabled={busy || !employee || pin.length !== 4 || locationStatus !== 'inside' || !locationInfo?.inside || !capturedPhoto || (!simulated && cameraStatus !== 'ready') || (isLate && (!lateReason || (lateReason === 'Otro' && !lateOther.trim())))}>
        {busy ? 'Registrando…' : `Registrar ${tipo}`}
      </button>
      <p className="footnote">La versión de demostración guarda los metadatos localmente en este navegador.</p>
    </main>
    {result && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="result-card">
        <div className="result-icon">✓</div><h2 id="result-title">¡Registro completado!</h2>
        <p><strong>{result.name}</strong></p><p>{result.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {new Date(result.timestamp).toLocaleString('es-VE')}</p>
        <p className="hint">{result.siteName} · {result.distance} m del centro</p>{result.late && <p className="hint">Retraso: {result.lateReason}{result.lateReasonDetail ? ' — ' + result.lateReasonDetail : ''}</p>}
        <button className="primary-button" onClick={closeResult}>Continuar</button>
      </div>
    </div>}
  </div>;
}
