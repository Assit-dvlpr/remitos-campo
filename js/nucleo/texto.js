// Utilidades de texto sin dependencias.

// Escapa texto para meterlo en HTML
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Sin acentos (para claves y comparaciones)
export const sinAcentos = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// Para comparar encabezados y valores: sin acentos, símbolos ni puntos ("N° REMITO" = "N REMITO", "CANT." = "CANT")
export function norm(s) {
  return sinAcentos(s).replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase();
}

// "CALIDAD DE AIRE" -> "Calidad de aire"
export function capitalizar(s) {
  const t = String(s || '').toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
