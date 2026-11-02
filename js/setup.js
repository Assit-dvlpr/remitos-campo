// Configuración inicial (administrador): estructura en SharePoint, usuarios y clientes con su Excel.
import { CONFIG } from './config.js';
import { estado, $, esc, aviso, recordar } from './app.js';

// Valores por defecto tomados de la planilla de Oldelval (se pueden cambiar en pantalla)
const POR_DEFECTO = {
  clave: 'oldelval',
  nombre: 'Oldelval',
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

export async function vistaConfiguracion(vista) {
  const clientes = { ...(estado.clientes || {}) };
  const actual = clientes[POR_DEFECTO.clave] || {};
  const c = {
    ...POR_DEFECTO,
    nombre: actual.nombre || POR_DEFECTO.nombre,
    ...(actual.lectura || {}),
    columnas: { ...POR_DEFECTO.columnas, ...(actual.excel?.columnas || {}) },
    tabla: actual.excel?.tabla || POR_DEFECTO.tabla,
  };
  let excel = actual.excel?.itemId ? actual.excel : null;
  let catalogo = actual.items ? { items: actual.items, establecimientos: actual.establecimientos } : null;

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

    <section class="tarjeta">
      <h2>3. Cliente y su Excel</h2>
      <div class="dos-col">
        <div><label for="c-nombre">Nombre del cliente</label><input id="c-nombre" value="${esc(c.nombre)}"></div>
        <div><label for="c-tabla">Tabla de carga</label><input id="c-tabla" value="${esc(c.tabla)}"></div>
      </div>
      <label for="c-link">Vínculo del Excel (en SharePoint/OneDrive: Compartir → Copiar vínculo)</label>
      <input id="c-link" placeholder="https://…sharepoint.com/…">
      <p class="ayuda" id="c-excel">${excel ? 'Vinculado: <b>' + esc(excel.nombre) + '</b>' : 'Sin Excel vinculado.'}</p>
      <div class="dos-col">
        <div><label for="c-tarifas">Tabla de ítems (tarifas)</label><input id="c-tarifas" value="${esc(c.tablaTarifas)}"></div>
        <div><label for="c-hoja">Hoja de establecimientos</label><input id="c-hoja" value="${esc(c.hojaEstab)}"></div>
        <div><label for="c-rango">Rango (zona | establecimiento)</label><input id="c-rango" value="${esc(c.rangoEstab)}"></div>
      </div>
      <details style="margin-top:12px"><summary>Columnas de la planilla (encabezados)</summary>
        ${Object.keys(POR_DEFECTO.columnas).map(k => `<label for="col-${k}">${ETIQUETAS[k]}</label><input id="col-${k}" value="${esc(c.columnas[k])}">`).join('')}
      </details>
      <div class="acciones"><button id="btn-leer" class="primario">Vincular y leer catálogo</button></div>
      <div id="catalogo"></div>
      <div class="acciones"><button id="btn-guardar" class="primario" ${catalogo ? '' : 'disabled'}>Guardar cliente</button></div>
    </section>`;

  const log = t => { $('#log-estructura', vista).innerHTML += esc(t) + '<br>'; };

  estado.api.urlLista(CONFIG.listaUsuarios).then(u => { if (u) { const a = $('#lnk-usuarios', vista); a.href = u; a.hidden = false; } }).catch(() => {});

  function pintarCatalogo() {
    if (!catalogo) return;
    $('#catalogo', vista).innerHTML = `
      <p class="ayuda"><b>${catalogo.items.length}</b> ítems y <b>${catalogo.establecimientos.length}</b> establecimientos.</p>
      <div class="tabla-scroll"><table class="tabla"><tr><th>Ítem</th><th>Servicio</th><th>A planilla</th></tr>
      ${catalogo.items.map(i => `<tr><td>${esc(i.cod)}</td><td>${esc(i.servicio)}</td><td>${i.planilla === false ? 'No' : 'Sí'}</td></tr>`).join('')}</table></div>
      <div class="tabla-scroll" style="margin-top:8px"><table class="tabla"><tr><th>Zona</th><th>Establecimiento</th></tr>
      ${catalogo.establecimientos.map(e => `<tr><td>${esc(e.zona)}</td><td>${esc(e.nombre)}</td></tr>`).join('')}</table></div>`;
  }
  pintarCatalogo();

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

  const lectura = () => ({
    tablaTarifas: $('#c-tarifas', vista).value.trim(),
    hojaEstab: $('#c-hoja', vista).value.trim(),
    rangoEstab: $('#c-rango', vista).value.trim(),
  });

  $('#btn-leer', vista).onclick = async e => {
    e.target.disabled = true;
    try {
      const link = $('#c-link', vista).value.trim();
      if (link) excel = await estado.api.resolverExcel(link);
      if (!excel && estado.api.modo !== 'demo') throw new Error('Pegá el vínculo del Excel.');
      $('#c-excel', vista).innerHTML = excel ? 'Vinculado: <b>' + esc(excel.nombre) + '</b>' : '';
      catalogo = await estado.api.leerCatalogo(excel, lectura());
      if (!catalogo.items.some(i => String(i.cod).toUpperCase() === 'KM')) {
        catalogo.items.push({ cod: 'KM', servicio: 'KILÓMETROS', planilla: false, unidad: 'km' });
      }
      pintarCatalogo();
      $('#btn-guardar', vista).disabled = false;
    } catch (err) { aviso(err.message, 'error'); }
    finally { e.target.disabled = false; }
  };

  $('#btn-guardar', vista).onclick = async () => {
    const columnas = Object.fromEntries(Object.keys(POR_DEFECTO.columnas).map(k => [k, $('#col-' + k, vista).value.trim()]));
    clientes[POR_DEFECTO.clave] = {
      nombre: $('#c-nombre', vista).value.trim() || POR_DEFECTO.nombre,
      items: catalogo.items,
      establecimientos: catalogo.establecimientos,
      lectura: lectura(),
      excel: { ...(excel || {}), tabla: $('#c-tabla', vista).value.trim(), columnas },
    };
    try {
      await estado.api.guardarClientes(clientes);
      if (estado.api.modo !== 'demo') estado.clientes = recordar('clientes', clientes);
      estado.errorClientes = null;
      aviso('Cliente guardado.', 'ok');
    } catch (err) { aviso(err.message, 'error'); }
  };
}
