import { useCallback, useEffect, useRef, useState } from 'react';
import { EMPLOYEES, SHOW_DEMO_PANEL, WORK_SITE } from './lib/config.js';
import { evaluateArea, getPosition } from './lib/geo.js';
import { makePlaceholderPhoto, drawStamp } from './lib/photo.js';
import { submitAttendance } from './lib/api.js';
import { capitalize, formatDay, formatTime } from './lib/format.js';

export default function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
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
  const simulated = mode !== 'real';
  const employee = EMPLOYEES[pin];

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
      const position = await getPosition(mode, WORK_SITE);
      const evaluated = evaluateArea(position, WORK_SITE);
      setLocationInfo(evaluated);
      setLocationStatus(evaluated.inside ? 'inside' : 'outside');
      return evaluated;
    } catch (err) {
      setLocationStatus('error');
      setMessage(err.message || 'No se pudo obtener la ubicación.');
      return null;
    }
  }, [mode]);

  const capturePhoto = () => {
    const now = new Date();
    const lines = [`GeoCheck · ${WORK_SITE.name} · ${tipo}`, `${capitalize(formatDay(now))} · ${formatTime(now)}`];
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

  const register = async () => {
    if (busy) return;
    setMessage('');
    if (!employee) { setMessage('Introduce un NIP válido de 4 dígitos. Prueba 1234 en modo demo.'); return; }
    if (!simulated && cameraStatus !== 'ready') { setMessage('Activa la cámara antes de registrar.'); return; }
    setBusy(true);
    try {
      const area = await checkLocation();
      if (!area) return;
      if (!area.inside) { setMessage('Estás fuera del área permitida. No se registró la asistencia.'); return; }
      const photo = capturePhoto();
      if (!photo) { setMessage('No se pudo tomar la foto. Comprueba los permisos de cámara.'); return; }
      const now = new Date();
      const record = {
        id: globalThis.crypto?.randomUUID?.() ?? String(now.getTime()),
        tipo, employeeId: employee.id, name: employee.name, siteName: WORK_SITE.name,
        inside: true, distance: area.distance, accuracy: area.accuracy, timestamp: now.toISOString(), photo
      };
      await submitAttendance(record);
      stopCamera();
      setResult(record);
    } finally { setBusy(false); }
  };

  const closeResult = () => {
    setResult(null); setPin(''); setLocationStatus('idle'); setLocationInfo(null);
    setTipo(current => current === 'entrada' ? 'salida' : 'entrada');
    setMessage('');
    if (!simulated) startCamera();
  };

  return <div className="app-shell">
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">⌖</div>
      <h1>GeoCheck Checador</h1>
      <p>Registro de asistencia</p>
    </header>
    <main className="content">
      <div className="tabs">
        {['entrada', 'salida'].map(value => <button key={value} className={tipo === value ? 'tab active' : 'tab'} onClick={() => setTipo(value)}>{value}</button>)}
      </div>
      <section className="panel">
        <h2>1. NIP del empleado</h2>
        <input aria-label="NIP de cuatro dígitos" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setMessage(''); }} placeholder="Introduce 4 dígitos" />
        <p className={employee ? 'hint success' : 'hint'}>{employee ? `Empleado: ${employee.name}` : 'NIP de demostración: 1234, 4821 o 7305'}</p>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>2. Ubicación</h2><span className="pill">{WORK_SITE.name}</span></div>
        <p className="hint">Radio permitido: {WORK_SITE.radiusM} m</p>
        <div className={`status-box ${locationStatus}`}>
          {locationStatus === 'checking' ? 'Consultando ubicación…' :
           locationStatus === 'inside' ? `Dentro del área · ${locationInfo?.distance} m · precisión ±${locationInfo?.accuracy} m` :
           locationStatus === 'outside' ? `Fuera del área · ${locationInfo?.distance} m` :
           locationStatus === 'error' ? 'No se pudo verificar la ubicación' : 'Ubicación pendiente de verificar'}
        </div>
        <button className="secondary-button" onClick={checkLocation} disabled={locationStatus === 'checking'}>Verificar ubicación</button>
      </section>
      <section className="panel">
        <div className="panel-heading"><h2>3. Evidencia fotográfica</h2><span className={cameraStatus === 'ready' ? 'pill green' : 'pill'}>{simulated ? 'Modo de prueba' : cameraStatus === 'ready' ? 'Cámara activa' : cameraStatus === 'starting' ? 'Abriendo cámara…' : 'Cámara inactiva'}</span></div>
        <div className="camera-frame">
          <video ref={videoRef} autoPlay muted playsInline className={cameraStatus === 'ready' ? 'camera-video' : 'camera-video hidden'} />
          {cameraStatus !== 'ready' && <div className="camera-placeholder"><span>◎</span><p>{simulated ? 'Se usará una imagen de prueba' : cameraError || 'La vista previa aparecerá aquí'}</p></div>}
        </div>
        {cameraStatus !== 'ready' && <button className="secondary-button" onClick={startCamera}>Activar cámara</button>}
      </section>
      {SHOW_DEMO_PANEL && <details className="panel demo-panel">
        <summary>Modo de pruebas</summary>
        <p className="hint">Permite probar el flujo sin estar físicamente en el centro. No uses las simulaciones para asistencia real.</p>
        <div className="mode-buttons">
          {[['real','GPS real'],['inside','Simular dentro'],['outside','Simular fuera']].map(([id,label]) => <button key={id} className={mode === id ? 'mode-button selected' : 'mode-button'} onClick={() => setMode(id)}>{label}</button>)}
        </div>
      </details>}
      {message && <p className="message" role="alert">{message}</p>}
      <button className="primary-button" onClick={register} disabled={busy || pin.length !== 4 || (!simulated && cameraStatus !== 'ready')}>
        {busy ? 'Registrando…' : `Registrar ${tipo}`}
      </button>
      <p className="footnote">La versión de demostración guarda los metadatos localmente en este navegador.</p>
    </main>
    {result && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="result-card">
        <div className="result-icon">✓</div><h2 id="result-title">¡Registro completado!</h2>
        <p><strong>{result.name}</strong></p><p>{result.tipo === 'entrada' ? 'Entrada' : 'Salida'} · {new Date(result.timestamp).toLocaleString('es-VE')}</p>
        <p className="hint">{result.siteName} · {result.distance} m del centro</p>
        <button className="primary-button" onClick={closeResult}>Continuar</button>
      </div>
    </div>}
  </div>;
}
