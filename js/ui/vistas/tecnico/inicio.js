// Primera pantalla del remito (con sistema principal): asociarlo a una orden interna existente o hacer uno nuevo.
import { estado } from '../../../nucleo/estado.js';
import { ROLES } from '../../../nucleo/constantes.js';
import { esc } from '../../../nucleo/texto.js';
import { fechaCorta } from '../../../nucleo/fechas.js';
import { ordenesAbiertas, filtrarOrdenes, nombreLinea } from '../../../dominio/sistema.js';
import { $ } from '../../dom.js';

// Revisores y administradores ven las internas de todos los sectores
const veTodas = () => [ROLES.REVISOR, ROLES.ADMIN].includes(estado.usuario.rol);

// alElegir(origen): origen = { tipo: 'orden', orden } | { tipo: 'nuevo' }
export function vistaInicio(vista, alElegir) {
  const { catalogos, sector } = estado.sistema;
  const todas = ordenesAbiertas(catalogos, { sectorId: estado.sistema.usuario.sectorId, verTodas: veTodas(), ref: estado.sistema.ref });

  vista.innerHTML = `
    <h1 class="titulo">Nuevo remito</h1>
    ${estado.sistema.sinSenal ? '<div class="mensaje alerta">Sin señal: se muestran las internas guardadas en el celular.</div>' : ''}
    <section class="tarjeta">
      <h2>¿Es de una solicitud existente?</h2>
      <p class="ayuda" style="margin-top:0">Internas abiertas ${veTodas() ? 'de todos los sectores' : `de ${esc(sector?.nombre || 'tu sector')}`}.
        Al elegir una, la empresa, la línea y los servicios vienen de la solicitud.</p>
      <label for="f-buscar">Buscar</label>
      <input id="f-buscar" type="search" placeholder="N° de interna, solicitud, empresa o lugar" autocomplete="off">
      <p class="ayuda" id="cuantas" style="margin:6px 0 0"></p>
      <div id="ordenes" class="lista-remitos lista-desplazable" style="margin-top:6px"></div>
    </section>
    <section class="tarjeta">
      <h2>¿No está en el sistema?</h2>
      <p class="ayuda" style="margin-top:0">Se carga igual que siempre. Si querés, podés indicar empresa, línea y operadora.</p>
      <button class="primario grande ancho" id="btn-nuevo">Remito nuevo (como hasta ahora)</button>
    </section>`;

  const pintar = texto => {
    const lista = filtrarOrdenes(todas, texto);
    $('#cuantas', vista).textContent = lista.length > 4 ? `${lista.length} internas, las más nuevas primero. Deslizá la lista para ver más.` : '';
    const cont = $('#ordenes', vista);
    cont.scrollTop = 0;
    cont.innerHTML = lista.length ? lista.map(o => `
      <button type="button" class="remito-fila boton" data-orden="${esc(o.id)}" style="justify-content:flex-start;text-align:left">
        <div class="datos">
          <div class="nro">${esc(o.numero || o.numeroALO || 'Interna')} · ${esc(o.empresa?.nombre || o.solicitud.empresa || '')}</div>
          <div class="sub">Solicitud ${esc(o.solicitud.numero)}${o.solicitud.numeroExterno ? ' · ' + esc(o.solicitud.numeroExterno) : ''}</div>
          <div class="sub">${esc(o.solicitud.ubicacion || '')}${o.fechaProgramada ? ' · ' + fechaCorta(o.fechaProgramada) : ''}${veTodas() && o.sector ? ' · ' + esc(o.sector.nombre) : ''}</div>
          ${o.lineas.length ? `<div class="sub">${o.lineas.map(l => esc(nombreLinea(l))).join(' / ')}</div>` : ''}
        </div>
        <span class="estado pendiente">${esc(o.estado)}</span>
      </button>`).join('') : `<p class="vacio">${texto ? 'Ninguna interna coincide.' : 'No hay internas abiertas.'}</p>`;
    // Se ven 4 y el resto se desliza dentro de la lista
    const filas = [...cont.children];
    cont.style.maxHeight = filas.length > 4 ? `${filas[4].offsetTop + 24}px` : ''; // asoma la quinta: se nota que hay más
  };
  pintar('');

  $('#f-buscar', vista).addEventListener('input', e => pintar(e.target.value));
  $('#ordenes', vista).addEventListener('click', e => {
    const b = e.target.closest('[data-orden]');
    if (b) alElegir({ tipo: 'orden', orden: todas.find(o => o.id === b.dataset.orden) });
  });
  $('#btn-nuevo', vista).addEventListener('click', () => alElegir({ tipo: 'nuevo' }));
}
