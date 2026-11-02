// Pantalla del técnico: remitos guardados en el celular sin enviar y estado de los enviados.
import { estado } from '../../../nucleo/estado.js';
import { ESTADOS } from '../../../nucleo/constantes.js';
import { esc } from '../../../nucleo/texto.js';
import { fechaCorta } from '../../../nucleo/fechas.js';
import { uid } from '../../../nucleo/ids.js';
import { cola, procesarCola } from '../../../datos/cola.js';
import { partesRemito, cantidadesDeItems } from '../../../dominio/remito.js';
import { $ } from '../../dom.js';
import { ir, refrescarPestanas } from '../../navegacion.js';
import { nombreServicio } from '../../componentes/servicios.js';
import { chipEstado } from '../../componentes/estado-remito.js';

function resumenItems(r) {
  return (r.items || []).map(i => `${i.cant} ${nombreServicio(i).split(' ').slice(0, 3).join(' ')}`).join(' · ');
}

export async function vistaMisRemitos(vista) {
  const enCola = await cola.todos().catch(() => []);
  vista.innerHTML = `<h1 class="titulo">Mis remitos</h1>
    <div id="cola"></div>
    <h2 style="font-size:16px;margin:20px 0 8px">Enviados</h2>
    <div id="enviados"><p class="vacio">Cargando…</p></div>`;

  $('#cola', vista).innerHTML = enCola.length ? `
    <div class="mensaje ${enCola.some(e => e.estado === 'duplicado') ? 'error' : 'alerta'}">
      ${enCola.length} remito(s) en el celular sin enviar. ${navigator.onLine ? '' : 'Sin señal: se envían solos al volver la conexión.'}
    </div>
    <div class="lista-remitos">${enCola.map(e => `
      <div class="remito-fila">
        <div class="datos"><div class="nro">${esc(e.datos.remito)}</div>
          <div class="sub">${esc(e.datos.establecimiento)} · ${fechaCorta(e.datos.fechaRemito)}</div>
          ${e.error ? `<div class="sub" style="color:var(--error)">${esc(e.error)}</div>` : ''}</div>
        ${e.estado === 'duplicado'
          ? `<button data-borrar="${esc(e.idLocal)}" class="peligro">Quitar</button>`
          : '<span class="estado cola">Sin enviar</span>'}
      </div>`).join('')}</div>
    <div class="acciones"><button id="btn-reintentar">Enviar ahora</button></div>` : '';

  $('#btn-reintentar', vista)?.addEventListener('click', async () => {
    await procesarCola(estado.api, refrescarPestanas);
    vistaMisRemitos(vista);
  });
  vista.querySelectorAll('[data-borrar]').forEach(btn => btn.addEventListener('click', async () => {
    if (!confirm('¿Quitar este remito del celular? No se envía.')) return;
    await cola.quitar(btn.dataset.borrar);
    refrescarPestanas();
    vistaMisRemitos(vista);
  }));

  const cont = $('#enviados', vista);
  if (!navigator.onLine) { cont.innerHTML = '<p class="vacio">Sin señal: no se puede consultar el estado.</p>'; return; }
  try {
    const lista = await estado.api.misRemitos(estado.usuario.email);
    if (!lista.length) { cont.innerHTML = '<p class="vacio">Todavía no enviaste remitos.</p>'; return; }
    cont.innerHTML = `<div class="lista-remitos">${lista.slice(0, 60).map(r => `
      <div class="remito-fila">
        <div class="datos"><div class="nro">${esc(r.remito)}</div>
          <div class="sub">${esc(r.establecimiento)} · ${fechaCorta(r.fechaRemito)}</div>
          <div class="sub">${esc(resumenItems(r))}</div>
          ${r.estado === ESTADOS.RECHAZADO && r.comentario ? `<div class="sub" style="color:var(--error)">${esc(r.comentario)}</div>` : ''}</div>
        ${r.estado === ESTADOS.RECHAZADO
          ? `<button data-corregir="${esc(r.id)}" class="primario">Corregir</button>`
          : chipEstado(r.estado, { tecnico: true })}
      </div>`).join('')}</div>`;
    cont.querySelectorAll('[data-corregir]').forEach(btn => btn.addEventListener('click', () => {
      const r = lista.find(x => x.id === btn.dataset.corregir);
      const [pv, numero] = partesRemito(r.remito);
      estado.corregir = {
        idLocal: r.idLocal || uid(), itemId: r.id, cliente: r.cliente, pv, numero,
        fechaRemito: r.fechaRemito, establecimiento: r.establecimiento, tecnico: r.tecnico,
        cant: cantidadesDeItems(r.items),
        extras: { ...(r.extras || {}) }, acompanante: '', tecnicoEditado: true,
        observaciones: r.observaciones, paginas: [], archivoPrevio: !!r.archivoId, comentario: r.comentario,
      };
      ir('nuevo');
    }));
  } catch (e) {
    cont.innerHTML = `<div class="mensaje error">${esc(e.message)}</div>`;
  }
}
