// Revisión de un remito (oficina): foto al lado de los datos, corregir, aprobar o rechazar.
// Lo que corrige el revisor tiene prioridad sobre lo que cargó el técnico.
import { estado, recordar } from '../../../nucleo/estado.js';
import { CODIGOS, ESTADOS, QUIEN } from '../../../nucleo/constantes.js';
import { esc } from '../../../nucleo/texto.js';
import { completarAutomaticos } from '../../../dominio/extras.js';
import { buscarEstablecimiento, esKm } from '../../../dominio/catalogo.js';
import {
  normalizarRemito, partesRemito, itemsDeCantidades, cantidadesDeItems, kilometros, faltantesAprobacion, itemsDeLineas, cantidadesPorLinea,
} from '../../../dominio/remito.js';
import { $, aviso } from '../../dom.js';
import { ir } from '../../navegacion.js';
import { htmlServicios, conectarServicios, htmlAgregarServicio, conectarAgregarServicio } from '../../componentes/servicios.js';
import { htmlSelectExtra, htmlAutomaticos, leerSelectsExtra } from '../../componentes/extras.js';
import { htmlResumenMateriales } from '../../componentes/materiales.js';
import {
  resumenSistema, clienteDelSistema, buscarPorId, nombreLinea, serviciosDelSector,
} from '../../../dominio/sistema.js';
import { intermediaActiva, publicarPendiente, publicarAprobado } from '../../../datos/intermedia.js';
import { conServicios, itemsSinServicio, itemsParaExcel, semillaRemito, nombreArchivoSistema } from '../../../dominio/intermedia.js';
import { guidEstable } from '../../../nucleo/ids.js';

let urlPdf = null;

const nombreDeLinea = id => nombreLinea(buscarPorId(estado.sistema?.catalogos?.lineas, id)) || 'Línea';
const lineasDelRemito = s => ((s?.lineaIds || []).length ? s.lineaIds : (s?.lineaId ? [s.lineaId] : []));

// Interna, empresa, línea y materiales que cargó el técnico (solo lectura; la oficina los usa al pasarlo al sistema)
function htmlTrabajo(r) {
  const s = resumenSistema(estado.sistema?.catalogos, r.sistema);
  if (!s && !r.materiales?.length) return '';
  const dato = (et, v) => (v ? `<div><span class="etiqueta">${et}</span> ${esc(v)}</div>` : '');
  return `<section class="tarjeta">
    <h2>Trabajo en el sistema</h2>
    ${s ? (s.tipo === 'orden'
      ? dato('Interna', s.interna || 'Interna (no está en los catálogos cargados)') + dato('Solicitud', s.solicitud)
      : '<p class="ayuda" style="margin:0">Remito nuevo, sin interna.</p>')
      + dato('Empresa', s.empresa) + dato(r.sistema.lineaIds?.length > 1 ? 'Líneas' : 'Línea', s.linea) + dato('Operadora', s.operadora) + dato('Sector', s.sector) : ''}
    ${r.materiales?.length ? `<h2 style="margin-top:10px">Materiales</h2>${htmlResumenMateriales(r.materiales, r.items, nombreDeLinea)}` : ''}
  </section>`;
}

export async function vistaDetalle(vista, id) {
  vista.className = 'vista ancha';
  let r = (estado.pendientes || []).find(x => x.id === id);
  if (!r) r = (await estado.api.pendientes()).find(x => x.id === id);
  if (!r) { vista.innerHTML = '<div class="mensaje alerta">Ese remito ya no está pendiente.</div><a href="#revision" class="boton">Volver</a>'; return; }
  // Remito con empresa del sistema: servicios por GUID; el Excel solo si esa empresa tiene uno vinculado
  const cli = r.sistema?.empresaId
    ? clienteDelSistema(estado.sistema?.catalogos, r.sistema, estado.clientes, r.items, { soloInterna: true })
    : estado.clientes?.[r.cliente];
  const cliExcel = cli?.sistema ? estado.clientes?.[cli.claveExcel] || null : cli;
  if (!cli) { vista.innerHTML = `<div class="mensaje error">El cliente "${esc(r.cliente)}" no está configurado.</div>`; return; }

  // Valores por defecto para lo que completa la oficina
  r = { ...r };
  if (!r.fechaSolicitud) r.fechaSolicitud = recordar('ultimaFechaSolicitud') || '';
  if (!r.periodo) r.periodo = recordar('ultimoPeriodo') || r.fechaRemito.slice(0, 7);
  const cant = cantidadesDeItems(r.items);
  // Remito del sistema: servicios por línea (el mismo servicio puede estar en varias) y los km aparte
  const lineas = cli.sistema ? lineasDelRemito(r.sistema) : [];
  const cantLinea = cli.sistema ? cantidadesPorLinea(r.items, lineas) : {};
  const [pv, numero] = partesRemito(r.remito);

  vista.innerHTML = `
    <p><a href="#revision">← Volver a la lista</a></p>
    <div class="revision">
      <div class="visor" id="visor"><p class="vacio">Cargando foto…</p></div>
      <div>
        ${r.estado === ESTADOS.PENDIENTE_EXCEL ? `<div class="mensaje error"><b>No se pudo pasar al Excel:</b> ${esc(r.comentario)}</div>` : ''}
        <section class="tarjeta">
          <h2>${esc(cli.nombre)} — remito ${esc(r.remito)}</h2>
          <p class="ayuda" style="margin-top:-8px">Cargado por ${esc(r.tecnico)}${r.creado ? ' el ' + new Date(r.creado).toLocaleString('es-AR') : ''}</p>
          <label>N° de remito</label>
          <div class="fila nro-remito">
            <input id="f-pv" class="pv" inputmode="numeric" value="${esc(pv)}"><span class="guion">–</span>
            <input id="f-numero" inputmode="numeric" value="${esc(numero)}">
          </div>
          <div class="dos-col">
            <div><label for="f-fecha">Fecha del remito</label><input id="f-fecha" type="date" value="${esc(r.fechaRemito)}"></div>
            <div><label for="f-tecnico">Responsable técnico</label><input id="f-tecnico" value="${esc(r.tecnico)}"></div>
            <div><label for="f-solicitud">Fecha de solicitud</label><input id="f-solicitud" type="date" value="${esc(r.fechaSolicitud)}"></div>
            <div><label for="f-periodo">Período</label><input id="f-periodo" type="month" value="${esc(r.periodo)}"></div>
          </div>
          <label for="f-estab">Establecimiento</label>
          ${cli.establecimientos?.length ? `<select id="f-estab">${cli.establecimientos.map(e => `<option ${e.nombre === r.establecimiento ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
            ${cli.establecimientos.some(e => e.nombre === r.establecimiento) ? '' : `<option selected>${esc(r.establecimiento)}</option>`}</select>`
            : `<input id="f-estab" value="${esc(r.establecimiento)}">`}
          <p class="ayuda" id="zona">${r.zona ? `Zona <span class="chip">${esc(r.zona)}</span>` : ''}</p>
          ${(cli.extras || []).filter(d => d.quien !== QUIEN.AUTO).map(d => {
            const v = r.extras?.[d.campo] || (d.opciones?.length === 1 ? d.opciones[0] : '');
            // Si el valor cargado ya no está entre las opciones, se muestra igual para no perderlo
            const ops = (d.opciones || []).includes(v) || !v ? d.opciones || [] : [v, ...(d.opciones || [])];
            return htmlSelectExtra(d, v, ops, d.quien === QUIEN.REVISOR ? ' (lo completa la oficina)' : '');
          }).join('')}
          <p class="ayuda" id="autos"></p>
        </section>
        ${htmlTrabajo(r)}
        <section class="tarjeta">
          <h2>Servicios</h2>
          <div id="servicios">${cli.sistema ? '' : htmlServicios(cli.items, cant)}</div>
          ${r.observaciones ? `<label>Observaciones del técnico</label><p style="margin:0">${esc(r.observaciones)}</p>` : ''}
        </section>
        <section class="tarjeta">
          <h2>Resultado</h2>
          <label for="f-comentario">Comentario (obligatorio para rechazar)</label>
          <textarea id="f-comentario" rows="2"></textarea>
          <div id="msg"></div>
          <div class="acciones">
            <button class="primario grande" id="btn-aprobar">${cliExcel ? 'Aprobar y pasar al Excel' : 'Aprobar y pasar al sistema'}</button>
          </div>
          <div class="acciones">
            <button id="btn-guardar">Guardar cambios</button>
            <button class="peligro" id="btn-rechazar">Rechazar</button>
          </div>
          <p class="ayuda">Excel: ${esc(cliExcel?.excel?.nombre || (cliExcel ? '—' : 'no lleva (la empresa no tiene Excel vinculado)'))}</p>
        </section>
      </div>
    </div>`;

  // Servicios del sistema: un bloque por línea, con la lista de abreviaturas para agregar; los km, uno solo al final
  function pintarServicios() {
    const cont = $('#servicios', vista);
    const servicios = cli.items.filter(i => !esKm(i));
    const claves = lineas.length ? lineas : [''];
    cont.innerHTML = claves.map((l, n) => `<div class="bloque-linea" data-n="${n}">
        ${l ? `<h3 style="margin:10px 0 4px">${esc(nombreDeLinea(l))}</h3>` : ''}
        <div class="lista">${htmlServicios(servicios, cantLinea[l])}</div>
        ${estado.sistema?.catalogos ? htmlAgregarServicio() : ''}</div>`).join('')
      + `<div class="serv-km" id="serv-km">${htmlServicios(cli.items.filter(esKm), cant)}</div>`;
    claves.forEach((l, n) => {
      const bloque = cont.querySelector(`.bloque-linea[data-n="${n}"]`);
      conectarServicios($('.lista', bloque), cantLinea[l]);
      const caja = bloque.querySelector('.agregar-servicio');
      if (caja) conectarAgregarServicio(caja, () => serviciosDelSector(estado.sistema.catalogos, r.sistema.sectorId)
        .filter(x => !servicios.some(y => y.servicioId === x.servicioId)), it => {
        const ya = cli.items.find(x => x.servicioId && x.servicioId === it.servicioId);
        if (!ya) cli.items.splice(cli.items.length - 1, 0, it);
        const cod = ya?.cod || it.cod;
        cantLinea[l][cod] = (+cantLinea[l][cod] || 0) + 1;
        pintarServicios();
      });
    });
    conectarServicios($('#serv-km', cont), cant);
  }
  if (cli.sistema) pintarServicios(); else conectarServicios($('#servicios', vista), cant);
  $('#f-estab', vista).addEventListener('input', e => {
    const est = buscarEstablecimiento(cli, e.target.value);
    r.zona = est?.zona || r.zona;
    $('#zona', vista).innerHTML = r.zona ? `Zona <span class="chip">${esc(r.zona)}</span>` : '';
  });

  // Campos adicionales: lo elegido en pantalla más lo que se calcula de eso (ej. centro de costo según línea)
  const leerExtras = () => completarAutomaticos(cli.extras, leerSelectsExtra(vista));
  const pintarAutos = () => { $('#autos', vista).innerHTML = htmlAutomaticos(cli.extras, leerExtras()); };
  vista.querySelectorAll('[data-extra]').forEach(s => s.addEventListener('input', pintarAutos));
  pintarAutos();

  // Foto
  if (urlPdf) URL.revokeObjectURL(urlPdf);
  estado.api.pdf(r).then(blob => {
    const visor = $('#visor', vista);
    if (!visor) return;
    if (!blob) { visor.innerHTML = '<p class="vacio">El remito no tiene foto.</p>'; return; }
    urlPdf = URL.createObjectURL(blob);
    visor.innerHTML = `<iframe src="${urlPdf}#view=FitH" title="Remito escaneado"></iframe>`;
  }).catch(e => { $('#visor', vista).innerHTML = `<div class="mensaje error">${esc(e.message)}</div>`; });

  function leer() {
    return {
      ...r,
      remito: normalizarRemito($('#f-pv', vista).value, $('#f-numero', vista).value),
      fechaRemito: $('#f-fecha', vista).value,
      tecnico: $('#f-tecnico', vista).value.trim(),
      fechaSolicitud: $('#f-solicitud', vista).value,
      periodo: $('#f-periodo', vista).value,
      establecimiento: $('#f-estab', vista).value,
      // Con sistema, cada servicio con su línea; los km, uno solo
      items: cli.sistema
        ? [...itemsDeLineas(cli.items, cantLinea, lineas), ...itemsDeCantidades(cli.items.filter(esKm), cant)]
        : itemsDeCantidades(cli.items, cant),
      km: kilometros(cli.items, cant),
      extras: leerExtras(),
      revisor: estado.usuario.displayName,
    };
  }

  const msg = (t, tipo) => { $('#msg', vista).innerHTML = t ? `<div class="mensaje ${tipo}">${t}</div>` : ''; };
  const ocupado = on => vista.querySelectorAll('button').forEach(b => { b.disabled = on; });

  $('#btn-guardar', vista).onclick = async () => {
    ocupado(true);
    try { await estado.api.actualizar(leer()); aviso('Cambios guardados.', 'ok'); }
    catch (e) { msg(esc(e.message), 'error'); }
    finally { ocupado(false); }
  };

  $('#btn-rechazar', vista).onclick = async () => {
    const comentario = $('#f-comentario', vista).value.trim();
    if (!comentario) { msg('Escribí el motivo del rechazo para el técnico.', 'error'); return; }
    ocupado(true);
    try {
      await estado.api.actualizar({ ...leer(), estado: ESTADOS.RECHAZADO, comentario, fechaRevision: new Date().toISOString() });
      aviso('Remito rechazado. El técnico lo ve en "Mis remitos".', 'ok');
      ir('revision');
    } catch (e) { msg(esc(e.message), 'error'); ocupado(false); }
  };

  $('#btn-aprobar', vista).onclick = async () => {
    const d = leer();
    // Fecha de solicitud y período son columnas del Excel: sin Excel no se piden
    const faltan = faltantesAprobacion(d, cli).filter(f => cliExcel || !['fecha de solicitud', 'período'].includes(f));
    if (faltan.length) { msg('Falta: ' + faltan.join(', ') + '.', 'error'); return; }
    if (cliExcel && !cliExcel.excel?.itemId && estado.api.modo !== 'demo') { msg('Este cliente no tiene Excel vinculado (Configuración).', 'error'); return; }
    if (!cliExcel && !intermediaActiva()) { msg('Este remito no tiene Excel y el paso al sistema está desactivado.', 'error'); return; }
    // Para el Excel, los servicios del sistema se pasan al código de la planilla del cliente
    let paraExcel = null;
    if (cliExcel) {
      paraExcel = cli.sistema ? itemsParaExcel(d.items, cliExcel.items) : { items: d.items, sinVincular: [] };
      if (paraExcel.sinVincular.length) {
        msg(`Para escribir el Excel de ${esc(cliExcel.nombre)}, vinculá estos servicios en Configuración → ${esc(cliExcel.nombre)}: ${paraExcel.sinVincular.map(i => esc(i.servicio)).join(', ')}.`, 'error');
        return;
      }
    }

    ocupado(true);
    msg('Escribiendo en el Excel…', 'alerta');
    recordar('ultimaFechaSolicitud', d.fechaSolicitud);
    recordar('ultimoPeriodo', d.periodo);
    const revision = { ...d, fechaRevision: new Date().toISOString() };
    // Remito del sistema: primero va a la tabla intermedia como Pendiente; si eso falla no se toca el Excel
    const alSistema = intermediaActiva() && !!revision.sistema;
    if (alSistema) {
      // Al sistema se pasa solo por GUID: cada ítem tiene que estar vinculado a su servicio en Configuración
      const conIds = { ...revision, items: cli.sistema ? revision.items : conServicios(revision.items, cli.items) };
      const sinVincular = itemsSinServicio(conIds);
      if (sinVincular.length) {
        msg(`Falta vincular con su servicio del sistema (Configuración → ${esc(cli.nombre)}): ${sinVincular.map(i => esc(`${i.cod} ${i.servicio || ''}`)).join(', ')}.`, 'error');
        ocupado(false); return;
      }
      msg('Pasando al sistema…', 'alerta');
      try {
        // La foto va a la carpeta común de ALO Manager, con su formato de nombre; el vínculo queda en Archivo
        if (!conIds.sistema.archivo) {
          const nombre = nombreArchivoSistema(conIds.remito, await guidEstable(semillaRemito(conIds)));
          conIds.sistema = { ...conIds.sistema, archivo: await estado.api.subirAlSistema(conIds, nombre) };
          revision.sistema = conIds.sistema;
        }
        await publicarPendiente(conIds, { revisorId: estado.sistema?.usuario?.id });
      }
      catch (e) { msg(`<b>No se pudo pasar al sistema:</b> ${esc(e.message)} El remito sigue pendiente; probá de nuevo.`, 'error'); ocupado(false); return; }
      msg('Escribiendo en el Excel…', 'alerta');
    }
    // Sin Excel: queda aprobado con lo que se pasó al sistema
    if (!cliExcel) {
      try {
        let comentario = '';
        try { await publicarAprobado(revision); }
        catch (err) { comentario = 'Aprobado, pero en el sistema quedó Pendiente: ' + err.message; }
        await estado.api.actualizar({ ...revision, estado: ESTADOS.APROBADO, comentario, archivoUrl: revision.sistema?.archivo || revision.archivoUrl });
        aviso(comentario || 'Aprobado y pasado al sistema.', comentario ? 'error' : 'ok');
        ir('revision');
      } catch (e) { msg(esc(e.message), 'error'); ocupado(false); }
      return;
    }
    const aExcel = { ...revision, items: paraExcel.items };
    try {
      // Primero se guardan las correcciones; si el Excel falla, queda "Pendiente Excel" para reintentar
      await estado.api.actualizar({ ...revision, estado: ESTADOS.PENDIENTE_EXCEL, comentario: 'Pasando al Excel…' });
      const filas = await estado.api.escribirExcel(cliExcel, aExcel);
      // El PDF va a la carpeta del cliente; si falla, el remito igual queda aprobado (el Excel ya se escribió)
      let archivoUrl = revision.archivoUrl, comentario = '';
      try {
        archivoUrl = await estado.api.archivarPdf(cliExcel, revision);
      } catch (err) {
        comentario = 'Aprobado, pero el PDF no se pudo copiar a la carpeta del cliente: ' + err.message;
      }
      // En el sistema pasa a Aprobado (lo que importa ALO Manager); si falla, se avisa para pasarlo a mano
      if (alSistema) {
        try { await publicarAprobado({ ...revision, archivoUrl }); }
        catch (err) { comentario = [comentario, 'Aprobado, pero en el sistema quedó Pendiente: ' + err.message].filter(Boolean).join(' '); }
      }
      await estado.api.actualizar({ ...revision, estado: ESTADOS.APROBADO, comentario, filasExcel: filas, archivoUrl });
      if (comentario) aviso(comentario, 'error');
      aviso(`Aprobado. Filas ${filas} de la planilla${comentario ? '' : ' y PDF guardado junto al Excel'}.`, 'ok');
      ir('revision');
    } catch (e) {
      console.error(e);
      await estado.api.actualizar({ ...revision, estado: ESTADOS.PENDIENTE_EXCEL, comentario: e.message }).catch(() => {});
      msg(`<b>No se pasó al Excel:</b> ${esc(e.message)}` +
        (e.codigo === CODIGOS.DUPLICADO ? '<div class="acciones"><button id="btn-ya-esta">Ya está en la planilla: marcar aprobado</button></div>' : ''), 'error');
      ocupado(false);
      $('#btn-ya-esta', vista)?.addEventListener('click', async () => {
        const archivoUrl = await estado.api.archivarPdf(cliExcel, revision).catch(() => revision.archivoUrl);
        let comentario = 'Ya estaba en la planilla (no se escribió).';
        if (alSistema) await publicarAprobado({ ...revision, archivoUrl }).catch(err => { comentario += ' En el sistema quedó Pendiente: ' + err.message; });
        await estado.api.actualizar({ ...revision, estado: ESTADOS.APROBADO, comentario, archivoUrl });
        aviso('Marcado como aprobado.', 'ok');
        ir('revision');
      });
    }
  };
}
