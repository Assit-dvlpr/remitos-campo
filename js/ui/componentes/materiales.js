// Sección de materiales (Seguridad eléctrica): por cada tipo, elegir un material del catálogo y su cantidad.
// materiales = { tipo: { materialId: cantidad } } se modifica en el lugar.
import { esc } from '../../nucleo/texto.js';
import { TIPOS_MATERIAL } from '../../dominio/materiales.js';

const nombreMat = m => `${m.nombre}${m.codigo ? ` (${m.codigo})` : ''} · ${m.unidad || 'UN'}${m.saldo !== undefined ? ` · disponible ${m.saldo}` : ''}`;

// opciones = { stock: [...], recuperado: [...], reutilizado: [...] } materiales disponibles por tipo
// prefijo: distingue los bloques cuando hay uno por servicio en la misma pantalla
export function htmlMateriales(materiales, opciones, prefijo = 'm') {
  return Object.entries(TIPOS_MATERIAL).map(([tipo, def]) => {
    const lista = opciones[tipo] || [];
    const elegidos = Object.keys(materiales[tipo] || {});
    return `<div class="grupo-material" data-tipo="${tipo}">
      <label for="${prefijo}-${tipo}">${esc(def.etiqueta)}</label>
      ${lista.length ? `<div class="fila">
        <select id="${prefijo}-${tipo}" data-elegir><option value="">Elegir material…</option>
          ${lista.filter(m => !elegidos.includes(m.id)).map(m => `<option value="${esc(m.id)}">${esc(nombreMat(m))}</option>`).join('')}
        </select>
        <button type="button" data-agregar="${tipo}">Agregar</button></div>`
        : '<p class="ayuda" style="margin:0">No hay materiales en el catálogo para esta empresa y línea.</p>'}
      ${elegidos.map(id => {
        const m = lista.find(x => x.id === id) || { nombre: 'Material ya no disponible', unidad: '' };
        return `<div class="servicio marcado" data-material="${esc(id)}">
          <div class="nombre">${esc(m.nombre)}<small>${esc(m.unidad || '')}${m.saldo !== undefined ? ` · disponible ${esc(m.saldo)}` : ''}</small></div>
          <div class="stepper"><input type="number" inputmode="decimal" min="0" step="any" value="${esc(materiales[tipo][id])}" aria-label="Cantidad ${esc(m.nombre)}">
          <button type="button" data-quitar aria-label="Quitar">✕</button></div></div>`;
      }).join('')}
    </div>`;
  }).join('');
}

// alCambiar(redibujar): redibujar = true cuando cambia la lista de materiales elegidos
export function conectarMateriales(raiz, materiales, alCambiar) {
  raiz.addEventListener('click', e => {
    const tipo = e.target.closest('[data-tipo]')?.dataset.tipo;
    if (!tipo) return;
    if (e.target.matches('[data-agregar]')) {
      const id = e.target.closest('[data-tipo]').querySelector('[data-elegir]').value;
      if (!id) return;
      materiales[tipo][id] = '';
      alCambiar(true);
    } else if (e.target.matches('[data-quitar]')) {
      delete materiales[tipo][e.target.closest('[data-material]').dataset.material];
      alCambiar(true);
    }
  });
  raiz.addEventListener('input', e => {
    const fila = e.target.closest('[data-material]');
    if (!fila) return;
    const tipo = fila.closest('[data-tipo]').dataset.tipo;
    materiales[tipo][fila.dataset.material] = e.target.value === '' ? '' : +e.target.value;
    alCambiar(false);
  });
}

// Resumen de solo lectura: filas [{ tipo, nombre, unidad, cant, servicioId, lineaId }] agrupadas por línea y servicio, y por tipo.
// nombreDeLinea(id): para titular cada grupo cuando el remito tiene varias líneas.
export function htmlResumenMateriales(filas, items = [], nombreDeLinea = null) {
  if (!filas?.length) return '<p class="ayuda" style="margin:0">Sin materiales cargados.</p>';
  const clave = f => `${f.lineaId || ''}|${f.servicioId || ''}`;
  const grupos = [...new Set(filas.map(clave))];
  if (grupos.length > 1 || grupos[0] !== '|') {
    return grupos.map(g => {
      const [lineaId, sid] = g.split('|');
      const it = items.find(i => i.servicioId === sid);
      const serv = it ? (it.codigo ? String(it.codigo).toUpperCase() : it.servicio) : 'Sin servicio';
      const titulo = `${lineaId && nombreDeLinea ? nombreDeLinea(lineaId) + ' · ' : ''}${serv}`;
      return `<h3 style="margin:6px 0 2px">${esc(titulo)}</h3>
      ${htmlResumenMateriales(filas.filter(f => clave(f) === g).map(({ servicioId, lineaId: _l, ...f }) => f))}`;
    }).join('');
  }
  return Object.entries(TIPOS_MATERIAL).map(([tipo, def]) => {
    const deTipo = filas.filter(f => f.tipo === tipo);
    return deTipo.length ? `<label>${esc(def.etiqueta)}</label>
      <ul style="margin:0 0 6px;padding-left:18px">${deTipo.map(f => `<li>${esc(f.nombre || 'Material')}: <b>${esc(f.cant)}</b> ${esc(f.unidad || '')}</li>`).join('')}</ul>` : '';
  }).join('');
}
