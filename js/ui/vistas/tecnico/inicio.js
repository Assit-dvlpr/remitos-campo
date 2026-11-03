// Primeras pantallas del remito (con sistema principal):
// 1) elegir si es de una orden interna existente o un remito nuevo; 2) elegir la interna.
import { estado } from '../../../nucleo/estado.js';
import { ROLES } from '../../../nucleo/constantes.js';
import { esc } from '../../../nucleo/texto.js';
import { ordenesAbiertas, filtrarOrdenes, identidadInterna } from '../../../dominio/sistema.js';
import { $ } from '../../dom.js';

// Revisores y administradores ven las internas de todos los sectores
const veTodas = () => [ROLES.REVISOR, ROLES.ADMIN].includes(estado.usuario.rol);
const internas = () => ordenesAbiertas(estado.sistema.catalogos, { sectorId: estado.sistema.usuario.sectorId, verTodas: veTodas(), ref: estado.sistema.ref });

// Abreviaturas de los servicios de la interna (MONT, DMONT…), sin repetir
const abreviaturas = o => [...new Set((o.servicios || []).map(s => s.servicio).filter(Boolean)
  .map(s => String(s.codigoInterno || s.codigo || s.nombre).trim().toUpperCase()))].join(' · ');

// Paso 1: de una interna o nuevo
export function vistaElegirOrigen(vista, { alInterna, alNuevo }) {
  const n = internas().length;
  vista.innerHTML = `
    <h1 class="titulo">Nuevo remito</h1>
    ${estado.sistema.sinSenal ? '<div class="mensaje alerta">Sin señal: se usan las internas guardadas en el celular.</div>' : ''}
    <div class="opciones-origen">
      <button type="button" class="opcion-origen primario" id="btn-interna">
        <b>De una orden interna</b>
        <span>${n ? `${n} abierta${n === 1 ? '' : 's'} ${veTodas() ? 'en todos los sectores' : `de ${esc(estado.sistema.sector?.nombre || 'tu sector')}`}` : 'No hay internas abiertas'}.
          La empresa, las líneas y los servicios vienen de la interna.</span>
      </button>
      <button type="button" class="opcion-origen" id="btn-nuevo">
        <b>Remito nuevo</b>
        <span>No está en el sistema: se carga como hasta ahora.</span>
      </button>
    </div>`;
  $('#btn-interna', vista).addEventListener('click', alInterna);
  $('#btn-nuevo', vista).addEventListener('click', alNuevo);
}

// Paso 2: elegir la interna (las más nuevas arriba; se ven 4 y el resto se desliza)
export function vistaInternas(vista, { alElegir, alVolver }) {
  const todas = internas();
  vista.innerHTML = `
    <button type="button" class="volver" id="btn-volver">← Volver</button>
    <h1 class="titulo">Elegí la interna</h1>
    <input id="f-buscar" type="search" placeholder="Buscar empresa, N°, referencia, locación" autocomplete="off" aria-label="Buscar interna">
    <p class="ayuda" id="cuantas" style="margin:6px 0 0"></p>
    <div id="ordenes" class="lista-remitos lista-desplazable lista-compacta" style="margin-top:6px"></div>`;

  const pintar = texto => {
    const lista = filtrarOrdenes(todas, texto);
    $('#cuantas', vista).textContent = lista.length > 1 ? `${lista.length} internas, las más nuevas primero.` : '';
    const cont = $('#ordenes', vista);
    cont.scrollTop = 0;
    // Empresa, N° ALO de la interna con su referencia externa (como en ALO Manager), y locación
    cont.innerHTML = lista.length ? lista.map(o => `<button type="button" class="remito-fila fila-interna" data-orden="${esc(o.id)}">
        <div class="datos">
          <div class="nro">${esc(o.empresa?.nombre || o.solicitud.empresa || 'Sin empresa')}</div>
          <div class="sub refs"><b>${esc(identidadInterna(o, o.sector) || 'Sin número')}</b></div>
          <div class="sub">${esc(o.locacion || o.solicitud.locacion || 'Sin locación')}${abreviaturas(o) ? ` · <b class="abrevs">${esc(abreviaturas(o))}</b>` : ''}</div>
        </div>
      </button>`).join('') : `<p class="vacio">${texto ? 'Ninguna interna coincide.' : 'No hay internas abiertas.'}</p>`;
    ajustarAlto();
  };
  // La lista ocupa hasta el final de la pantalla y se desliza adentro (la página no se mueve)
  const ajustarAlto = () => {
    const cont = $('#ordenes', vista);
    if (!cont?.isConnected) { removeEventListener('resize', ajustarAlto); return; }
    cont.style.maxHeight = `${Math.max(220, innerHeight - cont.getBoundingClientRect().top - 12)}px`;
  };
  addEventListener('resize', ajustarAlto);
  pintar('');

  $('#btn-volver', vista).addEventListener('click', alVolver);
  $('#f-buscar', vista).addEventListener('input', e => pintar(e.target.value));
  $('#ordenes', vista).addEventListener('click', e => {
    const b = e.target.closest('[data-orden]');
    if (b) alElegir(todas.find(o => o.id === b.dataset.orden));
  });
}
