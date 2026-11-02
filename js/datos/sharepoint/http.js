// Cliente HTTP de Microsoft Graph con la sesión del usuario: reintentos y paginado.
import { obtenerToken } from '../../auth/auth.js';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const esperar = ms => new Promise(r => setTimeout(r, ms));

export async function g(ruta, { method = 'GET', body, headers = {}, reintentos = 3, scopes } = {}) {
  const h = { Authorization: 'Bearer ' + (await obtenerToken(scopes)), ...headers };
  let cuerpo = body;
  if (body !== undefined && !(body instanceof Blob)) {
    h['Content-Type'] = 'application/json';
    cuerpo = JSON.stringify(body);
  }
  const r = await fetch(ruta.startsWith('http') ? ruta : GRAPH + ruta, { method, headers: h, body: cuerpo });
  if ([429, 503, 504].includes(r.status) && reintentos > 0) {
    await esperar(1000 * (+r.headers.get('Retry-After') || 2));
    return g(ruta, { method, body, headers, reintentos: reintentos - 1, scopes });
  }
  if (!r.ok) {
    let msg = r.statusText, codigo;
    try { const j = await r.json(); msg = j.error?.message || msg; codigo = j.error?.code; } catch { /* sin cuerpo */ }
    const e = new Error(`SharePoint respondió ${r.status}: ${msg}`);
    e.status = r.status;
    e.codigo = codigo;
    throw e;
  }
  if (r.status === 204) return null;
  return (r.headers.get('content-type') || '').includes('json') ? r.json() : r;
}

export async function todasLasPaginas(ruta, headers) {
  const out = [];
  for (let url = ruta; url;) {
    const r = await g(url, { headers });
    out.push(...r.value);
    url = r['@odata.nextLink'];
  }
  return out;
}

