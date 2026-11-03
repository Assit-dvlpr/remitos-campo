// Pantalla del técnico: remitos guardados en el celular sin enviar y estado de los enviados.
import { estado } from '../../../nucleo/estado.js';
import { ESTADOS } from '../../../nucleo/constantes.js';
import { esc } from '../../../nucleo/texto.js';
import { fechaCorta } from '../../../nucleo/fechas.js';
import { uid } from '../../../nucleo/ids.js';
import { cola, procesarCola } from '../../../datos/cola.js';
import { partesRemito, cantidadesDeItems, cantidadesPorLinea } from '../../../dominio/remito.js';
import { materialesPorClaveDeFilas } from '../../../dominio/materiales.js';
import { esKm } from '../../../dominio/catalogo.js';
import { $ } from '../../dom.js';
import { ir, refrescarPestanas } from '../../navegacion.js';
import { etiquetaServicio } from '../../componentes/servicios.js';
import { chipEstado } from '../../componentes/estado-remito.js';

// "2 MONT · 1 DMONT · 35 km": por abreviatura, sumando el mismo servicio de varias líneas
function resumenItems(r) {
  const suma = new Map();
  for (const i of r.items || []) {
    const k = esKm(i) ? 'km' : etiquetaServicio(i).split(' ').slice(0, 3).join(' ');
    suma.set(k, (suma.get(k) || 0) + (+i.cant || 0));
  }
  return [...suma].map(([k, n]) => (k === 'km' ? `${n} km` : `${n} ${k}`)).join(' · ');
}

// Remito del sistema rechazado -> servicios por línea, servicios fuera de la interna y materiales por línea y servicio
function lineasParaCorregir(r) {
  const s = r.sistema || {};
  const lineas = (s.lineaIds || []).length ? s.lineaIds : (s.lineaId ? [s.lineaId] : []);
  const delSistema = (r.items || []).filter(i => i.servicioId && !esKm(i));
  // Materiales sin línea (remitos anteriores): van con la línea de su servicio, o la primera
  const filas = (r.materiales || []).map(f => ({
    ...f, lineaId: f.lineaId || delSistema.find(i => i.servicioId === f.servicioId && i.lineaId && i.lineaId !== '*')?.lineaId || lineas[0] || '',
  }));
  return {
    cantLinea: s.empresaId ? cantidadesPorLinea(delSistema, lineas) : {},
    servExtra: delSistema.map(({ cod, servicio, codigo, servicioId, materiales }) => ({ cod, servicio, codigo, servicioId, materiales })),
    matServ: materialesPorClaveDeFilas(filas),
  };
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
          : chipEstado(r.estado, { tecnico: true, directo: !!r.sistema?.directo })}
      </div>`).join('')}</div>`;
    cont.querySelectorAll('[data-corregir]').forEach(btn => btn.addEventListener('click', () => {
      const r = lista.find(x => x.id === btn.dataset.corregir);
      const [pv, numero] = partesRemito(r.remito);
      estado.corregir = {
        idLocal: r.idLocal || uid(), itemId: r.id, cliente: r.cliente, pv, numero,
        fechaRemito: r.fechaRemito, establecimiento: r.establecimiento, tecnico: r.tecnico,
        cant: cantidadesDeItems(r.items),
        extras: { ...(r.extras || {}) }, acompanante: '', tecnicoEditado: true,
        sistema: r.sistema ? { ...r.sistema } : null,
        ...lineasParaCorregir(r),
        observaciones: r.observaciones, paginas: [], archivoPrevio: !!r.archivoId, comentario: r.comentario,
      };
      ir('nuevo');
    }));
  } catch (e) {
    cont.innerHTML = `<div class="mensaje error">${esc(e.message)}</div>`;
  }
}
