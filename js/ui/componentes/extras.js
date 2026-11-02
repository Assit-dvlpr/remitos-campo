// Campos adicionales del cliente en pantalla: selects y valores automáticos.
import { esc } from '../../nucleo/texto.js';
import { QUIEN } from '../../nucleo/constantes.js';

// Select de un campo. sufijo = texto después de la etiqueta; opciones ya resueltas
export const htmlSelectExtra = (d, valor, opciones, sufijo = '') => `
  <label for="x-${esc(d.campo)}">${esc(d.etiqueta)}${sufijo}</label>
  <select id="x-${esc(d.campo)}" data-extra="${esc(d.campo)}">
    <option value="">Elegir…</option>
    ${opciones.map(o => `<option ${o === valor ? 'selected' : ''}>${esc(o)}</option>`).join('')}
  </select>`;

// "Centro de costo [601]" para los automáticos que tienen valor
export const htmlAutomaticos = (extras, valores) => (extras || [])
  .filter(d => d.quien === QUIEN.AUTO && valores[d.campo] !== '')
  .map(d => `${esc(d.etiqueta)} <span class="chip">${esc(valores[d.campo])}</span>`).join(' ');

// Valores elegidos en los selects de la raíz
export const leerSelectsExtra = raiz => Object.fromEntries(
  [...raiz.querySelectorAll('[data-extra]')].map(s => [s.dataset.extra, s.value]));
