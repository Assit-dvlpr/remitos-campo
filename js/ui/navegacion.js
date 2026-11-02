// Pestañas y rutas (#nuevo, #mis, #revision/<id>, #config). Cada vista se carga recién cuando se abre.
import { estado } from '../nucleo/estado.js';
import { ROLES } from '../nucleo/constantes.js';
import { esc } from '../nucleo/texto.js';
import { cola } from '../datos/cola.js';
import { $ } from './dom.js';

const { TECNICO, REVISOR, ADMIN } = ROLES;
const RUTAS = {
  nuevo: { titulo: 'Nuevo remito', roles: [TECNICO, REVISOR, ADMIN], cargar: () => import('./vistas/tecnico/nuevo.js').then(m => m.vistaNuevo) },
  mis: { titulo: 'Mis remitos', roles: [TECNICO, REVISOR, ADMIN], cargar: () => import('./vistas/tecnico/mis-remitos.js').then(m => m.vistaMisRemitos) },
  revision: { titulo: 'Revisión', roles: [REVISOR, ADMIN], cargar: () => import('./vistas/revisor/lista.js').then(m => m.vistaRevision) },
  config: { titulo: 'Configuración', roles: [ADMIN], cargar: () => import('./vistas/config/configuracion.js').then(m => m.vistaConfiguracion) },
};

export function ir(ruta) {
  if (location.hash === '#' + ruta) mostrar(); else location.hash = ruta;
}

async function pintarPestanas() {
  const nav = $('#pestanas');
  const pendientes = (await cola.todos().catch(() => [])).length;
  const actual = (location.hash.slice(1).split('/')[0]) || 'nuevo';
  nav.innerHTML = Object.entries(RUTAS)
    .filter(([, r]) => r.roles.includes(estado.usuario.rol))
    .map(([k, r]) => `<a href="#${k}" class="${k === actual ? 'activa' : ''}">${r.titulo}${k === 'mis' && pendientes ? `<span class="contador" title="Sin enviar">${pendientes}</span>` : ''}</a>`)
    .join('');
  nav.hidden = false;
}

export async function mostrar() {
  if (!estado.usuario) return;
  const [ruta, ...resto] = location.hash.slice(1).split('/');
  let r = RUTAS[ruta];
  if (!r || !r.roles.includes(estado.usuario.rol)) r = RUTAS.nuevo;
  await pintarPestanas();
  const vista = $('#vista');
  vista.className = 'vista';
  try {
    const fn = await r.cargar();
    await fn(vista, resto.join('/'));
  } catch (e) {
    console.error(e);
    vista.innerHTML = `<div class="mensaje error">${esc(e.message)}</div>`;
  }
}

export const refrescarPestanas = () => estado.usuario && pintarPestanas();
