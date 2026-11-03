// Arranque: modo offline, login, usuario y clientes, y primera pantalla.
import { CONFIG, MODO_DEMO, MODO_PRUEBA_DV } from './nucleo/config.js';
import { ROLES } from './nucleo/constantes.js';
import { estado, recordar } from './nucleo/estado.js';
import { esc } from './nucleo/texto.js';
import { procesarCola } from './datos/cola.js';
import { verificarApi } from './datos/contrato.js';
import { sistemaActivo, cargarSistema } from './datos/sistema.js';
import { $ } from './ui/dom.js';
import { mostrar, refrescarPestanas } from './ui/navegacion.js';

const enviarPendientes = () => procesarCola(estado.api, refrescarPestanas);

// Avisos amarillos de arriba: cada uno con una cruz; el que se cierra no vuelve a aparecer en este celular
const ocultos = () => recordar('avisos-ocultos') || [];
function avisoArriba(clave, texto) {
  if (ocultos().includes(clave)) return;
  $('#banner').insertAdjacentHTML('beforeend', `<div class="banner" data-aviso="${esc(clave)}"><span>${esc(texto)}</span>
    <button type="button" class="cerrar-aviso" aria-label="Ocultar aviso" title="Ocultar">✕</button></div>`);
}
document.addEventListener('click', e => {
  const b = e.target.closest('.cerrar-aviso');
  if (!b) return;
  const aviso = b.closest('[data-aviso]');
  recordar('avisos-ocultos', [...new Set([...ocultos(), aviso.dataset.aviso])]);
  aviso.remove();
});

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
    avisoArriba('demo', 'Modo demostración: los datos quedan en este navegador y la planilla es simulada.');
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
  if (MODO_PRUEBA_DV) {
    // SharePoint y Excel simulados; el usuario es la cuenta real (para buscarlo en Dataverse), con todos los permisos
    avisoArriba('prueba', 'Prueba de Dataverse: catálogos y tabla intermedia reales; SharePoint y los Excel simulados en este navegador.');
    const { api: demo, CLIENTES_DEMO } = await import('./datos/demo.js');
    // El cliente demo no trae vínculos con el sistema: se eligen en Configuración con los catálogos reales
    delete CLIENTES_DEMO.demo.empresaId;
    CLIENTES_DEMO.demo.items.forEach(i => { delete i.servicioId; });
    return { ...demo, prueba: true, async usuario() {
      return { ...(await demo.usuario()), email: String(cuenta.username || '').toLowerCase(), displayName: cuenta.name || cuenta.username };
    } };
  }
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
      // En la prueba, sin referencias se entra igual para elegirlas en Configuración → Sistema
      if (MODO_PRUEBA_DV && e.codigo === 'REFERENCIAS') {
        estado.sistema = null;
        avisoArriba('referencias', `${e.message} Elegilas en Configuración → Sistema.`);
      } else {
        $('#vista').innerHTML = `<div class="mensaje error">${esc(e.message)}</div>` +
          (estado.salir ? '<div class="acciones"><button id="btn-salir-error">Salir / cambiar de cuenta</button></div>' : '');
        $('#btn-salir-error')?.addEventListener('click', () => estado.salir());
        return;
      }
    }
    if (estado.sistema?.faltan?.length) avisoArriba('referencias', `Sin referencias (${estado.sistema.faltan.join(', ')}): se muestran todas las internas. Es opcional; se eligen en Configuración → Sistema.`);
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
