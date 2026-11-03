// Cliente de la Web API de Dataverse. SOLO LECTURA: no existe ninguna función que escriba.
// Lo único que se escribe es la tabla intermedia, y está aparte en escritura.js.
import { CONFIG } from '../../nucleo/config.js';
import { obtenerToken } from '../../auth/auth.js';

const API = () => `${CONFIG.dataverse.url}/api/data/v9.2`;
export const SCOPE_DATAVERSE = () => [`${CONFIG.dataverse.url}/user_impersonation`];

const ENCABEZADOS = {
  Accept: 'application/json',
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  // Trae los nombres de los lookups y las etiquetas de las opciones; 5000 filas por página
  Prefer: 'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=5000',
};

async function get(url) {
  const r = await fetch(url, {
    method: 'GET',
    headers: { ...ENCABEZADOS, Authorization: 'Bearer ' + await obtenerToken(SCOPE_DATAVERSE()) },
  });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error?.message || msg; } catch { /* sin cuerpo */ }
    const e = new Error(r.status === 403
      ? 'Tu usuario no tiene permiso de lectura en Dataverse para esta información. Pedile al administrador el rol "Remitos – Lectura".'
      : `Dataverse respondió ${r.status}: ${msg}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Metadata de la tabla: nombre del conjunto (para la URL), columna id y columna nombre. Se busca una vez.
const metadatas = {};
export function metadata(tabla) {
  metadatas[tabla] ??= get(`${API()}/EntityDefinitions(LogicalName='${tabla}')?$select=EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute`)
    .catch(e => { delete metadatas[tabla]; throw e; });
  return metadatas[tabla];
}

// Todas las filas de una tabla. consulta = '$filter=...&$orderby=...' (sin '?')
export async function leerTodo(tabla, consulta = '') {
  const m = await metadata(tabla);
  const filas = [];
  for (let url = `${API()}/${m.EntitySetName}${consulta ? '?' + consulta : ''}`; url;) {
    const r = await get(url);
    filas.push(...r.value);
    url = r['@odata.nextLink'];
  }
  return { filas, metadata: m };
}
