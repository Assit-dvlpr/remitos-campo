// Del texto leído en la foto, el N° de remito "0001 - 00004758" -> { pv: '0001', numero: '00004758' }.
// Lógica pura. En el talonario también aparece el rango de impresión ("0001-00004451 al 0001-00004950"):
// esas líneas se descartan, y si quedan varias se toma la de más arriba (el número va en el encabezado).
const PATRON = /(\d{4})\s*[-–—_.~]\s*(\d{8})/;

export function numeroRemitoDeLineas(lineas) {
  const candidatas = (lineas || [])
    .map(l => ({ ...l, texto: String(l.texto || '') }))
    .filter(l => PATRON.test(l.texto))
    // Rango de impresión del pie: dos números en la misma línea o la palabra "al"
    .filter(l => (l.texto.match(new RegExp(PATRON.source, 'g')) || []).length === 1 && !/\bal\b/i.test(l.texto))
    .sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
  if (!candidatas.length) return null;
  const [, pv, numero] = candidatas[0].texto.match(PATRON);
  return { pv, numero };
}
