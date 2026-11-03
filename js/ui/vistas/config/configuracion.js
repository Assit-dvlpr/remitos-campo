// Configuración inicial (administrador): estructura en SharePoint, usuarios y clientes con su Excel.
import { CONFIG, MODO_DEMO } from '../../../nucleo/config.js';
import { ROLES, LISTA_ROLES } from '../../../nucleo/constantes.js';
import { estado } from '../../../nucleo/estado.js';
import { esc } from '../../../nucleo/texto.js';
import { $, aviso } from '../../dom.js';
import { sistemaActivo } from '../../../datos/sistema.js';
import { seccionClientes } from './clientes.js';

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
      <select id="u-rol">${LISTA_ROLES.map(r => `<option>${r}</option>`).join('')}</select>
      <div class="acciones"><button id="btn-usuario">Agregar usuario</button><a id="lnk-usuarios" class="boton" target="_blank" rel="noopener" hidden>Abrir lista en SharePoint</a></div>
    </section>

    <section class="tarjeta" id="sec-cliente"></section>
    ${!MODO_DEMO && sistemaActivo() ? '<section class="tarjeta" id="sec-sistema-dv"></section>' : ''}`;

  const log = t => { $('#log-estructura', vista).innerHTML += esc(t) + '<br>'; };

  estado.api.urlLista(CONFIG.listaUsuarios).then(u => { if (u) { const a = $('#lnk-usuarios', vista); a.href = u; a.hidden = false; } }).catch(() => {});

  $('#btn-estructura', vista).onclick = async e => {
    e.target.disabled = true;
    try {
      await estado.api.crearEstructura(log);
      // Quien arma la estructura queda como primer administrador
      if (estado.usuario.sinConfigurar) {
        await estado.api.agregarUsuario(estado.usuario.email, estado.usuario.nombre, ROLES.ADMIN);
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

  seccionClientes($('#sec-cliente', vista), clientes);
  const dv = $('#sec-sistema-dv', vista);
  if (dv) import('./sistema.js').then(m => m.seccionSistema(dv));
}
