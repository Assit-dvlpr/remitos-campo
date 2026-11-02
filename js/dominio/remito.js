// Reglas del remito: número, responsable, ítems y validaciones del técnico y de la oficina. Lógica pura.
import { QUIEN } from '../nucleo/constantes.js';
import { itemKm, vaAPlanilla } from './catalogo.js';

// N° de remito: punto de venta y número -> "0001-00005780". Vacío si falta alguno.
export function normalizarRemito(pv, num) {
  const p = String(pv || '').replace(/\D/g, '');
  const n = String(num || '').replace(/\D/g, '');
  if (!p || !n) return '';
  return p.padStart(4, '0') + '-' + n.padStart(8, '0');
}

// "0001-00005780" -> ['0001', '00005780']
export const partesRemito = remito => String(remito || '').split('-');

// Cómo figura el técnico en la planilla de ese cliente: apellido (Valverdi) o nombre completo (Nicolas Valverdi)
export const nombreTecnico = (cliente, usuario) => (cliente?.responsable === 'completo' ? usuario.displayName : usuario.nombre);

const apellidoDe = s => String(s || '').trim().split(/\s+/).pop();
// Si fueron dos: "Valverdi - Caro"
export const responsable = (tecnico, acompanante) =>
  (acompanante?.trim() ? `${apellidoDe(tecnico)} - ${acompanante.trim()}` : String(tecnico || '').trim());

// Cantidades por código { cod: n } -> ítems del remito [{ cod, servicio, cant }], en el orden del catálogo
export const itemsDeCantidades = (catalogo, cant) => catalogo
  .filter(it => +cant[it.cod] > 0)
  .map(it => ({ cod: it.cod, servicio: it.servicio, cant: +cant[it.cod] }));

// Ítems del remito -> cantidades por código
export const cantidadesDeItems = items => Object.fromEntries((items || []).map(i => [i.cod, i.cant]));

export const kilometros = (catalogo, cant) => {
  const km = itemKm(catalogo);
  return km ? +cant[km.cod] || 0 : 0;
};

// ¿Hay al menos un servicio que vaya a la planilla?
export const tieneServicioPlanilla = (catalogo, items) => items.some(i => i.cant > 0 && vaAPlanilla(catalogo, i.cod));

// Lo que tiene que estar completo para enviar desde el celular. Devuelve la lista de errores.
export function validarCarga(b, cliente, { hoy, remito, items }) {
  const err = [];
  if (!remito) err.push('Falta el número de remito.');
  if (!b.fechaRemito) err.push('Falta la fecha.');
  else if (b.fechaRemito > hoy) err.push('La fecha no puede ser futura.');
  if (!b.establecimiento) err.push('Elegí el establecimiento.');
  if (!String(b.tecnico || '').trim()) err.push('Falta el nombre del técnico.');
  if (!tieneServicioPlanilla(cliente.items, items)) err.push('Cargá al menos un servicio.');
  for (const d of (cliente.extras || []).filter(x => x.quien === QUIEN.TECNICO && x.obligatorio)) {
    if (!b.extras?.[d.campo]) err.push(`Elegí ${d.etiqueta.toLowerCase()}.`);
  }
  if (!b.paginas.length && !b.archivoPrevio) err.push('Falta la foto del remito firmado.');
  return err;
}

// Lo que tiene que estar completo para aprobar en la oficina. Devuelve lo que falta.
export function faltantesAprobacion(d, cliente) {
  const faltan = [];
  if (!d.remito) faltan.push('número de remito');
  if (!d.fechaRemito) faltan.push('fecha del remito');
  if (!d.fechaSolicitud) faltan.push('fecha de solicitud');
  if (!d.periodo) faltan.push('período');
  if (!d.tecnico) faltan.push('responsable');
  for (const x of (cliente.extras || []).filter(x => x.quien !== QUIEN.AUTO && x.obligatorio)) {
    if (!d.extras[x.campo]) faltan.push(x.etiqueta.toLowerCase());
  }
  if (!tieneServicioPlanilla(cliente.items, d.items)) faltan.push('al menos un servicio');
  return faltan;
}
