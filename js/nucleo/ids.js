// Identificadores.
import { sinAcentos } from './texto.js';

// Identificador único (remitos en el celular)
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// "Pan American Energy" -> "pan-american-energy" (clave de cliente y de campo adicional)
export const claveDe = nombre => sinAcentos(nombre).toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cliente';

// Clave que no pise una existente: "oldelval", "oldelval-2", …
export function claveLibre(nombre, existentes) {
  const base = claveDe(nombre);
  let k = base;
  for (let i = 2; existentes[k]; i++) k = base + '-' + i;
  return k;
}

// GUID de Dataverse en minúsculas y sin llaves: es la forma con la que se comparan los IDs en toda la app
export const idDv = v => String(v || '').trim().replace(/[{}]/g, '').toLowerCase();
export const mismoId = (a, b) => Boolean(idDv(a)) && idDv(a) === idDv(b);

// GUID que siempre sale igual para el mismo texto (SHA-1, formato UUID v5). Sirve para que reintentar
// una escritura en Dataverse actualice el mismo registro en vez de crear uno nuevo.
export async function guidEstable(texto) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(String(texto))));
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = [...h.slice(0, 16)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}
