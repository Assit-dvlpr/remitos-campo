// Configuración inicial (administrador): estructura en SharePoint, usuarios y clientes con su Excel.
import { CONFIG } from './config.js';
import { estado, $, $$, esc, aviso, recordar } from './app.js';
import { tablasDeExtras, resolverExtras } from './excel.js';

// Valores por defecto tomados de la planilla de Oldelval (se pueden cambiar en pantalla).
// Un cliente nuevo arranca con los mismos encabezados, que se ajustan a su planilla.
const POR_DEFECTO = {
  nombre: '',
  tabla: 'Tabla1',
  tablaTarifas: 'Tabla17456',
  hojaEstab: 'Control Campaña',
  rangoEstab: 'B9:C33',
  columnas: {
    fechaSolicitud: 'FECHA SOLICITUD',
    remito: 'REMITO',
    fechaRemito: 'FECHA REMITO INFORME',
    item: 'ITEM',
    cant: 'CANT',
    establecimiento: 'ESTABLECIMIENTO',
    periodo: 'PERIODO',
    zona: 'ZONA',
    responsable: 'RESPONSABLE TECNICO VISITA',
  },
};

const ETIQUETAS = {
  fechaSolicitud: 'Fecha de solicitud', remito: 'N° de remito', fechaRemito: 'Fecha del remito', item: 'Ítem',
  cant: 'Cantidad', establecimiento: 'Establecimiento', periodo: 'Período', zona: 'Zona', responsable: 'Responsable técnico',
};
// Sin estas columnas no se puede escribir un remito; las demás son opcionales
const OBLIGATORIAS = ['remito', 'item', 'cant'];

// "Pan American Energy" -> "pan-american-energy"
const claveDe = nombre => nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'cliente';

export async function vistaConfiguracion(vista) {
  const clientes = { ...(estado.clientes || {}) };

  vista.innerHTML = `
    <h1 class="titulo">Configuración</h1>
    ${estado.api.modo === 'demo' ? '<div class="mensaje alerta">Modo demostración: esta pantalla no cambia nada en SharePoint.</div>' : ''}
    ${estado.errorClientes ? `<div class="mensaje alerta">${esc(estado.errorClientes)}</div>` : ''}

    <section class="tarjeta">
      <h2>1. Listas y biblioteca en SharePoint</h2>
      <p class="ayuda" style="margin-top:0">Sitio: <b>${esc(CONFIG.sitio.host + CONFIG.sitio.ruta)}</b>. Crea "${esc(CONFIG.listaRemitos)}",
        "${esc(CONFIG.listaUsuarios)}" y la biblioteca "${esc(CONFIG.biblioteca)}" si no existen. No borra nada.</p>
      <button id="btn-estructura" class="primario">Crear o verificar</button>
      <div id="log-estructura" class="ayuda"></div>
    </section>

    <section class="tarjeta">
      <h2>2. Usuarios</h2>
      <p class="ayuda" style="margin-top:0">Quien no esté en la lista entra como técnico con su apellido.
        "Nombre en planilla" es como figura en la columna Responsable (ej. Mendoza, Valverdi).</p>
      <div class="dos-col">
        <div><label for="u-email">Email</label><input id="u-email" type="email" placeholder="nombre@alonger.com.ar"></div>
        <div><label for="u-nombre">Nombre en planilla</label><input id="u-nombre"></div>
      </div>
      <label for="u-rol">Rol</label>
      <select id="u-rol"><option>Tecnico</option><option>Revisor</option><option>Admin</option></select>
      <div class="acciones"><button id="btn-usuario">Agregar usuario</button><a id="lnk-usuarios" class="boton" target="_blank" rel="noopener" hidden>Abrir lista en SharePoint</a></div>
    </section>

    <section class="tarjeta" id="sec-cliente"></section>`;

  const log = t => { $('#log-estructura', vista).innerHTML += esc(t) + '<br>'; };

  estado.api.urlLista(CONFIG.listaUsuarios).then(u => { if (u) { const a = $('#lnk-usuarios', vista); a.href = u; a.hidden = false; } }).catch(() => {});

  $('#btn-estructura', vista).onclick = async e => {
    e.target.disabled = true;
    try {
      await estado.api.crearEstructura(log);
      // Quien arma la estructura queda como primer administrador
      if (estado.usuario.sinConfigurar) {
        await estado.api.agregarUsuario(estado.usuario.email, estado.usuario.nombre, 'Admin');
        estado.usuario.sinConfigurar = false;
        log(`${estado.usuario.email} agregado como Admin.`);
      }
      log('Listo.');
    }
    catch (err) {
      log('Error: ' + err.message);
      if (err.status === 403) log('Crear listas necesita el permiso Sites.Manage.All aprobado por un administrador, y ser propietario del sitio.');
    }
    finally { e.target.disabled = false; }
  };

  $('#btn-usuario', vista).onclick = async () => {
    const email = $('#u-email', vista).value.trim();
    const nombre = $('#u-nombre', vista).value.trim();
    if (!/^\S+@\S+$/.test(email) || !nombre) { aviso('Completá email y nombre.', 'error'); return; }
    try {
      await estado.api.agregarUsuario(email, nombre, $('#u-rol', vista).value);
      aviso('Usuario agregado.', 'ok');
      $('#u-email', vista).value = ''; $('#u-nombre', vista).value = '';
    } catch (err) { aviso(err.message, 'error'); }
  };

  pintarCliente(Object.keys(clientes)[0] || '');

  // ---------- 3. Un cliente y su Excel (clave '' = cliente nuevo) ----------
  function pintarCliente(clave) {
    const sec = $('#sec-cliente', vista);
    const actual = clientes[clave] || {};
    const c = {
      ...POR_DEFECTO,
      nombre: actual.nombre || '',
      ...(actual.lectura || {}),
      columnas: { ...POR_DEFECTO.columnas, ...(actual.excel?.columnas || {}) },
      tabla: actual.excel?.tabla || POR_DEFECTO.tabla,
    };
    let excel = actual.excel?.itemId ? actual.excel : null;
    let catalogo = actual.items ? { items: actual.items, establecimientos: actual.establecimientos || [] } : null;
    let extras = (actual.extras || []).map(d => ({ ...d }));
    const filaExtra = d => `<div class="extra dos-col" style="border-top:1px solid var(--borde);padding-top:8px;margin-top:8px">
        <div><label>Nombre</label><input data-k="etiqueta" value="${esc(d.etiqueta || '')}" placeholder="Línea"></div>
        <div><label>Columna en la planilla</label><input data-k="columna" value="${esc(d.columna || '')}" placeholder="LÍNEA"></div>
        <div><label>Lo completa</label><select data-k="quien">
          ${[['tecnico', 'Técnico'], ['revisor', 'Revisor'], ['auto', 'Automático']].map(([v, t]) => `<option value="${v}" ${d.quien === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div><label>Opciones</label><input data-k="origen" value="${esc(d.origen || '')}" placeholder="Tabla3[LINEA] o Coordinación, HSE"></div>
        <div><label><input type="checkbox" data-k="obligatorio" ${d.obligatorio ? 'checked' : ''} style="width:auto;min-height:0"> Obligatorio</label></div>
        <div><button type="button" class="peligro" data-quitar-extra>Quitar campo</button></div>
      </div>`;

    sec.innerHTML = `
      <h2>3. Clientes y su Excel</h2>
      <label for="c-elegir">Cliente</label>
      <select id="c-elegir">
        ${Object.entries(clientes).map(([k, v]) => `<option value="${esc(k)}" ${k === clave ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('')}
        <option value="" ${clave ? '' : 'selected'}>+ Nuevo cliente</option>
      </select>
      <div class="dos-col">
        <div><label for="c-nombre">Nombre del cliente</label><input id="c-nombre" value="${esc(c.nombre)}" placeholder="Ej.: Pan American Energy"></div>
        <div><label for="c-tabla">Tabla de carga</label><input id="c-tabla" value="${esc(c.tabla)}"></div>
      </div>
      <label for="c-link">Vínculo del Excel (en SharePoint/OneDrive: Compartir → Copiar vínculo)</label>
      <input id="c-link" placeholder="https://…sharepoint.com/…">
      <p class="ayuda" id="c-excel">${excel ? 'Vinculado: <b>' + esc(excel.nombre) + '</b>' : 'Sin Excel vinculado.'}</p>
      <div class="dos-col">
        <div><label for="c-tarifas">Tabla de ítems (tarifas)</label><input id="c-tarifas" value="${esc(c.tablaTarifas)}"></div>
        <div><label for="c-hoja">Hoja de establecimientos (opcional)</label><input id="c-hoja" value="${esc(c.hojaEstab)}"></div>
        <div><label for="c-rango">Rango (zona | establecimiento)</label><input id="c-rango" value="${esc(c.rangoEstab)}"></div>
      </div>
      <p class="ayuda">Sin hoja de establecimientos, el técnico escribe el lugar a mano.</p>
      <details style="margin-top:12px"><summary>Columnas de la planilla (encabezados)</summary>
        <p class="ayuda">Tal cual el encabezado en la planilla. Dejá vacía la que no exista; N° de remito, Ítem y Cantidad son obligatorias.</p>
        ${Object.keys(POR_DEFECTO.columnas).map(k => `<label for="col-${k}">${ETIQUETAS[k]}${OBLIGATORIAS.includes(k) ? ' *' : ''}</label><input id="col-${k}" value="${esc(c.columnas[k])}">`).join('')}
      </details>
      <label for="c-resp">Responsable en la planilla</label>
      <select id="c-resp">
        <option value="apellido" ${actual.responsable !== 'completo' ? 'selected' : ''}>Apellido (ej. Valverdi)</option>
        <option value="completo" ${actual.responsable === 'completo' ? 'selected' : ''}>Nombre completo (ej. Nicolas Valverdi)</option>
      </select>
      <p class="ayuda">Si fueron dos técnicos, queda "Apellido - Apellido".</p>
      <details ${extras.length ? 'open' : ''} style="margin-top:12px"><summary>Campos adicionales de este cliente (${extras.length})</summary>
        <p class="ayuda">Columnas propias de su planilla. Opciones: lista separada por comas (<b>Coordinación, HSE</b>)
          o una columna de una tabla del Excel (<b>Tabla3[LINEA]</b>). Automático: <b>Tabla3[CENTRO DE COSTO] según Línea</b>.
          Se leen al tocar "Vincular y leer catálogo".</p>
        <div id="extras">${extras.map(filaExtra).join('')}</div>
        <div class="acciones"><button type="button" id="btn-extra">+ Agregar campo</button></div>
      </details>
      <div class="acciones"><button id="btn-leer" class="primario">Vincular y leer catálogo</button></div>
      <div id="catalogo"></div>
      <div class="acciones">
        <button id="btn-guardar" class="primario" ${catalogo ? '' : 'disabled'}>Guardar cliente</button>
        ${clave ? '<button id="btn-quitar" class="peligro">Quitar cliente</button>' : ''}
      </div>`;

    const pintarCatalogo = () => {
      if (!catalogo) return;
      $('#catalogo', sec).innerHTML = `
        <p class="ayuda"><b>${catalogo.items.length}</b> ítems y <b>${catalogo.establecimientos.length}</b> establecimientos.</p>
        <div class="tabla-scroll"><table class="tabla"><tr><th>Ítem</th><th>Servicio</th><th>A planilla</th></tr>
        ${catalogo.items.map(i => `<tr><td>${esc(i.cod)}</td><td>${esc(i.servicio)}</td><td>${i.planilla === false ? 'No' : 'Sí'}</td></tr>`).join('')}</table></div>
        ${catalogo.establecimientos.length ? `<div class="tabla-scroll" style="margin-top:8px"><table class="tabla"><tr><th>Zona</th><th>Establecimiento</th></tr>
        ${catalogo.establecimientos.map(e => `<tr><td>${esc(e.zona)}</td><td>${esc(e.nombre)}</td></tr>`).join('')}</table></div>` : ''}
        ${extras.length ? `<div class="tabla-scroll" style="margin-top:8px"><table class="tabla"><tr><th>Campo</th><th>Columna</th><th>Lo completa</th><th>Valores</th></tr>
        ${extras.map(d => `<tr><td>${esc(d.etiqueta)}</td><td>${esc(d.columna)}</td><td>${{ tecnico: 'Técnico', revisor: 'Revisor', auto: 'Automático' }[d.quien]}</td>
          <td>${d.quien === 'auto' ? `${Object.keys(d.mapa || {}).length} valores según ${esc(extras.find(x => x.campo === d.segun)?.etiqueta || '')}` : esc((d.opciones || []).join(', '))}</td></tr>`).join('')}</table></div>` : ''}`;
    };
    pintarCatalogo();

    // Campos adicionales: leer lo que está en pantalla (las opciones se completan al leer el catálogo)
    const leerExtras = () => $$('#extras .extra', sec).map(div => {
      const v = k => $(`[data-k="${k}"]`, div);
      const etiqueta = v('etiqueta').value.trim();
      return {
        campo: claveDe(etiqueta), etiqueta, columna: v('columna').value.trim(), quien: v('quien').value,
        origen: v('origen').value.trim(), obligatorio: v('obligatorio').checked,
      };
    }).filter(d => d.etiqueta && d.columna);
    $('#btn-extra', sec).onclick = () => {
      $('#extras', sec).insertAdjacentHTML('beforeend', filaExtra({ quien: 'tecnico' }));
      $('#btn-guardar', sec).disabled = true; // hay que volver a leer el catálogo
    };
    $('#extras', sec).addEventListener('click', e => {
      if (!e.target.closest('[data-quitar-extra]')) return;
      e.target.closest('.extra').remove();
      $('#btn-guardar', sec).disabled = true;
    });
    $('#extras', sec).addEventListener('input', () => { $('#btn-guardar', sec).disabled = true; });

    const lectura = () => ({
      tablaTarifas: $('#c-tarifas', sec).value.trim(),
      hojaEstab: $('#c-hoja', sec).value.trim(),
      rangoEstab: $('#c-rango', sec).value.trim(),
    });

    $('#c-elegir', sec).onchange = e => pintarCliente(e.target.value);

    $('#btn-leer', sec).onclick = async e => {
      e.target.disabled = true;
      // Lo leído antes no vale para el Excel nuevo: se limpia hasta que la lectura termine bien
      catalogo = null;
      $('#catalogo', sec).innerHTML = '<p class="ayuda">Leyendo el Excel…</p>';
      $('#btn-guardar', sec).disabled = true;
      try {
        const link = $('#c-link', sec).value.trim();
        if (link) excel = await estado.api.resolverExcel(link);
        if (!excel && estado.api.modo !== 'demo') throw new Error('Pegá el vínculo del Excel.');
        $('#c-excel', sec).innerHTML = excel ? 'Vinculado: <b>' + esc(excel.nombre) + '</b>' : '';
        catalogo = await estado.api.leerCatalogo(excel, lectura());
        if (!catalogo.items.length) throw new Error('No se encontraron ítems en la tabla de tarifas.');
        // Kilómetros: si el cliente los factura como ítem (ej. "KM RECORRIDO"), se usa ese y va a la planilla;
        // si no, se agrega uno propio que solo queda registrado en el remito
        const itemKm = catalogo.items.find(i => /\bKM\b|KIL[OÓ]METR/i.test(i.servicio));
        if (itemKm) itemKm.unidad = 'km';
        else catalogo.items.push({ cod: 'KM', servicio: 'KILÓMETROS', planilla: false, unidad: 'km' });
        // Campos adicionales: opciones y valores automáticos desde las tablas del Excel
        const defs = leerExtras();
        if (defs.length) {
          const tablas = {};
          for (const t of tablasDeExtras(defs)) tablas[t] = await estado.api.leerTabla(excel, t);
          const r = resolverExtras(defs, tablas);
          if (r.error) throw new Error(r.error);
          extras = r.extras;
        } else extras = [];
        pintarCatalogo();
        $('#btn-guardar', sec).disabled = false;
      } catch (err) {
        catalogo = null;
        $('#catalogo', sec).innerHTML = `<div class="mensaje error">${esc(err.message)}</div>`;
      }
      finally { e.target.disabled = false; }
    };

    $('#btn-guardar', sec).onclick = async () => {
      const nombre = $('#c-nombre', sec).value.trim();
      if (!nombre) { aviso('Poné el nombre del cliente.', 'error'); return; }
      const columnas = Object.fromEntries(Object.keys(POR_DEFECTO.columnas).map(k => [k, $('#col-' + k, sec).value.trim()]));
      const faltan = OBLIGATORIAS.filter(k => !columnas[k]).map(k => ETIQUETAS[k]);
      if (faltan.length) { aviso('Faltan columnas obligatorias: ' + faltan.join(', '), 'error'); return; }
      // Un cliente nuevo toma una clave del nombre, sin pisar otro existente
      let k = clave;
      if (!k) { k = claveDe(nombre); for (let i = 2; clientes[k]; i++) k = claveDe(nombre) + '-' + i; }
      const nuevos = {
        ...clientes,
        [k]: {
          nombre,
          items: catalogo.items,
          establecimientos: catalogo.establecimientos,
          lectura: lectura(),
          excel: { ...(excel || {}), tabla: $('#c-tabla', sec).value.trim(), columnas },
          extras,
          responsable: $('#c-resp', sec).value,
        },
      };
      try {
        await estado.api.guardarClientes(nuevos);
        Object.assign(clientes, nuevos);
        estado.clientes = recordar('clientes', nuevos);
        estado.errorClientes = null;
        aviso(`Cliente "${nombre}" guardado.`, 'ok');
        pintarCliente(k);
      } catch (err) { aviso(err.message, 'error'); }
    };

    $('#btn-quitar', sec)?.addEventListener('click', async () => {
      if (!confirm(`¿Quitar el cliente "${actual.nombre}" de la app? No borra su Excel ni sus remitos.`)) return;
      const nuevos = { ...clientes };
      delete nuevos[clave];
      try {
        await estado.api.guardarClientes(nuevos);
        delete clientes[clave];
        estado.clientes = recordar('clientes', nuevos);
        aviso('Cliente quitado.', 'ok');
        pintarCliente(Object.keys(clientes)[0] || '');
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
}
