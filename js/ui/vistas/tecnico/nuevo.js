// Pantalla del técnico: cargar un remito nuevo (con foto) o corregir uno rechazado.
import { estado, recordar } from '../../../nucleo/estado.js';
import { QUIEN } from '../../../nucleo/constantes.js';
import { esc } from '../../../nucleo/texto.js';
import { hoy } from '../../../nucleo/fechas.js';
import { uid } from '../../../nucleo/ids.js';
import { cola, borrador, procesarCola } from '../../../datos/cola.js';
import { prepararFoto, armarPdf } from '../../../medios/pdf.js';
import { editarFoto, miniatura } from '../../../medios/fotos.js';
import { completarAutomaticos } from '../../../dominio/extras.js';
import { buscarEstablecimiento } from '../../../dominio/catalogo.js';
import {
  normalizarRemito, nombreTecnico as nombreEnPlanilla, responsable, itemsDeCantidades, kilometros, validarCarga,
} from '../../../dominio/remito.js';
import { $, aviso } from '../../dom.js';
import { ir, refrescarPestanas } from '../../navegacion.js';
import { htmlServicios, conectarServicios } from '../../componentes/servicios.js';
import { htmlSelectExtra, htmlAutomaticos } from '../../componentes/extras.js';
import { vistaMisRemitos } from './mis-remitos.js';
import { vistaInicio } from './inicio.js';
import { sistemaActivo } from '../../../datos/sistema.js';
import { mismoId } from '../../../nucleo/ids.js';
import {
  buscarPorId, empresasConLineas, acompanantesPosibles, lineasDeEmpresa, nombreLinea, materialesDeStock, materialesRecuperadosDe,
} from '../../../dominio/sistema.js';
import { materialesVacios, filasMateriales, validarMateriales } from '../../../dominio/materiales.js';
import { htmlMateriales, conectarMateriales } from '../../componentes/materiales.js';

const nombreTecnico = cli => nombreEnPlanilla(cli, estado.usuario);

function nuevoBorrador() {
  const claves = Object.keys(estado.clientes || {});
  const cliente = recordar('ultimoCliente') && claves.includes(recordar('ultimoCliente')) ? recordar('ultimoCliente') : claves[0];
  return {
    idLocal: uid(),
    itemId: null,
    cliente,
    pv: recordar('ultimoPv') || '0001',
    numero: '',
    fechaRemito: hoy(),
    establecimiento: '',
    tecnico: nombreTecnico(estado.clientes?.[cliente]),
    acompanante: '',
    extras: {},
    cant: {},
    observaciones: '',
    paginas: [],
    archivoPrevio: false,
    // Con sistema principal: { tipo: 'orden'|'nuevo', ordenId, solicitudId, empresaId, lineaId, operadoraId } (null = elegir)
    sistema: null,
    materiales: materialesVacios(),
  };
}

// ---------- Sistema principal: interna, empresa, línea y operadora ----------

// Origen elegido en la pantalla inicial -> datos del borrador
function aplicarOrigen(b, origen) {
  const sectorId = estado.sistema.usuario.sectorId;
  if (origen.tipo === 'orden') {
    const o = origen.orden;
    b.sistema = {
      tipo: 'orden', ordenId: o.id, solicitudId: o.solicitud.id, empresaId: o.solicitud.empresaId,
      lineaId: o.lineas.length === 1 ? o.lineas[0].id : '', operadoraId: o.lineas.length === 1 ? o.lineas[0].operadoraId : '',
      sectorId: o.sectorId || sectorId,
    };
    if (!b.establecimiento && o.solicitud.ubicacion) b.establecimiento = o.solicitud.ubicacion;
  } else {
    b.sistema = { tipo: 'nuevo', ordenId: '', solicitudId: '', empresaId: '', lineaId: '', operadoraId: '', sectorId };
  }
  elegirClienteDeEmpresa(b);
}

// Si un cliente configurado (con su Excel) corresponde a la empresa del sistema, se elige solo
function elegirClienteDeEmpresa(b) {
  const k = Object.keys(estado.clientes).find(c => mismoId(estado.clientes[c].empresaId, b.sistema?.empresaId));
  if (k && k !== b.cliente) { b.cliente = k; b.cant = {}; b.extras = {}; if (!b.tecnicoEditado) b.tecnico = nombreTecnico(estado.clientes[k]); }
}

// Líneas que se ofrecen: las de la interna si tiene, si no las de la empresa
function lineasPosibles(b) {
  const cat = estado.sistema.catalogos;
  if (b.sistema.tipo === 'orden') {
    const o = buscarPorId(cat.ordenesInternas, b.sistema.ordenId);
    const deOrden = o ? (cat.solicitudLineas || []).filter(l => mismoId(l.ordenInternaId, o.id) || (!l.ordenInternaId && mismoId(l.solicitudId, o.solicitudId)))
      .map(l => buscarPorId(cat.lineas, l.lineaId)).filter(Boolean) : [];
    if (deOrden.length) return deOrden;
  }
  return lineasDeEmpresa(cat, b.sistema.empresaId);
}

function htmlSistema(b) {
  const cat = estado.sistema.catalogos;
  const s = b.sistema;
  const opt = (lista, sel, nombre = x => x.nombre) => lista.map(x => `<option value="${esc(x.id)}" ${mismoId(x.id, sel) ? 'selected' : ''}>${esc(nombre(x))}</option>`).join('');
  let cabecera = '';
  if (s.tipo === 'orden') {
    const o = buscarPorId(cat.ordenesInternas, s.ordenId);
    const sol = buscarPorId(cat.solicitudes, s.solicitudId);
    cabecera = `<span class="etiqueta">Interna</span>
      <div><span class="chip">${esc(o?.numero || o?.numeroALO || 'Interna')}</span> Solicitud ${esc(sol?.numero || '')}${sol?.numeroExterno ? ' · ' + esc(sol.numeroExterno) : ''}</div>`;
  }
  const empresas = s.tipo === 'orden' ? [buscarPorId(cat.empresas, s.empresaId)].filter(Boolean) : empresasConLineas(cat);
  if (s.tipo === 'nuevo') cabecera = `<p class="ayuda" style="margin:0">Remito nuevo, como hasta ahora. Empresa, línea y operadora son opcionales.</p>`;
  return `${cabecera}
    ${b.itemId ? '' : '<div class="acciones" style="margin-top:4px"><button type="button" id="btn-origen">Cambiar interna / remito nuevo</button></div>'}
    <label for="f-empresa">Empresa</label>
    <select id="f-empresa" ${s.tipo === 'orden' ? 'disabled' : ''}><option value="">Elegir…</option>${opt(empresas, s.empresaId)}</select>
    <div class="dos-col">
      <div><label for="f-linea">Línea</label>
        <select id="f-linea"><option value="">Elegir…</option>${opt(lineasPosibles(b), s.lineaId, nombreLinea)}</select></div>
      <div><label for="f-operadora">Operadora</label>
        <select id="f-operadora"><option value="">Elegir…</option>${opt(cat.operadoras, s.operadoraId)}</select></div>
    </div>`;
}

// Materiales disponibles por tipo, según sector, empresa y línea
function opcionesMateriales(b) {
  const cat = estado.sistema.catalogos;
  const rec = materialesRecuperadosDe(cat, b.sistema.empresaId, b.sistema.lineaId);
  return { stock: materialesDeStock(cat), recuperado: rec, reutilizado: rec };
}

// ---------- Nuevo remito / corrección ----------

export async function vistaNuevo(vista) {
  if (!estado.clientes) {
    vista.innerHTML = `<div class="mensaje error">Todavía no hay clientes configurados. ${esc(estado.errorClientes || '')}</div>`;
    return;
  }
  let b = (await borrador.leer().catch(() => null)) || nuevoBorrador();
  if (estado.corregir) { b = estado.corregir; estado.corregir = null; }
  if (!estado.clientes[b.cliente]) b.cliente = Object.keys(estado.clientes)[0];
  b.materiales ??= materialesVacios();
  const conSistema = sistemaActivo() && estado.sistema;
  // Al corregir un remito cargado antes del sistema no se vuelve a la pantalla inicial: queda como remito nuevo
  if (conSistema && b.itemId && !b.sistema) aplicarOrigen(b, { tipo: 'nuevo' });

  let tGuardar;
  const guardarBorrador = () => { clearTimeout(tGuardar); tGuardar = setTimeout(() => borrador.guardar(b).catch(() => {}), 300); };

  function pintar() {
    // Con sistema principal, primero se elige si es de una interna existente o un remito nuevo
    if (conSistema && !b.sistema) {
      vistaInicio(vista, origen => { aplicarOrigen(b, origen); guardarBorrador(); pintar(); window.scrollTo(0, 0); });
      return;
    }
    const cli = estado.clientes[b.cliente];
    const est = buscarEstablecimiento(cli, b.establecimiento);
    const claves = Object.keys(estado.clientes);
    b.extras = b.extras || {};
    const extrasTecnico = (cli.extras || []).filter(d => d.quien === QUIEN.TECNICO);
    // Un campo con una sola opción viene elegido
    for (const d of extrasTecnico) if (!b.extras[d.campo] && d.opciones?.length === 1) b.extras[d.campo] = d.opciones[0];
    const autos = completarAutomaticos(cli.extras, b.extras);
    vista.innerHTML = `
      <h1 class="titulo">${b.itemId ? 'Corregir remito' : 'Nuevo remito'}</h1>
      ${b.comentario ? `<div class="mensaje alerta"><b>Observación de la revisión:</b> ${esc(b.comentario)}</div>` : ''}
      ${conSistema ? `<section class="tarjeta" id="sec-sistema"><h2>Trabajo</h2>${htmlSistema(b)}</section>` : ''}
      <section class="tarjeta">
        <h2>Datos del remito</h2>
        ${claves.length > 1 ? `<label for="f-cliente">Cliente</label>
          <select id="f-cliente">${claves.map(k => `<option value="${esc(k)}" ${k === b.cliente ? 'selected' : ''}>${esc(estado.clientes[k].nombre)}</option>`).join('')}</select>`
          : `<span class="etiqueta">Cliente</span><div><span class="chip">${esc(cli.nombre)}</span></div>`}
        <label for="f-numero">N° de remito</label>
        <div class="fila nro-remito">
          <input id="f-pv" class="pv" inputmode="numeric" maxlength="4" value="${esc(b.pv)}" aria-label="Punto de venta">
          <span class="guion">–</span>
          <input id="f-numero" inputmode="numeric" maxlength="8" placeholder="00005780" value="${esc(b.numero)}" ${b.itemId ? 'readonly' : ''}>
        </div>
        <div class="dos-col">
          <div><label for="f-fecha">Fecha</label><input id="f-fecha" type="date" value="${esc(b.fechaRemito)}"></div>
          <div><label for="f-tecnico">Técnico</label><input id="f-tecnico" value="${esc(b.tecnico)}"></div>
        </div>
        ${conSistema ? `<label for="f-acomp-id">Acompañante (opcional)</label>
        <select id="f-acomp-id"><option value="">Fue solo</option>
          ${acompanantesPosibles(estado.sistema.catalogos, estado.sistema.usuario.id, estado.sistema.ref)
            .map(u => `<option value="${esc(u.id)}" ${mismoId(u.id, b.sistema?.acompananteId) ? 'selected' : ''}>${esc(u.nombre)}</option>`).join('')}
        </select>` : `<label for="f-acomp">Acompañante (opcional, apellido)</label>
        <input id="f-acomp" value="${esc(b.acompanante || '')}" placeholder="Si fueron dos técnicos">`}
        ${extrasTecnico.map(d => htmlSelectExtra(d, b.extras[d.campo], d.opciones || [], d.obligatorio ? '' : ' (opcional)')).join('')}
        <p class="ayuda" id="autos">${htmlAutomaticos(cli.extras, autos)}</p>
        <label for="f-estab">Establecimiento</label>
        ${cli.establecimientos?.length ? `<select id="f-estab">
          <option value="">Elegir…</option>
          ${cli.establecimientos.map(e => `<option ${e.nombre === b.establecimiento ? 'selected' : ''}>${esc(e.nombre)}</option>`).join('')}
        </select>` : `<input id="f-estab" value="${esc(b.establecimiento)}" placeholder="Lugar del trabajo">`}
        <p class="ayuda" id="zona">${est ? `Zona <span class="chip">${esc(est.zona)}</span>` : ''}</p>
      </section>

      <section class="tarjeta">
        <h2>Servicios realizados</h2>
        <p class="ayuda" style="margin:0 0 8px">Cargá lo mismo que escribiste en el remito.</p>
        <div id="servicios">${htmlServicios(cli.items, b.cant)}</div>
        <label for="f-obs">Observaciones (opcional)</label>
        <textarea id="f-obs" rows="2">${esc(b.observaciones)}</textarea>
      </section>

      ${conSistema && estado.sistema.electrico ? `<section class="tarjeta">
        <h2>Materiales</h2>
        <p class="ayuda" style="margin:0 0 8px">Seguridad eléctrica: cargá lo que se usó y lo que se recuperó, haya o no stock. La app no descuenta nada; el sistema lo compara después con el stock.</p>
        <div id="materiales">${htmlMateriales(b.materiales, opcionesMateriales(b))}</div>
      </section>` : ''}

      <section class="tarjeta">
        <h2>Foto del remito firmado</h2>
        <div class="fotos" id="fotos"></div>
        ${b.archivoPrevio && !b.paginas.length ? '<p class="ayuda">Se mantiene la foto enviada antes. Sacá una nueva solo si hay que reemplazarla.</p>' : ''}
        <div class="acciones">
          <label class="boton primario subir-foto">📷 Sacar foto
            <input type="file" accept="image/*" capture="environment" id="f-camara"></label>
          <label class="boton subir-foto">Elegir de la galería
            <input type="file" accept="image/*" multiple id="f-galeria"></label>
        </div>
        <p class="ayuda">Con buena luz, el remito entero y la firma visible. Tocá la foto para recortarla o girarla.</p>
      </section>

      <div id="errores"></div>
      <button class="primario grande ancho" id="btn-enviar">${b.itemId ? 'Reenviar corregido' : 'Enviar remito'}</button>
      <div class="acciones"><button id="btn-descartar" class="peligro">Descartar</button></div>`;

    pintarFotos();
    conectar();
  }

  async function pintarFotos() {
    const cont = $('#fotos', vista);
    if (!cont) return;
    cont.innerHTML = '';
    for (const [i, p] of b.paginas.entries()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'foto';
      btn.innerHTML = `<span class="num">${i + 1}</span>`;
      btn.onclick = async () => {
        const r = await editarFoto(p);
        if (r === null) b.paginas.splice(i, 1); else b.paginas[i] = r;
        guardarBorrador();
        pintarFotos();
      };
      cont.append(btn);
      miniatura(p).then(src => { const im = new Image(); im.src = src; im.alt = 'Página ' + (i + 1); btn.prepend(im); });
    }
  }

  async function agregarFotos(archivos) {
    for (const f of archivos) {
      try {
        const blob = await prepararFoto(f);
        const editada = await editarFoto({ blob, giro: 0, recorte: { x: 0, y: 0, w: 1, h: 1 }, mejorar: true });
        if (editada) b.paginas.push(editada);
      } catch (e) { aviso(e.message, 'error'); }
    }
    guardarBorrador();
    pintar();
  }

  function conectar() {
    const on = (sel, ev, fn) => $(sel, vista)?.addEventListener(ev, fn);
    on('#f-cliente', 'change', e => {
      b.cliente = e.target.value; b.establecimiento = ''; b.cant = {}; b.extras = {};
      if (!b.tecnicoEditado) b.tecnico = nombreTecnico(estado.clientes[b.cliente]);
      guardarBorrador(); pintar();
    });
    on('#f-acomp', 'input', e => { b.acompanante = e.target.value; guardarBorrador(); });
    // Con sistema el acompañante se elige por GUID; para la planilla se usa su apellido
    on('#f-acomp-id', 'change', e => {
      const u = buscarPorId(estado.sistema.catalogos.usuarios, e.target.value);
      b.sistema.acompananteId = u?.id || '';
      b.acompanante = u ? u.nombre.trim().split(/\s+/).pop() : '';
      guardarBorrador();
    });
    vista.querySelectorAll('[data-extra]').forEach(sel => sel.addEventListener('input', () => {
      b.extras[sel.dataset.extra] = sel.value;
      const cli = estado.clientes[b.cliente];
      const autos = completarAutomaticos(cli.extras, b.extras);
      $('#autos', vista).innerHTML = htmlAutomaticos(cli.extras, autos);
      guardarBorrador();
    }));
    on('#f-pv', 'input', e => { b.pv = e.target.value; guardarBorrador(); });
    on('#f-numero', 'input', e => { b.numero = e.target.value; guardarBorrador(); });
    on('#f-fecha', 'change', e => { b.fechaRemito = e.target.value; guardarBorrador(); });
    on('#f-tecnico', 'input', e => { b.tecnico = e.target.value; b.tecnicoEditado = true; guardarBorrador(); });
    on('#f-obs', 'input', e => { b.observaciones = e.target.value; guardarBorrador(); });
    on('#f-estab', 'input', e => {
      b.establecimiento = e.target.value;
      const est = buscarEstablecimiento(estado.clientes[b.cliente], b.establecimiento);
      $('#zona', vista).innerHTML = est ? `Zona <span class="chip">${esc(est.zona)}</span>` : '';
      guardarBorrador();
    });
    conectarServicios($('#servicios', vista), b.cant, guardarBorrador);
    if (conSistema) {
      on('#btn-origen', 'click', () => { b.sistema = null; guardarBorrador(); pintar(); });
      on('#f-empresa', 'change', e => {
        Object.assign(b.sistema, { empresaId: e.target.value, lineaId: '', operadoraId: '' });
        b.materiales.recuperado = {}; b.materiales.reutilizado = {};
        elegirClienteDeEmpresa(b); guardarBorrador(); pintar();
      });
      on('#f-linea', 'change', e => {
        b.sistema.lineaId = e.target.value;
        // La operadora sale de la línea; se puede cambiar a mano
        const l = buscarPorId(estado.sistema.catalogos.lineas, b.sistema.lineaId);
        if (l?.operadoraId) b.sistema.operadoraId = l.operadoraId;
        b.materiales.recuperado = {}; b.materiales.reutilizado = {};
        guardarBorrador(); pintar();
      });
      on('#f-operadora', 'change', e => { b.sistema.operadoraId = e.target.value; guardarBorrador(); });
      const mat = $('#materiales', vista);
      if (mat) {
        conectarMateriales(mat, b.materiales, redibujar => {
          guardarBorrador();
          if (redibujar) mat.innerHTML = htmlMateriales(b.materiales, opcionesMateriales(b));
        });
      }
    }
    on('#f-camara', 'change', e => agregarFotos([...e.target.files]));
    on('#f-galeria', 'change', e => agregarFotos([...e.target.files]));
    on('#btn-enviar', 'click', enviar);
    on('#btn-descartar', 'click', async () => {
      if (!confirm('¿Descartar este remito? Se borra lo cargado.')) return;
      clearTimeout(tGuardar);
      await borrador.borrar();
      b = nuevoBorrador();
      pintar();
    });
  }

  // Ítems cargados según el catálogo del cliente
  const itemsCargados = () => itemsDeCantidades(estado.clientes[b.cliente].items, b.cant);

  const validar = () => {
    const err = validarCarga(b, estado.clientes[b.cliente], {
      hoy: hoy(), remito: normalizarRemito(b.pv, b.numero), items: itemsCargados(),
    });
    if (conSistema) {
      // Solo el remito de una interna exige empresa y línea; el remito nuevo sigue como siempre
      if (b.sistema.tipo === 'orden') {
        if (!b.sistema.empresaId) err.unshift('Elegí la empresa.');
        else if (!b.sistema.lineaId && lineasPosibles(b).length) err.unshift('Elegí la línea.');
      }
      if (estado.sistema.electrico) err.push(...validarMateriales(b.materiales));
    }
    return err;
  };

  async function enviar() {
    const err = validar();
    const caja = $('#errores', vista);
    if (err.length) {
      caja.innerHTML = `<div class="mensaje error">Revisá lo siguiente:<ul>${err.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
      caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    caja.innerHTML = '';
    const btn = $('#btn-enviar', vista);
    btn.disabled = true;
    btn.textContent = 'Preparando…';
    try {
      const cli = estado.clientes[b.cliente];
      const remito = normalizarRemito(b.pv, b.numero);
      // Con señal, avisar enseguida si el número ya existe
      if (navigator.onLine && !b.itemId) {
        const ex = await estado.api.buscarRemito(remito).catch(() => null);
        if (ex && ex.idLocal !== b.idLocal) {
          caja.innerHTML = `<div class="mensaje error">El remito ${esc(remito)} ya fue cargado por ${esc(ex.tecnico)} (${esc(ex.estado)}). Revisá el número.</div>`;
          return;
        }
      }
      const est = buscarEstablecimiento(cli, b.establecimiento);
      // Solo lo que carga el técnico y lo que se calcula de eso; lo del revisor se completa en la oficina
      const extras = completarAutomaticos(cli.extras, Object.fromEntries(
        (cli.extras || []).filter(d => d.quien === QUIEN.TECNICO).map(d => [d.campo, b.extras?.[d.campo] || ''])));
      const entrada = {
        idLocal: b.idLocal,
        itemId: b.itemId,
        creado: new Date().toISOString(),
        datos: {
          cliente: b.cliente,
          clienteNombre: cli.nombre,
          remito,
          fechaRemito: b.fechaRemito,
          establecimiento: b.establecimiento,
          zona: est?.zona || '',
          tecnico: responsable(b.tecnico, b.acompanante),
          tecnicoEmail: estado.usuario.email,
          items: itemsCargados(),
          extras,
          km: kilometros(cli.items, b.cant),
          observaciones: b.observaciones.trim(),
          // IDs del sistema principal (Dataverse) y materiales; sin sistema quedan vacíos
          ...(conSistema ? {
            sistema: { ...b.sistema, tecnicoId: estado.sistema.usuario.id },
            materiales: estado.sistema.electrico ? filasMateriales(b.materiales, estado.sistema.catalogos) : [],
          } : {}),
        },
        pdf: b.paginas.length ? await armarPdf(b.paginas) : null,
      };
      await cola.guardar(entrada);
      // Cancelar un guardado del borrador que esté por correr: si no, el remito enviado vuelve como borrador
      // con el mismo idLocal y el próximo envío lo pisa en lugar de avisar que el número ya existe.
      clearTimeout(tGuardar);
      await borrador.borrar();
      recordar('ultimoCliente', b.cliente);
      recordar('ultimoPv', b.pv);
      aviso(navigator.onLine ? 'Remito guardado. Enviando…' : 'Sin señal: queda guardado y se envía solo al volver la conexión.', 'ok');
      refrescarPestanas();
      ir('mis');
      await procesarCola(estado.api, refrescarPestanas);
      if (location.hash === '#mis') vistaMisRemitos($('#vista'));
    } catch (e) {
      console.error(e);
      caja.innerHTML = `<div class="mensaje error">No se pudo guardar: ${esc(e.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = b.itemId ? 'Reenviar corregido' : 'Enviar remito';
    }
  }

  pintar();
}
