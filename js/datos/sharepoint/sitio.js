// Sitio de SharePoint, sus listas y la biblioteca de trabajo. Se buscan por nombre una sola vez y se recuerdan sus ids.
import { CONFIG } from '../../nucleo/config.js';
import { CODIGOS, errorCon } from '../../nucleo/constantes.js';
import { g, todasLasPaginas } from './http.js';

// Ids de sitio, listas y biblioteca: se buscan una vez por sesión
const cache = {};

export async function sitioId() {
  if (!cache.sitio) cache.sitio = (await g(`/sites/${CONFIG.sitio.host}:${CONFIG.sitio.ruta}`)).id;
  return cache.sitio;
}

// Compara sin mayúsculas, acentos ni espacios: SharePoint puede guardar "Remitos Escaneados" como "RemitosEscaneados"
const clave = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '').toLowerCase();
const ultimoTramo = url => decodeURIComponent(String(url || '').replace(/\/(Forms\/AllItems\.aspx|AllItems\.aspx)?$/i, '').split('/').pop());

export async function buscarLista(nombre) {
  const sid = await sitioId();
  const listas = await todasLasPaginas(`/sites/${sid}/lists?$select=id,name,displayName,webUrl`);
  cache.listasVistas = listas.map(l => l.displayName);
  const k = clave(nombre);
  return listas.find(l => [l.displayName, l.name, ultimoTramo(l.webUrl)].some(x => clave(x) === k)) || null;
}

export async function listaId(nombre) {
  if (!cache[nombre]) {
    const l = await buscarLista(nombre);
    if (!l) {
      throw errorCon(`Falta la lista "${nombre}". Un administrador debe correr la Configuración. ` +
        `(Listas del sitio: ${(cache.listasVistas || []).join(', ')})`, { codigo: CODIGOS.SIN_CONFIGURAR });
    }
    cache[nombre] = l.id;
  }
  return cache[nombre];
}

export async function driveId() {
  if (!cache.drive) {
    const sid = await sitioId();
    try {
      cache.drive = (await g(`/sites/${sid}/lists/${await listaId(CONFIG.biblioteca)}/drive?$select=id`)).id;
    } catch (e) {
      // Plan B: buscar la biblioteca entre las bibliotecas de documentos del sitio
      if (e.codigo !== CODIGOS.SIN_CONFIGURAR) throw e;
      const drives = await todasLasPaginas(`/sites/${sid}/drives?$select=id,name,webUrl`);
      const k = clave(CONFIG.biblioteca);
      const d = drives.find(x => clave(x.name) === k || clave(ultimoTramo(x.webUrl)) === k);
      if (!d) throw errorCon(e.message + ` (Bibliotecas: ${drives.map(x => x.name).join(', ')})`, { codigo: CODIGOS.SIN_CONFIGURAR });
      cache.drive = d.id;
    }
  }
  return cache.drive;
}

// Después de crear listas: olvidar todo menos el sitio
export function olvidarListas() {
  Object.keys(cache).forEach(k => k !== 'sitio' && delete cache[k]);
}
