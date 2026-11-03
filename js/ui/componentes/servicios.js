// Lista de servicios con botones +/−. cant = { cod: número } se actualiza en el lugar.
import { $ } from '../dom.js';
import { esc, capitalizar } from '../../nucleo/texto.js';
import { esKm } from '../../dominio/catalogo.js';

export const nombreServicio = it => capitalizar(it.servicio);

export function htmlServicios(items, cant) {
  return `<div class="servicios">${items.map(it => {
    const v = +cant[it.cod] || 0;
    const km = esKm(it);
    return `<div class="servicio ${v > 0 ? 'marcado' : ''}" data-cod="${esc(it.cod)}">
      <div class="nombre">${esc(nombreServicio(it))}<small>${km ? 'Kilómetros recorridos (no va a la planilla)' : it.servicioId ? (it.codigo ? 'Código ' + esc(it.codigo) : '') : 'Ítem ' + esc(it.cod)}</small></div>
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
