// Arranque: modo offline, login, usuario y clientes, y primera pantalla.
import { CONFIG, MODO_DEMO } from './nucleo/config.js';
import { ROLES } from './nucleo/constantes.js';
import { estado, recordar } from './nucleo/estado.js';
import { esc } from './nucleo/texto.js';
import { procesarCola } from './datos/cola.js';
import { verificarApi } from './datos/contrato.js';
import { sistemaActivo, cargarSistema } from './datos/sistema.js';
import { $ } from './ui/dom.js';
import { mostrar, refrescarPestanas } from './ui/navegacion.js';

const enviarPendientes = () => procesarCola(estado.api, refrescarPestanas);

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then(reg => reg.update())
    .catch(e => console.warn('Sin modo offline:', e));
  // Cuando se instala una versión nueva, recargar una vez para usarla
  const habiaControlador = !!navigator.serviceWorker.controller;
  let recargado = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (habiaControlador && !recargado) { recargado = true; location.reload(); }
  });
}

// Devuelve la fuente de datos, o null si hay que mostrar el login
async function conectarDatos() {
  if (MODO_DEMO) {
    $('#banner').innerHTML = '<div class="banner">Modo demostración: los datos quedan en este navegador y la planilla es simulada.</div>';
    return (await import('./datos/demo.js')).api;
  }
  const auth = await import('./auth/auth.js');
  let cuenta;
  try { cuenta = await auth.iniciarAuth(); } catch (e) { $('#vista').innerHTML = `<div class="mensaje error">No se pudo iniciar el login: ${esc(e.message)}</div>`; return null; }
  if (!cuenta) {
    $('#vista').innerHTML = `<div class="tarjeta login">
      <h2>Ingresar</h2><p>Usá tu cuenta corporativa de Alonger (Microsoft 365).</p>
      <button class="primario grande ancho" id="btn-ingresar">Ingresar con Microsoft</button></div>`;
    $('#btn-ingresar').onclick = () => auth.ingresar();
    return null;
  }
  estado.salir = auth.salir;
  return (await import('./datos/sharepoint/api.js')).api;
}

async function iniciar() {
  $('#version').textContent = 'v' + CONFIG.version;
  registrarServiceWorker();

  const api = await conectarDatos();
  if (!api) return;
  estado.api = verificarApi(api);

  // Usuario y clientes: si no hay señal, se usa lo último guardado en el celular
  try {
    estado.usuario = recordar('usuario', await estado.api.usuario());
  } catch (e) {
    estado.usuario = recordar('usuario');
    if (!estado.usuario) {
      $('#vista').innerHTML = `<div class="mensaje error">No se pudo identificar al usuario: ${esc(e.message)}</div>` +
        (estado.salir ? '<div class="acciones"><button id="btn-salir-error">Salir / cambiar de cuenta</button></div>' : '');
      $('#btn-salir-error')?.addEventListener('click', () => estado.salir());
      return;
    }
  }
  // Sistema principal (Dataverse): un usuario deshabilitado no entra; sin alta se trabaja como siempre
  if (sistemaActivo()) {
    try {
      estado.sistema = await cargarSistema(estado.usuario.email);
    } catch (e) {
      $('#vista').innerHTML = `<div class="mensaje error">${esc(e.message)}</div>` +
        (estado.salir ? '<div class="acciones"><button id="btn-salir-error">Salir / cambiar de cuenta</button></div>' : '');
      $('#btn-salir-error')?.addEventListener('click', () => estado.salir());
      return;
    }
    if (estado.sistema?.catalogos.avisos?.length) console.warn('Dataverse:', estado.sistema.catalogos.avisos);
  }
  try {
    estado.clientes = recordar('clientes', await estado.api.leerClientes());
  } catch (e) {
    estado.clientes = recordar('clientes');
    if (!estado.clientes) estado.errorClientes = e.message;
  }

  const sector = estado.sistema?.sector?.nombre;
  $('#usuario').innerHTML = `${esc(estado.usuario.displayName)}<br><small>${esc(estado.usuario.rol)}${sector ? ' · ' + esc(sector) : ''}</small>` +
    (estado.salir ? ` · <button id="btn-salir">Salir</button>` : '');
  $('#btn-salir')?.addEventListener('click', () => estado.salir());

  if (!estado.clientes && estado.usuario.rol === ROLES.ADMIN && !location.hash.startsWith('#config')) location.hash = 'config';
  window.addEventListener('hashchange', mostrar);
  window.addEventListener('online', enviarPendientes);
  setInterval(enviarPendientes, 60000);
  await mostrar();
  enviarPendientes();
}

iniciar();
