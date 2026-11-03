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
import { vistaElegirOrigen, vistaInternas } from './inicio.js';
import { sistemaActivo, motivoSinSistema } from '../../../datos/sistema.js';
import { mismoId } from '../../../nucleo/ids.js';
import {
  buscarPorId, empresasConLineas, acompanantesPosibles, lineasDeEmpresa, nombreLinea, materialesDeStock, materialesRecuperadosDe,
  clienteDelSistema, identidadInterna,
} from '../../../dominio/sistema.js';
import { materialesVacios, filasMaterialesPorServicio, validarMateriales } from '../../../dominio/materiales.js';
import { htmlMateriales, conectarMateriales } from '../../componentes/materiales.js';
import { TODAS_LAS_LINEAS } from '../../../dominio/intermedia.js';
import { esKm } from '../../../dominio/catalogo.js';

const nombreTecnico = cli => nombreEnPlanilla(cli, estado.usuario);

// Botón Atrás del celular dentro de "Nuevo remito": lo maneja la pantalla abierta
// (si el Atrás cambia de pestaña, lo resuelve la navegación por hash y acá no se hace nada)
let alVolverAtras = null;
let hashActual = location.hash;
window.addEventListener('popstate', e => { if (location.hash === hashActual) alVolverAtras?.(e); });
window.addEventListener('hashchange', () => { hashActual = location.hash; });

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
    // Materiales por servicio (Montaje, Desmontaje y los que requieren recuento): { servicioId: { tipo: { id: cant } } }
    matServ: {},
    // Con varias líneas en la interna: a qué línea va cada servicio { servicioId: lineaId | TODAS_LAS_LINEAS }
    lineaServ: {},
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
      // Varias líneas: cada servicio se asigna a una o a todas; la operadora sale de cada línea
      lineaIds: o.lineas.length > 1 ? o.lineas.map(l => l.id) : [],
      operadorasPorLinea: o.lineas.length > 1 ? Object.fromEntries(o.lineas.map(l => [l.id, l.operadoraId || ''])) : {},
    };
    b.lineaServ = {};
    // Establecimiento = locación (la Ubicación de la solicitud son coordenadas)
    const locacion = o.locacion || o.solicitud.locacion;
    if (!b.establecimiento && locacion) b.establecimiento = locacion;
  } else {
    b.sistema = { tipo: 'nuevo', ordenId: '', solicitudId: '', empresaId: '', lineaId: '', operadoraId: '', sectorId };
  }
  elegirClienteDeEmpresa(b);
}

// Con empresa del sistema, el cliente es esa empresa y los servicios salen de Dataverse (por GUID).
// Si además hay un cliente configurado con Excel para esa empresa, queda vinculado para escribir su planilla.
// Sin empresa (remito nuevo como hasta ahora) se usan los clientes configurados de siempre.
const deSistema = b => Boolean(b.sistema?.empresaId);
function clienteActual(b) {
  if (deSistema(b) && estado.sistema) return clienteDelSistema(estado.sistema.catalogos, b.sistema, estado.clientes);
  return estado.clientes[b.cliente];
}
function elegirClienteDeEmpresa(b) {
  const clave = deSistema(b) ? clienteActual(b).claveExcel : (estado.clientes[b.cliente] ? b.cliente : Object.keys(estado.clientes)[0]);
  const marca = deSistema(b) ? `${b.sistema.empresaId}|${b.sistema.ordenId}` : '';
  if (clave !== b.cliente || marca !== (b.marcaServicios || '')) { b.cliente = clave; b.cant = {}; b.extras = {}; b.marcaServicios = marca; }
  if (!b.tecnicoEditado) b.tecnico = nombreTecnico(clienteActual(b));
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

const variasLineas = b => (b.sistema?.lineaIds || []).length > 1;

function htmlSistema(b) {
  const cat = estado.sistema.catalogos;
  const s = b.sistema;
  const opt = (lista, sel, nombre = x => x.nombre) => lista.map(x => `<option value="${esc(x.id)}" ${mismoId(x.id, sel) ? 'selected' : ''}>${esc(nombre(x))}</option>`).join('');
  let cabecera = '';
  if (s.tipo === 'orden') {
    const o = buscarPorId(cat.ordenesInternas, s.ordenId);
    const sol = buscarPorId(cat.solicitudes, s.solicitudId);
    cabecera = `<span class="etiqueta">Interna</span>
      <div><span class="chip">${esc(identidadInterna(o, buscarPorId(cat.sectores, o?.sectorId)) || 'Interna')}</span></div>`;
  }
  const empresas = s.tipo === 'orden' ? [buscarPorId(cat.empresas, s.empresaId)].filter(Boolean) : empresasConLineas(cat);
  if (s.tipo === 'nuevo') cabecera = `<p class="ayuda" style="margin:0">Remito nuevo, como hasta ahora. Empresa, línea y operadora son opcionales.</p>`;
  return `${cabecera}
    <label for="f-empresa">Empresa</label>
    <select id="f-empresa" ${s.tipo === 'orden' ? 'disabled' : ''}><option value="">Elegir…</option>${opt(empresas, s.empresaId)}</select>
    ${variasLineas(b) ? `<span class="etiqueta">Líneas de la interna</span>
      <div>${s.lineaIds.map(id => `<span class="chip">${esc(nombreLinea(buscarPorId(cat.lineas, id)))}</span>`).join(' ')}</div>
      <p class="ayuda" style="margin:4px 0 0">En cada servicio elegís a qué línea pertenece, o a todas.</p>` : `
    <div class="dos-col">
      <div><label for="f-linea">Línea</label>
        <select id="f-linea"><option value="">Elegir…</option>${opt(lineasPosibles(b), s.lineaId, nombreLinea)}</select></div>
      <div><label for="f-operadora">Operadora</label>
        <select id="f-operadora"><option value="">Elegir…</option>${opt(cat.operadoras, s.operadoraId)}</select></div>
    </div>`}`;
}

// Líneas a las que va un servicio (todas si se adjunta a todas o todavía no se eligió)
function lineasDeServicio(b, servicioId) {
  if (!variasLineas(b)) return [b.sistema.lineaId || ''];
  const l = b.lineaServ?.[servicioId];
  return !l || l === TODAS_LAS_LINEAS ? b.sistema.lineaIds : [l];
}

// Materiales disponibles por tipo: stock nuevo (todos) y recuperado de la empresa y la(s) línea(s) del servicio
function opcionesMateriales(b, servicioId) {
  const cat = estado.sistema.catalogos;
  const lineas = lineasDeServicio(b, servicioId);
  const rec = lineas.flatMap(l => materialesRecuperadosDe(cat, b.sistema.empresaId, l)
    .map(m => (lineas.length > 1 ? { ...m, nombre: `${m.nombre} — ${nombreLinea(buscarPorId(cat.lineas, m.lineaId))}` } : m)));
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
  b.matServ ??= {};
  b.lineaServ ??= {};
  const conSistema = sistemaActivo() && estado.sistema;
  if (!(conSistema && deSistema(b)) && !estado.clientes[b.cliente]) b.cliente = Object.keys(estado.clientes)[0];
  // Al corregir un remito cargado antes del sistema no se vuelve a la pantalla inicial: queda como remito nuevo
  if (conSistema && b.itemId && !b.sistema) aplicarOrigen(b, { tipo: 'nuevo' });

  let tGuardar;
  const guardarBorrador = () => { clearTimeout(tGuardar); tGuardar = setTimeout(() => borrador.guardar(b).catch(() => {}), 300); };

  // Pasos con sistema: 'elegir' (interna o nuevo) -> 'internas' -> formulario. Cada paso queda en el historial,
  // así el botón Atrás del celular (y el "← Volver" de la pantalla) vuelve al paso anterior.
  let paso = b.sistema ? 'form' : 'elegir';
  const avanzar = p => { paso = p; history.pushState({ remitoPaso: p }, ''); guardarBorrador(); pintar(); window.scrollTo(0, 0); };
  const volverA = p => {
    // Al dejar el formulario se suelta la interna (y lo que dependía de ella); el resto de lo cargado se conserva
    if (p !== 'form' && b.sistema && !b.itemId) { b.sistema = null; b.cant = {}; b.matServ = {}; b.lineaServ = {}; guardarBorrador(); }
    paso = p; pintar(); window.scrollTo(0, 0);
  };
  const anterior = () => (b.sistema?.tipo === 'orden' ? 'internas' : 'elegir');
  const volver = () => {
    if (b.itemId) { ir('mis'); return; }
    if (history.state?.remitoPaso) history.back();
    else { history.replaceState({ remitoPaso: anterior() }, ''); volverA(anterior()); }
  };
  alVolverAtras = e => {
    const r = location.hash.slice(1).split('/')[0];
    if (r && r !== 'nuevo') return;
    volverA(e.state?.remitoPaso || 'elegir');
  };

  function pintar() {
    if (conSistema && !b.sistema) {
      if (paso === 'internas') {
        vistaInternas(vista, { alElegir: orden => { aplicarOrigen(b, { tipo: 'orden', orden }); avanzar('form'); }, alVolver: volver });
      } else {
        vistaElegirOrigen(vista, { alInterna: () => avanzar('internas'), alNuevo: () => { aplicarOrigen(b, { tipo: 'nuevo' }); avanzar('form'); } });
      }
      return;
    }
    const cli = clienteActual(b);
    const est = buscarEstablecimiento(cli, b.establecimiento);
    const claves = cli.sistema ? [] : Object.keys(estado.clientes);
    b.extras = b.extras || {};
    const extrasTecnico = (cli.extras || []).filter(d => d.quien === QUIEN.TECNICO);
    // Un campo con una sola opción viene elegido
    for (const d of extrasTecnico) if (!b.extras[d.campo] && d.opciones?.length === 1) b.extras[d.campo] = d.opciones[0];
    const autos = completarAutomaticos(cli.extras, b.extras);
    vista.innerHTML = `
      ${conSistema || b.itemId ? '<button type="button" class="volver" id="btn-volver">← Volver</button>' : ''}
      ${!conSistema && sistemaActivo() && motivoSinSistema ? `<div class="mensaje alerta">No se pudo usar el sistema, así que se carga como hasta ahora. ${esc(motivoSinSistema)}
        <div class="acciones"><button type="button" id="btn-reintentar">Reintentar</button></div></div>` : ''}
      <h1 class="titulo">${b.itemId ? 'Corregir remito' : 'Nuevo remito'}</h1>
      ${b.comentario ? `<div class="mensaje alerta"><b>Observación de la revisión:</b> ${esc(b.comentario)}</div>` : ''}
      ${conSistema ? `<section class="tarjeta" id="sec-sistema"><h2>Trabajo</h2>${htmlSistema(b)}</section>` : ''}
      <section class="tarjeta">
        <h2>Datos del remito</h2>
        ${claves.length > 1 ? `<label for="f-cliente">Cliente</label>
          <select id="f-cliente">${claves.map(k => `<option value="${esc(k)}" ${k === b.cliente ? 'selected' : ''}>${esc(estado.clientes[k].nombre)}</option>`).join('')}</select>`
          : `<span class="etiqueta">Cliente</span><div><span class="chip">${esc(cli.nombre)}</span>${cli.sistema
            ? ` <small class="ayuda">${cli.claveExcel ? 'también va a su Excel' : 'del sistema'}</small>` : ''}</div>`}
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
        <p class="ayuda" style="margin:0 0 8px">${cli.sistema ? 'Servicios del sistema ' + (b.sistema.tipo === 'orden' ? 'de la interna' : 'de tu sector') + '. ' : ''}Cargá lo mismo que escribiste en el remito.</p>
        <div id="servicios">${htmlServicios(cli.items, b.cant)}</div>
        <div id="lineas-serv"></div>
        <label for="f-obs">Observaciones (opcional)</label>
        <textarea id="f-obs" rows="2">${esc(b.observaciones)}</textarea>
      </section>

      ${conSistema && cli.sistema ? `<section class="tarjeta" id="sec-materiales" hidden>
        <h2>Materiales</h2>
        <p class="ayuda" style="margin:0 0 8px">Por cada servicio: el material nuevo de stock que se usó y el recuperado de esta empresa y línea, haya o no saldo. La app no descuenta nada; el sistema lo compara después.</p>
        <div id="materiales"></div>
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
    pintarPorServicio();
  }

  // Servicios cargados (sin km); lo que depende de ellos se redibuja cuando cambia este conjunto
  const serviciosCargados = () => (conSistema && deSistema(b) ? clienteActual(b).items.filter(i => !esKm(i) && +b.cant[i.cod] > 0) : []);
  let firmaServicios = '';
  function pintarPorServicio(forzar = true) {
    const firma = serviciosCargados().map(i => i.cod).join('|');
    if (!forzar && firma === firmaServicios) return;
    firmaServicios = firma;
    pintarLineasServicio();
    pintarMateriales();
  }

  // Con varias líneas: a qué línea pertenece cada servicio cargado
  function pintarLineasServicio() {
    const cont = $('#lineas-serv', vista);
    if (!cont) return;
    if (!variasLineas(b)) { cont.innerHTML = ''; return; }
    const cat = estado.sistema.catalogos;
    const servs = serviciosCargados();
    cont.innerHTML = servs.length ? `<h3 style="margin:10px 0 4px">¿A qué línea pertenece cada servicio?</h3>${servs.map(i => `
      <label for="ls-${esc(i.cod)}">${esc(i.servicio)}</label>
      <select id="ls-${esc(i.cod)}" data-linea-serv="${esc(i.servicioId)}">
        <option value="">Elegir…</option>
        <option value="${TODAS_LAS_LINEAS}" ${b.lineaServ[i.servicioId] === TODAS_LAS_LINEAS ? 'selected' : ''}>Todas las líneas</option>
        ${b.sistema.lineaIds.map(id => `<option value="${esc(id)}" ${mismoId(b.lineaServ[i.servicioId], id) ? 'selected' : ''}>${esc(nombreLinea(buscarPorId(cat.lineas, id)))}</option>`).join('')}
      </select>`).join('')}` : '';
    cont.querySelectorAll('[data-linea-serv]').forEach(sel => sel.addEventListener('change', () => {
      const sid = sel.dataset.lineaServ;
      b.lineaServ[sid] = sel.value;
      // El recuperado depende de la línea: al cambiarla se vacía el de ese servicio
      if (b.matServ[sid]) { b.matServ[sid].recuperado = {}; b.matServ[sid].reutilizado = {}; }
      guardarBorrador(); pintarMateriales();
    }));
  }

  // Un bloque de materiales por cada servicio cargado que los lleva
  function serviciosConMateriales() {
    if (!(conSistema && deSistema(b))) return [];
    return clienteActual(b).items.filter(i => i.materiales && +b.cant[i.cod] > 0);
  }
  function pintarMateriales() {
    const sec = $('#sec-materiales', vista);
    if (!sec) return;
    const servs = serviciosConMateriales();
    sec.hidden = !servs.length;
    const cont = $('#materiales', vista);
    cont.innerHTML = servs.map((i, n) => `<div class="bloque-material" data-serv="${esc(i.servicioId)}">
      <h3 style="margin:8px 0 4px">${esc(i.servicio)}${i.codigo ? ` <small>(${esc(i.codigo)})</small>` : ''}</h3>
      ${htmlMateriales(b.matServ[i.servicioId] ||= materialesVacios(), opcionesMateriales(b, i.servicioId), `m${n}`)}</div>`).join('');
    cont.querySelectorAll('[data-serv]').forEach(bloque => {
      const m = b.matServ[bloque.dataset.serv];
      conectarMateriales(bloque, m, redibujar => { guardarBorrador(); if (redibujar) pintarMateriales(); });
    });
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
    on('#btn-volver', 'click', volver);
    on('#btn-reintentar', 'click', () => location.reload());
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
      const cli = clienteActual(b);
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
      const est = buscarEstablecimiento(clienteActual(b), b.establecimiento);
      $('#zona', vista).innerHTML = est ? `Zona <span class="chip">${esc(est.zona)}</span>` : '';
      guardarBorrador();
    });
    conectarServicios($('#servicios', vista), b.cant, () => {
      guardarBorrador();
      // Aparecen o desaparecen la línea y los materiales del servicio
      pintarPorServicio(false);
    });
    if (conSistema) {

      on('#f-empresa', 'change', e => {
        Object.assign(b.sistema, { empresaId: e.target.value, lineaId: '', operadoraId: '' });
        b.matServ = {};
        elegirClienteDeEmpresa(b); guardarBorrador(); pintar();
      });
      on('#f-linea', 'change', e => {
        b.sistema.lineaId = e.target.value;
        // La operadora sale de la línea; se puede cambiar a mano
        const l = buscarPorId(estado.sistema.catalogos.lineas, b.sistema.lineaId);
        if (l?.operadoraId) b.sistema.operadoraId = l.operadoraId;
        // El recuperado es de cada línea: al cambiarla se vacía
        for (const m of Object.values(b.matServ)) { m.recuperado = {}; m.reutilizado = {}; }
        guardarBorrador(); pintar();
      });
      on('#f-operadora', 'change', e => { b.sistema.operadoraId = e.target.value; guardarBorrador(); });
    }
    on('#f-camara', 'change', e => agregarFotos([...e.target.files]));
    on('#f-galeria', 'change', e => agregarFotos([...e.target.files]));
    on('#btn-enviar', 'click', enviar);
    on('#btn-descartar', 'click', async () => {
      if (!confirm('¿Descartar este remito? Se borra lo cargado.')) return;
      clearTimeout(tGuardar);
      await borrador.borrar();
      b = nuevoBorrador();
      paso = 'elegir';
      pintar();
    });
  }

  // Ítems cargados según el catálogo del cliente
  const itemsCargados = () => itemsDeCantidades(clienteActual(b).items, b.cant)
    .map(i => (variasLineas(b) && i.servicioId && b.lineaServ[i.servicioId] ? { ...i, lineaId: b.lineaServ[i.servicioId] } : i));

  const validar = () => {
    const err = validarCarga(b, clienteActual(b), {
      hoy: hoy(), remito: normalizarRemito(b.pv, b.numero), items: itemsCargados(),
    });
    if (conSistema) {
      // Solo el remito de una interna exige empresa y línea; el remito nuevo sigue como siempre
      if (b.sistema.tipo === 'orden') {
        if (!b.sistema.empresaId) err.unshift('Elegí la empresa.');
        else if (variasLineas(b)) {
          const sinLinea = serviciosCargados().filter(i => !b.lineaServ[i.servicioId]);
          if (sinLinea.length) err.unshift(`Elegí a qué línea pertenece: ${sinLinea.map(i => i.servicio).join(', ')}.`);
        } else if (!b.sistema.lineaId && lineasPosibles(b).length) err.unshift('Elegí la línea.');
      }
      for (const i of serviciosConMateriales()) err.push(...validarMateriales(b.matServ[i.servicioId]).map(e => `${i.servicio}: ${e}`));
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
      const cli = clienteActual(b);
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
            materiales: filasMaterialesPorServicio(b.matServ, estado.sistema.catalogos, serviciosConMateriales().map(i => i.servicioId)),
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
