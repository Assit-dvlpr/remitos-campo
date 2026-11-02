// Fechas como texto 'YYYY-MM-DD' (sin hora ni zona horaria).

const dosDigitos = n => String(n).padStart(2, '0');
const isoDe = d => `${d.getFullYear()}-${dosDigitos(d.getMonth() + 1)}-${dosDigitos(d.getDate())}`;

export const hoy = () => isoDe(new Date());

// Fecha de SharePoint (con hora UTC) -> 'YYYY-MM-DD' local
export const isoLocal = v => (v ? isoDe(new Date(v)) : '');

// '2026-10-27' -> '27/10/2026'
export const fechaCorta = iso => (iso ? iso.split('-').reverse().join('/') : '—');

// 'YYYY-MM-DD' -> número de serie de Excel (fecha sin hora)
export function fechaSerial(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d || 1) / 86400000 + 25569;
}

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
