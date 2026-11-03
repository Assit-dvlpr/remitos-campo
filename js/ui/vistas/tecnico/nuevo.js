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
  normalizarRemito, nombreTecnico as nombreEnPlanilla, responsable, itemsDeCantidades, itemsDeLineas, kilometros, validarCarga,
} from '../../../dominio/remito.js';
import { $, aviso } from '../../dom.js';
import { ir, refrescarPestanas } from '../../navegacion.js';
import {
  htmlServicios, conectarServicios, htmlPestanasLineas, htmlAgregarServicio, conectarAgregarServicio, etiquetaServicio,
} from '../../componentes/servicios.js';
import { htmlSelectExtra, htmlAutomaticos } from '../../componentes/extras.js';
import { vistaMisRemitos } from './mis-remitos.js';
import { vistaElegirOrigen, vistaInternas } from './inicio.js';
import { sistemaActivo, motivoSinSistema } from '../../../datos/sistema.js';
import { intermediaActiva } from '../../../datos/intermedia.js';
import { mismoId } from '../../../nucleo/ids.js';
import {
  buscarPorId, empresasConLineas, acompanantesPosibles, lineasDeEmpresa, nombreLinea, materialesDeStock, materialesRecuperadosDe,
  clienteDelSistema, identidadInterna, serviciosDelSector, esSectorElectrico,
} from '../../../dominio/sistema.js';
import { materialesVacios, claveMaterial, filasMaterialesPorClave, validarMateriales } from '../../../dominio/materiales.js';
import { htmlMateriales, conectarMateriales } from '../../componentes/materiales.js';
import { esKm } from '../../../dominio/catalogo.js';

const nombreTecnico = cli => nombreEnPlanilla(cli, estado.usuario);

// Botón Atrás del celular dentro de "Nuevo remito": lo maneja la pantalla abierta
// (si el Atrás cambia de pestaña, lo resuelve la navegación por hash y acá no se hace nada)
let alVolverAtras = null;

// Marca de "cámara abierta": algunos celulares recargan la página al volver de la cámara y así no se pierde lo cargado
const MARCA_CAMARA = 'remito-camara-abierta';
const leerMarca = () => { try { return !!sessionStorage.getItem(MARCA_CAMARA); } catch { return false; } };
const marcarCamara = () => { try { sessionStorage.setItem(MARCA_CAMARA, '1'); } catch { /* sin almacenamiento */ } };
const borrarMarca = () => { try { sessionStorage.removeItem(MARCA_CAMARA); } catch { /* sin almacenamiento */ } };
// Salir de "Nuevo remito" con cambios sin enviar pide confirmación (pestañas, recargar o cerrar la app)
let hayCambios = () => false;
const enNuevo = () => (location.hash.slice(1).split('/')[0] || 'nuevo') === 'nuevo';
const confirmarSalida = () => !(enNuevo() && hayCambios())
  || confirm('Tenés un remito sin enviar. Si salís se pierde lo cargado. ¿Salir igual?');
document.addEventListener('click', e => {
  const a = e.target.closest?.('#pestanas a');
  if (!a || a.getAttribute('href') === (location.hash || '#nuevo')) return;
  if (!confirmarSalida()) { e.preventDefault(); e.stopPropagation(); }
}, true);
window.addEventListener('beforeunload', e => {
  if (enNuevo() && hayCambios() && !leerMarca()) { e.preventDefault(); e.returnValue = ''; }
});
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
    // Con empresa del sistema, servicios por línea (una pestaña por línea): { lineaId: { cod: cant } } ('' = sin línea).
    // Los kilómetros son uno solo para todo el remito y quedan en cant.
    cantLinea: {},
    lineaActiva: '',
    // Servicios agregados desde el catálogo del sector (además de los de la interna)
    servExtra: [],
    // Materiales por línea y servicio (Montaje, Desmontaje y los que requieren recuento): { 'lineaId|servicioId': { tipo: { id: cant } } }
    matServ: {},
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
      sectorId: o.sectorId || sectorId,
      // Líneas del remito (las de la interna; se pueden agregar otras de la empresa). La operadora sale de cada línea.
      lineaIds: o.lineas.map(l => l.id),
      operadorasPorLinea: Object.fromEntries(o.lineas.map(l => [l.id, l.operadoraId || ''])),
      lineasAgregadas: [],
    };
    sincronizarLinea(b.sistema);
    // Establecimiento = locación (la Ubicación de la solicitud son coordenadas)
    const locacion = o.locacion || o.solicitud.locacion;
    if (!b.establecimiento && locacion) b.establecimiento = locacion;
  } else {
    b.sistema = {
      tipo: 'nuevo', ordenId: '', solicitudId: '', empresaId: '', lineaId: '', operadoraId: '', sectorId,
      lineaIds: [], operadorasPorLinea: {}, lineasAgregadas: [],
    };
  }
  elegirClienteDeEmpresa(b);
}

// La primera línea (y su operadora) queda también como línea principal del remito
function sincronizarLinea(s) {
  s.lineaId = s.lineaIds?.[0] || '';
  s.operadoraId = s.operadorasPorLinea?.[s.lineaId] || '';
}

// Remitos guardados antes de las pestañas por línea: una sola línea en lineaId
function normalizarLineas(b) {
  b.cantLinea ??= {};
  b.servExtra ??= [];
  b.matServ ??= {};
  const s = b.sistema;
  if (!s) return;
  s.lineaIds = (s.lineaIds || []).length ? s.lineaIds : (s.lineaId ? [s.lineaId] : []);
  s.operadorasPorLinea ??= {};
  if (s.lineaId && s.operadoraId && !s.operadorasPorLinea[s.lineaId]) s.operadorasPorLinea[s.lineaId] = s.operadoraId;
  s.lineasAgregadas ??= [];
}

// Con empresa del sistema, el cliente es esa empresa y los servicios salen de Dataverse (por GUID).
// Si además hay un cliente configurado con Excel para esa empresa, queda vinculado para escribir su planilla.
// Sin empresa (remito nuevo como hasta ahora) se usan los clientes configurados de siempre.
const deSistema = b => Boolean(b.sistema?.empresaId);
function clienteActual(b) {
  if (deSistema(b) && estado.sistema) return clienteDelSistema(estado.sistema.catalogos, b.sistema, estado.clientes, b.servExtra || [], { soloInterna: true });
  return estado.clientes[b.cliente];
}
function elegirClienteDeEmpresa(b) {
  const clave = deSistema(b) ? clienteActual(b).claveExcel : (estado.clientes[b.cliente] ? b.cliente : Object.keys(estado.clientes)[0]);
  const marca = deSistema(b) ? `${b.sistema.empresaId}|${b.sistema.ordenId}` : '';
  if (clave !== b.cliente || marca !== (b.marcaServicios || '')) {
    b.cliente = clave; b.cant = {}; b.cantLinea = {}; b.servExtra = []; b.matServ = {}; b.extras = {}; b.marcaServicios = marca;
  }
  if (!b.tecnicoEditado) b.tecnico = nombreTecnico(clienteActual(b));
}

// Líneas del remito (con empresa del sistema)
const lineasDe = b => (deSistema(b) ? b.sistema.lineaIds || [] : []);
// Líneas de la empresa que se pueden agregar (por si la interna llegó incompleta o se trabajó para otra línea)
const lineasParaAgregar = b => lineasDeEmpresa(estado.sistema.catalogos, b.sistema.empresaId)
  .filter(l => !lineasDe(b).some(id => mismoId(id, l.id)));
const nombreDeLinea = id => nombreLinea(buscarPorId(estado.sistema.catalogos.lineas, id)) || 'Línea';

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
  const agregables = s.empresaId ? lineasParaAgregar(b) : [];
  return `${cabecera}
    <label for="f-empresa">Empresa</label>
    <select id="f-empresa" ${s.tipo === 'orden' ? 'disabled' : ''}><option value="">Elegir…</option>${opt(empresas, s.empresaId)}</select>
    ${s.empresaId ? `<span class="etiqueta">Líneas</span>
      <div class="chips-lineas">${s.lineaIds.length ? s.lineaIds.map(id => `<span class="chip">${esc(nombreDeLinea(id))}${s.lineasAgregadas.includes(id)
        ? `<button type="button" data-quitar-linea="${esc(id)}" aria-label="Quitar ${esc(nombreDeLinea(id))}">✕</button>` : ''}</span>`).join('')
        : '<span class="ayuda">Sin líneas todavía.</span>'}</div>
      ${agregables.length ? `<select id="f-agregar-linea" aria-label="Agregar línea"><option value="">+ Agregar línea…</option>${opt(agregables, '', nombreLinea)}</select>` : ''}
      <p class="ayuda" style="margin:4px 0 0">En "Servicios realizados" hay una pestaña por línea para cargar lo de cada una.</p>` : ''}`;
}

// Materiales disponibles por tipo: stock nuevo (todos) y recuperado de la empresa y la línea (sin línea, de toda la empresa)
function opcionesMateriales(b, lineaId) {
  const cat = estado.sistema.catalogos;
  const rec = materialesRecuperadosDe(cat, b.sistema.empresaId, lineaId || '');
  return { stock: materialesDeStock(cat), recuperado: rec, reutilizado: rec };
}

// ---------- Nuevo remito / corrección ----------

export async function vistaNuevo(vista) {
  if (!estado.clientes) {
    vista.innerHTML = `<div class="mensaje error">Todavía no hay clientes configurados. ${esc(estado.errorClientes || '')}</div>`;
    return;
  }
  // Cada vez que se entra a "Nuevo remito" se arranca de cero (pantalla para elegir la interna).
  // Solo se recupera lo cargado si el celular recargó la página al abrir la cámara o la galería.
  let b, tocado = false;
  if (estado.corregir) { b = estado.corregir; estado.corregir = null; }
  else {
    const volvioDeCamara = leerMarca();
    borrarMarca();
    b = volvioDeCamara ? await borrador.leer().catch(() => null) : null;
    if (!b) { await borrador.borrar().catch(() => {}); b = nuevoBorrador(); } else tocado = true;
  }
  normalizarLineas(b);
  const conSistema = sistemaActivo() && estado.sistema;
  if (!(conSistema && deSistema(b)) && !estado.clientes[b.cliente]) b.cliente = Object.keys(estado.clientes)[0];
  // Al corregir un remito cargado antes del sistema no se vuelve a la pantalla inicial: queda como remito nuevo
  if (conSistema && b.itemId && !b.sistema) aplicarOrigen(b, { tipo: 'nuevo' });

  let tGuardar;
  // Cada cambio del usuario pasa por acá: marca el remito como modificado
  hayCambios = () => tocado;
  const guardarBorrador = (cambio = true) => { if (cambio) tocado = true; clearTimeout(tGuardar); tGuardar = setTimeout(() => borrador.guardar(b).catch(() => {}), 300); };

  // Pasos con sistema: 'elegir' (interna o nuevo) -> 'internas' -> formulario. Cada paso queda en el historial,
  // así el botón Atrás del celular (y el "← Volver" de la pantalla) vuelve al paso anterior.
  // Sin Dataverse (falló la lectura) igual se pasa por la pantalla inicial: queda solo "Remito nuevo"
  const conInicio = sistemaActivo() && !b.itemId;
  let paso = b.sistema || b.origenElegido ? 'form' : 'elegir';
  const avanzar = p => { paso = p; history.pushState({ remitoPaso: p }, ''); guardarBorrador(false); pintar(); window.scrollTo(0, 0); };
  const volverA = p => {
    // Al dejar el formulario se arranca de cero: otro remito no hereda nada (ni la foto)
    if (p !== 'form' && paso === 'form' && !b.itemId) {
      clearTimeout(tGuardar);
      borrador.borrar().catch(() => {});
      b = nuevoBorrador();
      tocado = false;
    }
    paso = p; pintar(); window.scrollTo(0, 0);
  };
  const descartaCambios = () => !(paso === 'form' && tocado && !b.itemId)
    || confirm('Si volvés se borra lo cargado en este remito (también la foto). ¿Volver igual?');
  const anterior = () => (b.sistema?.tipo === 'orden' ? 'internas' : 'elegir');
  const volver = () => {
    if (b.itemId) { if (confirmarSalida()) { tocado = false; ir('mis'); } return; }
    if (history.state?.remitoPaso) history.back();
    else if (descartaCambios()) { history.replaceState({ remitoPaso: anterior() }, ''); volverA(anterior()); }
  };
  alVolverAtras = e => {
    const r = location.hash.slice(1).split('/')[0];
    if (r && r !== 'nuevo') return;
    const destino = e.state?.remitoPaso || 'elegir';
    // Atrás desde el formulario con cambios: si no confirma, se queda (y se repone el paso en el historial)
    if (destino !== 'form' && !descartaCambios()) { history.pushState({ remitoPaso: 'form' }, ''); return; }
    volverA(destino);
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
    if (!conSistema && conInicio && !b.origenElegido) {
      vistaElegirOrigen(vista, {
        sinSistema: motivoSinSistema || 'No se cargaron los datos del sistema.',
        alReintentar: () => location.reload(),
        alNuevo: () => { b.origenElegido = true; avanzar('form'); },
      });
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
      ${conInicio || b.itemId ? '<button type="button" class="volver" id="btn-volver">← Volver</button>' : ''}
      ${!conSistema && sistemaActivo() && motivoSinSistema ? `<div class="mensaje alerta">No se pudo usar el sistema, así que se carga como hasta ahora. ${esc(motivoSinSistema)}
        <div class="acciones"><button type="button" id="btn-reintentar">Reintentar</button></div></div>` : ''}
      <h1 class="titulo">${b.itemId ? 'Corregir remito' : 'Nuevo remito'}</h1>
      ${b.comentario ? `<div class="mensaje alerta"><b>Observación de la revisión:</b> ${esc(b.comentario)}</div>` : ''}
      ${conSistema ? `<section class="tarjeta" id="sec-sistema"><h2>Trabajo</h2>${htmlSistema(b)}</section>` : ''}
      <section class="tarjeta">
        <div class="tarjeta-cabecera">
          <h2>Datos del remito</h2>
          <button type="button" class="btn-camara" id="btn-foto" aria-haspopup="true" aria-expanded="false" title="Foto del remito firmado">
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/></svg>
            ${b.paginas.length ? `<span class="contador">${b.paginas.length}</span>` : ''}
          </button>
          <div class="menu-foto" id="menu-foto" hidden>
            <label class="subir-foto">📷 Sacar foto<input type="file" accept="image/*" capture="environment" id="f-camara"></label>
            <label class="subir-foto">🖼️ Elegir de la galería<input type="file" accept="image/*" multiple id="f-galeria"></label>
          </div>
        </div>
        <div class="fotos" id="fotos"></div>
        <p class="ayuda" id="ayuda-foto" style="margin:4px 0 0">${b.paginas.length ? 'Tocá la foto para recortarla o girarla.'
          : b.archivoPrevio ? 'Se mantiene la foto enviada antes. Sacá una nueva solo si hay que reemplazarla.'
          : 'Con la cámara de arriba sacá la foto del remito firmado: con buena luz y el remito entero. Se lee el número solo.'}</p>
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
        <div id="ocr" class="ayuda" aria-live="polite"></div>
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
        ${porLineas() ? `<p class="ayuda" style="margin:0 0 8px">${b.sistema.tipo === 'orden' ? 'Vienen los servicios de la interna; los demás se agregan' : 'Los servicios se agregan'} con "+ Agregar servicio". Cargá lo mismo que escribiste en el remito.</p>
        <div id="serv-lineas"></div>
        <div class="serv-km" id="serv-km">${htmlServicios(cli.items.filter(esKm), b.cant)}</div>`
        : `<p class="ayuda" style="margin:0 0 8px">Cargá lo mismo que escribiste en el remito.</p>
        <div id="servicios">${htmlServicios(cli.items, b.cant)}</div>`}
        <label for="f-obs">Observaciones (opcional)</label>
        <textarea id="f-obs" rows="2">${esc(b.observaciones)}</textarea>
      </section>

      ${conSistema && cli.sistema ? `<section class="tarjeta" id="sec-materiales" hidden>
        <h2>Materiales</h2>
        <p class="ayuda" style="margin:0 0 8px">Por cada servicio: el material nuevo de stock que se usó y el recuperado de esta empresa y línea, haya o no saldo. La app no descuenta nada; el sistema lo compara después.</p>
        <div id="materiales"></div>
      </section>` : ''}

      <div id="errores"></div>
      ${porLineas() && envioDirecto() ? '<p class="ayuda" style="text-align:center">Seguridad eléctrica: al enviarlo va directo al sistema (ALO Manager) con la foto; no pasa por la revisión de la app ni por el Excel.</p>' : ''}
      <button class="primario grande ancho" id="btn-enviar">${b.itemId ? 'Reenviar corregido' : 'Enviar remito'}</button>
      <div class="acciones"><button id="btn-descartar" class="peligro">Descartar</button></div>`;

    pintarFotos();
    conectar();
    pintarServicios();
    pintarPorServicio();
  }

  // Con empresa del sistema los servicios se cargan por línea (pestañas) y los km aparte, uno solo
  const porLineas = () => Boolean(conSistema && deSistema(b));
  const clavesLinea = () => (lineasDe(b).length ? lineasDe(b) : ['']);

  function pintarServicios() {
    const cont = $('#serv-lineas', vista);
    if (!cont) return;
    const cat = estado.sistema.catalogos;
    const lineas = lineasDe(b);
    if (lineas.length && !lineas.includes(b.lineaActiva)) b.lineaActiva = lineas[0];
    const activa = lineas.length ? b.lineaActiva : '';
    const cant = (b.cantLinea[activa] ||= {});
    const servicios = clienteActual(b).items.filter(i => !esKm(i));
    const faltaLinea = !lineas.length && lineasDeEmpresa(cat, b.sistema.empresaId).length;
    cont.innerHTML = `
      ${lineas.length ? htmlPestanasLineas(lineas.map(id => ({ id, nombre: nombreDeLinea(id) })), activa, b.cantLinea) : ''}
      ${faltaLinea ? '<p class="mensaje alerta" style="margin:0 0 8px">Agregá la línea en "Trabajo" para asignarle los servicios.</p>' : ''}
      ${lineas.length ? `<label for="f-operadora">Operadora</label>
        <select id="f-operadora"><option value="">Elegir…</option>${cat.operadoras.map(o => `<option value="${esc(o.id)}" ${mismoId(o.id, b.sistema.operadorasPorLinea[activa]) ? 'selected' : ''}>${esc(o.nombre)}</option>`).join('')}</select>` : ''}
      <div id="servicios">${servicios.length ? htmlServicios(servicios, cant) : '<p class="ayuda" style="margin:8px 0 0">Todavía no hay servicios: tocá su abreviatura abajo para agregarlos.</p>'}</div>
      ${htmlAgregarServicio(!servicios.length || b.panelServAbierto)}`;
    // Pestañas: delegado en el contenedor (se asigna, no se suma, porque el contenedor se reutiliza)
    cont.onclick = e => {
      const tab = e.target.closest('[data-linea]');
      if (!tab) return;
      b.lineaActiva = tab.dataset.linea;
      guardarBorrador(false);
      pintarServicios();
    };
    $('#f-operadora', cont)?.addEventListener('change', e => {
      b.sistema.operadorasPorLinea[activa] = e.target.value;
      sincronizarLinea(b.sistema);
      guardarBorrador();
    });
    conectarServicios($('#servicios', cont), cant, () => {
      guardarBorrador();
      // Cantidad de servicios de la pestaña
      const tab = cont.querySelector(`[data-linea="${CSS.escape(activa)}"]`);
      if (tab) {
        const n = Object.values(cant).filter(v => +v > 0).length;
        tab.querySelector('.contador')?.remove();
        if (n) tab.insertAdjacentHTML('beforeend', ` <span class="contador">${n}</span>`);
      }
      pintarPorServicio(false);
    });
    conectarAgregarServicio(cont.querySelector('.agregar-servicio'),
      () => serviciosDelSector(cat, b.sistema.sectorId).filter(x => !servicios.some(y => mismoId(y.servicioId, x.servicioId))),
      it => {
        b.panelServAbierto = true;
        if (!servicios.some(x => mismoId(x.servicioId, it.servicioId))) b.servExtra.push(it);
        const cod = servicios.find(x => mismoId(x.servicioId, it.servicioId))?.cod || it.cod;
        cant[cod] = (+cant[cod] || 0) + 1;
        guardarBorrador();
        pintarServicios();
        pintarPorServicio();
      });
  }

  // Un bloque de materiales por cada servicio cargado que los lleva, en cada línea
  function serviciosConMateriales() {
    if (!porLineas()) return [];
    const items = clienteActual(b).items;
    return clavesLinea().flatMap(l => items.filter(i => i.materiales && +b.cantLinea[l]?.[i.cod] > 0)
      .map(item => ({ linea: l, item, clave: claveMaterial(l, item.servicioId) })));
  }
  const tituloMaterial = p => `${lineasDe(b).length > 1 ? nombreDeLinea(p.linea) + ' · ' : ''}${etiquetaServicio(p.item)}`;

  // Lo que depende de los servicios cargados se redibuja solo cuando cambia ese conjunto
  let firmaServicios = '';
  function pintarPorServicio(forzar = true) {
    const firma = serviciosConMateriales().map(p => p.clave).join(',');
    if (!forzar && firma === firmaServicios) return;
    firmaServicios = firma;
    pintarMateriales();
  }

  function pintarMateriales() {
    const sec = $('#sec-materiales', vista);
    if (!sec) return;
    const pares = serviciosConMateriales();
    sec.hidden = !pares.length;
    const cont = $('#materiales', vista);
    cont.innerHTML = pares.map((p, n) => `<div class="bloque-material" data-serv="${esc(p.clave)}">
      <h3 style="margin:8px 0 4px">${esc(tituloMaterial(p))} <small>${esc(p.item.servicio)}</small></h3>
      ${htmlMateriales(b.matServ[p.clave] ||= materialesVacios(), opcionesMateriales(b, p.linea), `m${n}`)}</div>`).join('');
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
    const nuevas = [];
    for (const f of archivos) {
      try {
        const blob = await prepararFoto(f);
        const editada = await editarFoto({ blob, giro: 0, recorte: { x: 0, y: 0, w: 1, h: 1 }, mejorar: true });
        if (editada) { b.paginas.push(editada); nuevas.push(editada); }
      } catch (e) { aviso(e.message, 'error'); }
    }
    guardarBorrador();
    pintar();
    if (nuevas.length && !b.itemId) leerNumero(nuevas[0]);
  }

  // Intenta leer el N° de remito de la foto. Si el campo está vacío lo completa; si no, lo sugiere.
  async function leerNumero(pagina) {
    const caja = () => $('#ocr', vista);
    const GIROS = [0, 90, 270];
    // Barra de avance: preparar el lector (solo la primera vez) y cada intento de lectura
    const mostrar = (intento, { fase, avance }) => {
      const c = caja(); if (!c) return;
      const texto = fase === 'preparando' ? 'Preparando el lector (solo la primera vez)…'
        : intento === 0 ? 'Buscando el número del remito…' : `Probando la foto girada (${intento + 1} de ${GIROS.length})…`;
      const pct = Math.round(avance * 100);
      c.innerHTML = `<div class="ocr-progreso"><span>${texto}</span><b>${pct}%</b></div>
        <div class="barra-ocr" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>`;
    };
    mostrar(0, { fase: 'leyendo', avance: 0 });
    let leido = null;
    try {
      const { leerNumeroRemito } = await import('../../../medios/ocr.js');
      // Si la foto quedó de costado, se prueba girada
      for (const [i, giro] of GIROS.entries()) {
        leido = await leerNumeroRemito({ ...pagina, giro: ((pagina.giro || 0) + giro) % 360 }, p => mostrar(i, p));
        if (leido) break;
      }
    } catch (e) { console.warn('OCR:', e); }
    const c = caja();
    if (!c) return;
    if (!leido) { c.textContent = 'No pude leer el número en la foto; cargalo a mano.'; return; }
    const texto = `${leido.pv}-${leido.numero}`;
    const actual = normalizarRemito(b.pv, b.numero);
    if (!b.numero) {
      b.pv = leido.pv; b.numero = leido.numero; guardarBorrador();
      $('#f-pv', vista).value = b.pv; $('#f-numero', vista).value = b.numero;
      c.innerHTML = `Leí el N° <b>${esc(texto)}</b> en la foto. Revisalo antes de enviar.`;
    } else if (actual !== texto) {
      c.innerHTML = `En la foto leí <b>${esc(texto)}</b>, distinto de lo cargado. <button type="button" id="btn-usar-ocr">Usar ${esc(texto)}</button>`;
      $('#btn-usar-ocr', vista).onclick = () => {
        b.pv = leido.pv; b.numero = leido.numero; guardarBorrador();
        $('#f-pv', vista).value = b.pv; $('#f-numero', vista).value = b.numero;
        c.innerHTML = `Usando el N° <b>${esc(texto)}</b>.`;
      };
    } else c.innerHTML = `El N° coincide con la foto (<b>${esc(texto)}</b>).`;
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
    if (porLineas()) conectarServicios($('#serv-km', vista), b.cant, () => guardarBorrador());
    else conectarServicios($('#servicios', vista), b.cant, () => guardarBorrador());
    if (conSistema) {
      on('#f-empresa', 'change', e => {
        Object.assign(b.sistema, { empresaId: e.target.value, lineaIds: [], operadorasPorLinea: {}, lineasAgregadas: [] });
        sincronizarLinea(b.sistema);
        elegirClienteDeEmpresa(b); guardarBorrador(); pintar();
      });
      // Agregar una línea de la empresa: si es la primera, se lleva lo cargado sin línea
      on('#f-agregar-linea', 'change', e => {
        const l = buscarPorId(estado.sistema.catalogos.lineas, e.target.value);
        if (!l) return;
        const s = b.sistema;
        if (!s.lineaIds.length) {
          if (b.cantLinea['']) { b.cantLinea[l.id] = b.cantLinea['']; delete b.cantLinea['']; }
          for (const k of Object.keys(b.matServ)) if (k.startsWith('|')) { b.matServ[l.id + k] = b.matServ[k]; delete b.matServ[k]; }
        }
        s.lineaIds.push(l.id);
        s.lineasAgregadas.push(l.id);
        s.operadorasPorLinea[l.id] = l.operadoraId || '';
        sincronizarLinea(s);
        b.lineaActiva = l.id;
        guardarBorrador(); pintar();
      });
      vista.querySelectorAll('[data-quitar-linea]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.quitarLinea;
        const cargado = Object.values(b.cantLinea[id] || {}).some(v => +v > 0);
        if (cargado && !confirm(`¿Quitar ${nombreDeLinea(id)}? Se borran los servicios cargados en esa línea.`)) return;
        const s = b.sistema;
        s.lineaIds = s.lineaIds.filter(x => x !== id);
        s.lineasAgregadas = s.lineasAgregadas.filter(x => x !== id);
        delete s.operadorasPorLinea[id];
        delete b.cantLinea[id];
        for (const k of Object.keys(b.matServ)) if (k.startsWith(id + '|')) delete b.matServ[k];
        sincronizarLinea(s);
        guardarBorrador(); pintar();
      }));
    }
    // Cámara de la tarjeta: abre el menú Sacar foto / Elegir de la galería
    const menu = $('#menu-foto', vista);
    on('#btn-foto', 'click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; e.currentTarget.setAttribute('aria-expanded', String(!menu.hidden)); });
    vista.addEventListener('click', e => { if (menu && !menu.hidden && !e.target.closest('#menu-foto, #btn-foto')) menu.hidden = true; });
    for (const id of ['#f-camara', '#f-galeria']) {
      on(id, 'click', () => { clearTimeout(tGuardar); borrador.guardar(b).catch(() => {}); marcarCamara(); });
      on(id, 'cancel', borrarMarca);
      on(id, 'change', async e => { menu.hidden = true; await agregarFotos([...e.target.files]); borrarMarca(); });
    }
    on('#btn-enviar', 'click', enviar);
    on('#btn-descartar', 'click', async () => {
      if (!confirm('¿Descartar este remito? Se borra lo cargado.')) return;
      clearTimeout(tGuardar);
      await borrador.borrar();
      b = nuevoBorrador();
      tocado = false;
      paso = 'elegir';
      pintar();
    });
  }

  // Ítems cargados según el catálogo del cliente
  // Con líneas, cada ítem lleva la línea de su pestaña (el mismo servicio puede ir en varias); los km, uno solo
  const itemsCargados = () => {
    const items = clienteActual(b).items;
    if (!porLineas()) return itemsDeCantidades(items, b.cant);
    return [...itemsDeLineas(items, b.cantLinea, lineasDe(b)), ...itemsDeCantidades(items.filter(esKm), b.cant)];
  };

  // Remito de Seguridad eléctrica con empresa del sistema: se envía directo a la tabla intermedia
  const envioDirecto = () => porLineas() && intermediaActiva()
    && esSectorElectrico(b.sistema.sectorId || estado.sistema.usuario.sectorId, estado.sistema.ref);

  const validar = () => {
    const err = validarCarga(b, clienteActual(b), {
      hoy: hoy(), remito: normalizarRemito(b.pv, b.numero), items: itemsCargados(),
    });
    if (conSistema) {
      // Solo el remito de una interna exige empresa y línea; el remito nuevo sigue como siempre
      if (b.sistema.tipo === 'orden') {
        if (!b.sistema.empresaId) err.unshift('Elegí la empresa.');
        else if (!lineasDe(b).length && lineasDeEmpresa(estado.sistema.catalogos, b.sistema.empresaId).length) err.unshift('Agregá la línea del trabajo.');
      }
      for (const p of serviciosConMateriales()) err.push(...validarMateriales(b.matServ[p.clave]).map(e => `${tituloMaterial(p)}: ${e}`));
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
            // Seguridad eléctrica (por GUID del sector): va directo a Dataverse y la foto a SharePoint, sin Excel
            sistema: { ...b.sistema, tecnicoId: estado.sistema.usuario.id, directo: envioDirecto() },
            materiales: filasMaterialesPorClave(b.matServ, estado.sistema.catalogos, serviciosConMateriales().map(p => p.clave)),
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
      tocado = false;
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
