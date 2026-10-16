export function drawStamp(ctx, width, height, lines) {
  const fontSize = Math.max(14, Math.round(width / 38));
  const padding = Math.round(fontSize * 0.7);
  const lineHeight = Math.round(fontSize * 1.35);
  const barHeight = lines.length * lineHeight + padding * 2;
  ctx.fillStyle = 'rgba(11, 35, 66, 0.82)';
  ctx.fillRect(0, height - barHeight, width, barHeight);
  ctx.fillStyle = '#fff';
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => ctx.fillText(line, padding, height - barHeight + padding + index * lineHeight));
}

export function makePlaceholderPhoto(lines) {
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e2e8f0'; ctx.fillRect(0, 0, 640, 480);
  ctx.fillStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(320, 190, 70, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(320, 400, 130, 110, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#64748b'; ctx.font = '600 20px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Imagen de prueba', 320, 40); ctx.textAlign = 'left';
  drawStamp(ctx, 640, 480, lines);
  return canvas.toDataURL('image/jpeg', 0.85);
}
