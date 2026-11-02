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
