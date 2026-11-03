// Lista de servicios con botones +/−. cant = { cod: número } se actualiza en el lugar.
import { $ } from '../dom.js';
import { esc, capitalizar } from '../../nucleo/texto.js';
import { esKm } from '../../dominio/catalogo.js';

export const nombreServicio = it => capitalizar(it.servicio);
// Servicios del sistema se muestran por su abreviatura (MONT, DMONT…); sin abreviatura, por el nombre
export const etiquetaServicio = it => (it.servicioId && it.codigo ? String(it.codigo).toUpperCase() : nombreServicio(it));

export function htmlServicios(items, cant) {
  return `<div class="servicios">${items.map(it => {
    const v = +cant[it.cod] || 0;
    const km = esKm(it);
    return `<div class="servicio ${v > 0 ? 'marcado' : ''}" data-cod="${esc(it.cod)}">
      <div class="nombre" title="${esc(nombreServicio(it))}">${esc(km ? nombreServicio(it) : etiquetaServicio(it))}${km ? '<small>Uno solo para todo el remito (no va a la planilla)</small>'
        : it.servicioId ? '' : `<small>Ítem ${esc(it.cod)}</small>`}</div>
      <div class="stepper">
        ${km ? '' : '<button type="button" data-paso="-1" aria-label="Restar">−</button>'}
        <input type="number" inputmode="numeric" min="0" class="${km ? 'km' : ''}" value="${v || ''}" placeholder="0" aria-label="Cantidad ${esc(it.servicio)}">
        ${km ? '' : '<button type="button" data-paso="1" aria-label="Sumar">+</button>'}
      </div></div>`;
  }).join('')}</div>`;
}

export function conectarServicios(raiz, cant, alCambiar) {
  raiz.addEventListener('click', e => {
    const b = e.target.closest('button[data-paso]');
    if (!b) return;
    const fila = b.closest('.servicio');
    const inp = $('input', fila);
    inp.value = Math.max(0, (+inp.value || 0) + +b.dataset.paso) || '';
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  });
  raiz.addEventListener('input', e => {
    const fila = e.target.closest('.servicio');
    if (!fila) return;
    const v = Math.max(0, Math.floor(+e.target.value || 0));
    cant[fila.dataset.cod] = v;
    fila.classList.toggle('marcado', v > 0);
    alCambiar?.();
  });
}

// Pestañas de líneas: una por línea, con cuántos servicios lleva cargados
export function htmlPestanasLineas(lineas, activa, cantLinea) {
  return `<div class="pestanas-lineas" role="tablist">${lineas.map(l => {
    const n = Object.values(cantLinea?.[l.id] || {}).filter(v => +v > 0).length;
    return `<button type="button" role="tab" data-linea="${esc(l.id)}" aria-selected="${l.id === activa}" class="${l.id === activa ? 'activa' : ''}">
      ${esc(l.nombre)}${n ? ` <span class="contador">${n}</span>` : ''}</button>`;
  }).join('')}</div>`;
}

// Agregar un servicio del catálogo: un botón abre la lista de abreviaturas para tocar (sin escribir)
export function htmlAgregarServicio(abierta = false) {
  return `<div class="agregar-servicio">
    <button type="button" class="btn-agregar-serv" aria-expanded="${abierta}">+ Agregar servicio</button>
    <div class="abreviaturas" ${abierta ? '' : 'hidden'}></div></div>`;
}

// posibles() -> ítems que se pueden agregar; alElegir(item) al tocar uno
export function conectarAgregarServicio(raiz, posibles, alElegir) {
  const btn = raiz?.querySelector('.btn-agregar-serv');
  const panel = raiz?.querySelector('.abreviaturas');
  if (!btn) return;
  const pintar = () => {
    const lista = posibles();
    panel.innerHTML = lista.length
      ? `<p class="ayuda" style="margin:0 0 6px">Tocá la abreviatura del servicio que querés agregar.</p>
        <div class="chips-abrev">${lista.map((it, n) => `<button type="button" data-n="${n}" title="${esc(nombreServicio(it))}">${esc(etiquetaServicio(it))}</button>`).join('')}</div>`
      : '<p class="ayuda" style="margin:0">No hay más servicios de tu sector para agregar.</p>';
    panel.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => alElegir(lista[+b.dataset.n])));
  };
  if (!panel.hidden) pintar();
  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    btn.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) pintar();
  });
}
