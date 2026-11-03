// Escritura en la tabla intermedia contra un Dataverse simulado: solo PATCH a las dos tablas intermedias,
// lookups con @odata.bind y opciones por etiqueta.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= { search: '', origin: 'http://localhost', pathname: '/' };
globalThis.msal = {
  PublicClientApplication: class {
    async initialize() {}
    async handleRedirectPromise() { return { account: { username: 'x' } }; }
    getAllAccounts() { return []; }
    setActiveAccount() {}
    async acquireTokenSilent() { return { accessToken: 'tok' }; }
  },
  InteractionRequiredAuthError: class extends Error {},
};
const { CONFIG } = await import('../js/nucleo/config.js');
const { iniciarAuth } = await import('../js/auth/auth.js');
await iniciarAuth();
const { escribirIntermedia, estadoIntermedia, guidRemito } = await import('../js/datos/dataverse/escritura.js');
const { registroIntermedio } = await import('../js/dominio/intermedia.js');

const SETS = { cr1d0_generalremitocampo: 'cr1d0_generalremitocampos', cr1d0_generalremitocampodetalle: 'cr1d0_generalremitocampodetalles',
  cr1d0_generalordenesinternas: 'cr1d0_generalordenesinternases', cr1d0_generalusuario: 'cr1d0_generalusuarios', cr1d0_generalstockmaterial: 'cr1d0_generalstockmaterials' };
const { INTERMEDIA, DETALLE } = await import('../js/datos/dataverse/escritura.js');
// Búsquedas: todas las columnas *Id de la configuración; algunas con su tabla destino real para revisar el bind
const DESTINO = { cr1d0_solicitudinterna: 'cr1d0_generalordenesinternas', cr1d0_responsabletecnico: 'cr1d0_generalusuario',
  cr1d0_remitocampo: 'cr1d0_generalremitocampo', cr1d0_materialstock: 'cr1d0_generalstockmaterial' };
const NAV = { cr1d0_solicitudinterna: 'cr1d0_Solicitudinterna', cr1d0_responsabletecnico: 'cr1d0_Responsabletecnico',
  cr1d0_remitocampo: 'cr1d0_Remitocampo', cr1d0_materialstock: 'cr1d0_MaterialStock' };
const rel = def => Object.entries(def.columnas).filter(([k]) => k.endsWith('Id') || k === 'remito')
  .map(([, c]) => [c, NAV[c] || c, DESTINO[c] || 'cr1d0_x']);
const REL = { cr1d0_generalremitocampo: rel(INTERMEDIA), cr1d0_generalremitocampodetalle: rel(DETALLE) };
const escrituras = [];
globalThis.fetch = async (url, op) => {
  const u = decodeURIComponent(url);
  const json = b => ({ ok: true, status: 200, json: async () => b });
  if (op.method === 'PATCH') { escrituras.push({ url: u, cuerpo: JSON.parse(op.body), auth: op.headers.Authorization }); return { ok: true, status: 204 }; }
  const t = u.match(/LogicalName='([^']+)'/)?.[1];
  if (u.includes('PicklistAttributeMetadata')) throw new Error('No se buscan opciones por texto');
  return json({ EntitySetName: SETS[t], PrimaryIdAttribute: t + 'id', PrimaryNameAttribute: 'x',
    ManyToOneRelationships: (REL[t] || []).map(([a, n, e]) => ({ ReferencingAttribute: a, ReferencingEntityNavigationPropertyName: n, ReferencedEntity: e })) });
};

const r = {
  remito: '0001-00000009', idLocal: 'loc-1', fechaRemito: '2026-11-02',
  sistema: { tipo: 'orden', ordenId: 'AAA', tecnicoId: 'TTT' },
  items: [{ cod: '10', servicio: 'Aire', cant: 2 }], materiales: [{ tipo: 'stock', materialId: 'MMM', nombre: 'Cable', unidad: 'M', cant: 3 }],
};

test('escribe cabecera y detalle con PATCH, lookups y opciones resueltos', async () => {
  const id = await escribirIntermedia(r, registroIntermedio(r, { estado: 'pendiente' }));
  assert.equal(id, await guidRemito(r));
  assert.equal(escrituras.length, 3);
  assert.ok(escrituras.every(e => /cr1d0_generalremitocampo(detalle)?s\(/.test(e.url) && e.auth === 'Bearer tok'));
  const cab = escrituras[0];
  assert.ok(cab.url.endsWith(`cr1d0_generalremitocampos(${id})`));
  assert.equal(cab.cuerpo.cr1d0_estado, 159370000);
  assert.equal(cab.cuerpo['cr1d0_Solicitudinterna@odata.bind'], '/cr1d0_generalordenesinternases(aaa)');
  assert.equal(cab.cuerpo['cr1d0_Responsabletecnico@odata.bind'], '/cr1d0_generalusuarios(ttt)');
  assert.equal(cab.cuerpo.cr1d0_numeroderemito, '0001-00000009');
  assert.ok(!('cr1d0_linea' in cab.cuerpo));
  const stock = escrituras.find(e => e.cuerpo.cr1d0_tipo === 159370001);
  assert.equal(stock.cuerpo['cr1d0_Remitocampo@odata.bind'], `/cr1d0_generalremitocampos(${id})`);
  assert.equal(stock.cuerpo['cr1d0_MaterialStock@odata.bind'], '/cr1d0_generalstockmaterials(mmm)');
  assert.equal(stock.cuerpo.cr1d0_cantidad, 3);
});

test('reintentar escribe sobre los mismos registros', async () => {
  const antes = escrituras.map(e => e.url);
  escrituras.length = 0;
  await escribirIntermedia(r, registroIntermedio(r, { estado: 'pendiente' }));
  assert.deepEqual(escrituras.map(e => e.url), antes);
});

test('aprobar solo cambia la cabecera', async () => {
  escrituras.length = 0;
  await estadoIntermedia(r, { estado: 'aprobado' });
  assert.equal(escrituras.length, 1);
  assert.deepEqual(escrituras[0].cuerpo, { cr1d0_estado: 159370003 });
});

test('una opción sin valor configurado da un error claro', async () => {
  await assert.rejects(estadoIntermedia(r, { estado: 'importado' }), /Falta configurar el valor de la opción "estado: importado"/);
});

test('una búsqueda mal nombrada da un error claro', async () => {
  REL.cr1d0_generalremitocampo.pop();
  const { escribirIntermedia: e2 } = await import('../js/datos/dataverse/escritura.js?otra');
  await assert.rejects(e2(r, registroIntermedio(r, { estado: 'pendiente' })), /no hay una columna de búsqueda "cr1d0_revisor"/);
});
