// Pantallas del técnico: cargar un remito (con foto) y ver el estado de los suyos.
import {
  estado, $, esc, hoy, fechaCorta, uid, recordar, aviso, ir, claseEstado, normalizarRemito,
  htmlServicios, conectarServicios, nombreServicio, refrescarPestanas,
} from './app.js';
import { cola, borrador, procesarCola } from './cola.js';
import { prepararFoto, armarPdf } from './pdf.js';
import { editarFoto, miniatura } from './fotos.js';
import { completarAutomaticos } from './excel.js';

// Cómo figura el técnico en la planilla de ese cliente: apellido (Valverdi) o nombre completo (Nicolas Valverdi)
const nombreTecnico = cli => (cli?.responsable === 'completo' ? estado.usuario.displayName : estado.usuario.nombre);
const apellidoDe = s => String(s || '').trim().split(/\s+/).pop();
// Si fueron dos: "Valverdi - Caro"
const responsable = b => (b.acompanante?.trim() ? `${apellidoDe(b.tecnico)} - ${b.acompanante.trim()}` : b.tecnico.trim());

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
    const est = (cli.establecimientos || []).find(e => e.nombre === b.establecimiento);
    const claves = Object.keys(estado.clientes);
    b.extras = b.extras || {};
    const extrasTecnico = (cli.extras || []).filter(d => d.quien === 'tecnico');
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
        ${extrasTecnico.map(d => `
          <label for="x-${esc(d.campo)}">${esc(d.etiqueta)}${d.obligatorio ? '' : ' (opcional)'}</label>
          <select id="x-${esc(d.campo)}" data-extra="${esc(d.campo)}">
            <option value="">Elegir…</option>
            ${(d.opciones || []).map(o => `<option ${o === b.extras[d.campo] ? 'selected' : ''}>${esc(o)}</option>`).join('')}
          </select>`).join('')}
        <p class="ayuda" id="autos">${(cli.extras || []).filter(d => d.quien === 'auto' && autos[d.campo] !== '')
          .map(d => `${esc(d.etiqueta)} <span class="chip">${esc(autos[d.campo])}</span>`).join(' ')}</p>
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
      $('#autos', vista).innerHTML = (cli.extras || []).filter(d => d.quien === 'auto' && autos[d.campo] !== '')
        .map(d => `${esc(d.etiqueta)} <span class="chip">${esc(autos[d.campo])}</span>`).join(' ');
      guardarBorrador();
    }));
    on('#f-pv', 'input', e => { b.pv = e.target.value; guardarBorrador(); });
    on('#f-numero', 'input', e => { b.numero = e.target.value; guardarBorrador(); });
    on('#f-fecha', 'change', e => { b.fechaRemito = e.target.value; guardarBorrador(); });
    on('#f-tecnico', 'input', e => { b.tecnico = e.target.value; b.tecnicoEditado = true; guardarBorrador(); });
    on('#f-obs', 'input', e => { b.observaciones = e.target.value; guardarBorrador(); });
    on('#f-estab', 'input', e => {
      b.establecimiento = e.target.value;
      const est = (estado.clientes[b.cliente].establecimientos || []).find(x => x.nombre === b.establecimiento);
      $('#zona', vista).innerHTML = est ? `Zona <span class="chip">${esc(est.zona)}</span>` : '';
      guardarBorrador();
    });
    conectarServicios($('#servicios', vista), b.cant, guardarBorrador);
    on('#f-camara', 'change', e => agregarFotos([...e.target.files]));
    on('#f-galeria', 'change', e => agregarFotos([...e.target.files]));
    on('#btn-enviar', 'click', enviar);
    on('#btn-descartar', 'click', async () => {
      if (!confirm('¿Descartar este remito? Se borra lo cargado.')) return;
      await borrador.borrar();
      b = nuevoBorrador();
      pintar();
    });
  }

  function validar() {
    const cli = estado.clientes[b.cliente];
    const err = [];
    if (!normalizarRemito(b.pv, b.numero)) err.push('Falta el número de remito.');
    if (!b.fechaRemito) err.push('Falta la fecha.');
    else if (b.fechaRemito > hoy()) err.push('La fecha no puede ser futura.');
    if (!b.establecimiento) err.push('Elegí el establecimiento.');
    if (!b.tecnico.trim()) err.push('Falta el nombre del técnico.');
    if (!cli.items.some(it => it.planilla !== false && +b.cant[it.cod] > 0)) err.push('Cargá al menos un servicio.');
    for (const d of (cli.extras || []).filter(x => x.quien === 'tecnico' && x.obligatorio)) {
      if (!b.extras?.[d.campo]) err.push(`Elegí ${d.etiqueta.toLowerCase()}.`);
    }
    if (!b.paginas.length && !b.archivoPrevio) err.push('Falta la foto del remito firmado.');
    return err;
  }

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
      const est = (cli.establecimientos || []).find(e => e.nombre === b.establecimiento);
      const items = cli.items
        .filter(it => +b.cant[it.cod] > 0)
        .map(it => ({ cod: it.cod, servicio: it.servicio, cant: +b.cant[it.cod] }));
      const kmItem = cli.items.find(it => it.unidad === 'km' || String(it.cod).toUpperCase() === 'KM');
      // Solo lo que carga el técnico y lo que se calcula de eso; lo del revisor se completa en la oficina
      const extras = completarAutomaticos(cli.extras, Object.fromEntries(
        (cli.extras || []).filter(d => d.quien === 'tecnico').map(d => [d.campo, b.extras?.[d.campo] || ''])));
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
          tecnico: responsable(b),
          tecnicoEmail: estado.usuario.email,
          items,
          extras,
          km: kmItem ? +b.cant[kmItem.cod] || 0 : 0,
          observaciones: b.observaciones.trim(),
        },
        pdf: b.paginas.length ? await armarPdf(b.paginas) : null,
      };
      await cola.guardar(entrada);
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

// ---------- Mis remitos ----------

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
          ${r.estado === 'Rechazado' && r.comentario ? `<div class="sub" style="color:var(--error)">${esc(r.comentario)}</div>` : ''}</div>
        ${r.estado === 'Rechazado'
          ? `<button data-corregir="${esc(r.id)}" class="primario">Corregir</button>`
          : `<span class="estado ${claseEstado(r.estado)}">${r.estado === 'Pendiente Excel' ? 'En revisión' : r.estado === 'Pendiente' ? 'En revisión' : esc(r.estado)}</span>`}
      </div>`).join('')}</div>`;
    cont.querySelectorAll('[data-corregir]').forEach(btn => btn.addEventListener('click', () => {
      const r = lista.find(x => x.id === btn.dataset.corregir);
      const [pv, numero] = r.remito.split('-');
      estado.corregir = {
        idLocal: r.idLocal || uid(), itemId: r.id, cliente: r.cliente, pv, numero,
        fechaRemito: r.fechaRemito, establecimiento: r.establecimiento, tecnico: r.tecnico,
        cant: Object.fromEntries(r.items.map(i => [i.cod, i.cant])),
        extras: { ...(r.extras || {}) }, acompanante: '', tecnicoEditado: true,
        observaciones: r.observaciones, paginas: [], archivoPrevio: !!r.archivoId, comentario: r.comentario,
      };
      ir('nuevo');
    }));
  } catch (e) {
    cont.innerHTML = `<div class="mensaje error">${esc(e.message)}</div>`;
  }
}
