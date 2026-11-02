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
  };
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

  let tGuardar;
  const guardarBorrador = () => { clearTimeout(tGuardar); tGuardar = setTimeout(() => borrador.guardar(b).catch(() => {}), 300); };

  function pintar() {
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
        <label for="f-acomp">Acompañante (opcional, apellido)</label>
        <input id="f-acomp" value="${esc(b.acompanante || '')}" placeholder="Si fueron dos técnicos">
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

  const validar = () => validarCarga(b, estado.clientes[b.cliente], {
    hoy: hoy(), remito: normalizarRemito(b.pv, b.numero), items: itemsCargados(),
  });

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
