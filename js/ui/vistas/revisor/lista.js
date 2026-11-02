// Revisión (oficina): lista de remitos pendientes. Con un id en la ruta abre el detalle.
import { estado } from '../../../nucleo/estado.js';
import { ESTADOS } from '../../../nucleo/constantes.js';
import { esc } from '../../../nucleo/texto.js';
import { fechaCorta } from '../../../nucleo/fechas.js';
import { $ } from '../../dom.js';
import { chipEstado } from '../../componentes/estado-remito.js';
import { vistaDetalle } from './detalle.js';

export async function vistaRevision(vista, id) {
  if (id) return vistaDetalle(vista, id);
  vista.className = 'vista ancha';
  vista.innerHTML = '<h1 class="titulo">Remitos para revisar</h1><div id="lista"><p class="vacio">Cargando…</p></div>';
  try {
    const lista = await estado.api.pendientes();
    estado.pendientes = lista;
    $('#lista', vista).innerHTML = lista.length ? `<div class="lista-remitos">${lista.map(r => `
      <a class="remito-fila boton" href="#revision/${esc(r.id)}" style="justify-content:flex-start">
        <div class="datos"><div class="nro">${esc(r.remito)} · ${esc(estado.clientes?.[r.cliente]?.nombre || r.cliente)}</div>
          <div class="sub">${esc(r.establecimiento)} · ${fechaCorta(r.fechaRemito)} · ${esc(r.tecnico)}</div>
          ${r.estado === ESTADOS.PENDIENTE_EXCEL && r.comentario ? `<div class="sub" style="color:var(--error)">${esc(r.comentario)}</div>` : ''}</div>
        ${chipEstado(r.estado)}
      </a>`).join('')}</div>` : '<p class="vacio">No hay remitos pendientes. ✔</p>';
  } catch (e) {
    $('#lista', vista).innerHTML = `<div class="mensaje error">${esc(e.message)}</div>`;
  }
}
