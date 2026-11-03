// Escritura en Dataverse: ÚNICAMENTE en la tabla intermedia "Remito de campo" y su detalle.
// Ninguna otra tabla del sistema se escribe desde la app; ALO Manager importa desde acá.
// Cada registro tiene un GUID fijo (derivado del remito), así reintentar actualiza en vez de duplicar.
import { CONFIG } from '../../nucleo/config.js';
import { guidEstable } from '../../nucleo/ids.js';
import { obtenerToken } from '../../auth/auth.js';
import { metadata, SCOPE_DATAVERSE } from './lectura.js';
import { semillaRemito } from '../../dominio/intermedia.js';

// Nombres lógicos de las tablas creadas en Power Apps (General Remito Campo y su detalle).
// La columna "Remito" (General Remitos) la completa ALO Manager al importar; la app no la toca.
export const INTERMEDIA = Object.freeze({
  tabla: 'cr1d0_generalremitocampo',
  columnas: {
    numero: 'cr1d0_numeroderemito', idLocal: 'cr1d0_idlocal', estado: 'cr1d0_estado', fechaRemito: 'cr1d0_fechaderemito',
    ordenId: 'cr1d0_solicitudinterna', solicitudId: 'cr1d0_solicitudgeneral', empresaId: 'cr1d0_empresa', lineaId: 'cr1d0_linea',
    operadoraId: 'cr1d0_operadora', sectorId: 'cr1d0_sector', tecnicoId: 'cr1d0_responsabletecnico',
    acompananteId: 'cr1d0_acompanante', revisorId: 'cr1d0_revisor',
    kilometros: 'cr1d0_kilometros', observaciones: 'cr1d0_observaciones', archivoUrl: 'cr1d0_archivo',
    fechaRevision: 'cr1d0_fechayhoradelarevision', comentarioRevision: 'cr1d0_comentariosdelarevision',
  },
});
export const DETALLE = Object.freeze({
  tabla: 'cr1d0_generalremitocampodetalle',
  columnas: {
    remito: 'cr1d0_remitocampo', tipo: 'cr1d0_tipo', cantidad: 'cr1d0_cantidad',
    unidad: 'cr1d0_unidad', servicioId: 'cr1d0_servicio', materialStockId: 'cr1d0_materialstock',
    materialRecuperadoId: 'cr1d0_materialrecuperado',
  },
});
const COLUMNA_FECHA = new Set(['fechaRemito']);
// Columnas de opción: clave de la app -> valor numérico configurado (nunca se busca por el texto)
const OPCIONES = { estado: 'estado', tipo: 'tipo' };

const API = () => `${CONFIG.dataverse.url}/api/data/v9.2`;
const ENCABEZADOS = { Accept: 'application/json', 'Content-Type': 'application/json; charset=utf-8', 'OData-MaxVersion': '4.0', 'OData-Version': '4.0' };

async function pedir(metodo, url, cuerpo) {
  const r = await fetch(url, {
    method: metodo,
    headers: { ...ENCABEZADOS, Authorization: 'Bearer ' + await obtenerToken(SCOPE_DATAVERSE()) },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try { msg = (await r.json()).error?.message || msg; } catch { /* sin cuerpo */ }
    throw new Error(r.status === 403
      ? 'Tu usuario no tiene permiso para escribir en la tabla intermedia de Dataverse. Pedile al administrador el rol "Remitos – Campo".'
      : `Dataverse respondió ${r.status}: ${msg}`);
  }
  return r.status === 204 ? null : r.json();
}

// Por tabla: conjunto y lookups (columna -> propiedad de navegación y tabla destino), leídos de la metadata
const esquemas = {};
function esquema(tabla) {
  esquemas[tabla] ??= (async () => {
    const def = await pedir('GET', `${API()}/EntityDefinitions(LogicalName='${tabla}')?$select=EntitySetName` +
      '&$expand=ManyToOneRelationships($select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity)');
    const lookups = Object.fromEntries(def.ManyToOneRelationships.map(x => [x.ReferencingAttribute, { nav: x.ReferencingEntityNavigationPropertyName, tabla: x.ReferencedEntity }]));
    return { set: def.EntitySetName, lookups };
  })().catch(e => { delete esquemas[tabla]; throw e; });
  return esquemas[tabla];
}

// Valores con nombres de la app -> cuerpo de la Web API (lookups con @odata.bind por GUID, opciones por valor)
async function cuerpo(def, valores) {
  const esq = await esquema(def.tabla);
  const c = {};
  for (const [clave, v] of Object.entries(valores)) {
    const col = def.columnas[clave];
    if (!col || v === undefined) continue;
    const lk = esq.lookups[col];
    // Las claves que terminan en Id son búsquedas: si la columna no lo es, el nombre está mal configurado
    if (!lk && clave.endsWith('Id')) throw new Error(`En "${def.tabla}" no hay una columna de búsqueda "${col}". Revisá los nombres en escritura.js.`);
    if (lk) {
      if (v) c[`${lk.nav}@odata.bind`] = `/${(await metadata(lk.tabla)).EntitySetName}(${v})`;
    } else if (OPCIONES[clave]) {
      const valor = CONFIG.dataverse.intermedia?.[OPCIONES[clave]]?.[v];
      if (!Number.isInteger(valor)) throw new Error(`Falta configurar el valor de la opción "${clave}: ${v}" en config.js (dataverse.intermedia).`);
      c[col] = valor;
    } else {
      c[col] = COLUMNA_FECHA.has(clave) && v ? String(v).slice(0, 10) : v;
    }
  }
  return c;
}

export const guidRemito = r => guidEstable(semillaRemito(r));

// Crea o actualiza el remito y sus filas. registro = dominio/intermedia.registroIntermedio(...)
export async function escribirIntermedia(r, registro) {
  const id = await guidRemito(r);
  const cab = await esquema(INTERMEDIA.tabla);
  await pedir('PATCH', `${API()}/${cab.set}(${id})`, await cuerpo(INTERMEDIA, registro.cabecera));
  const det = await esquema(DETALLE.tabla);
  for (const fila of registro.detalle) {
    const idFila = await guidEstable(`${id}:${fila.clave}`);
    const { clave, ...valores } = fila;
    await pedir('PATCH', `${API()}/${det.set}(${idFila})`, await cuerpo(DETALLE, { ...valores, remito: id }));
  }
  return id;
}

// Solo cambia el estado (y datos de revisión) de un remito ya escrito
export async function estadoIntermedia(r, valores) {
  const id = await guidRemito(r);
  const cab = await esquema(INTERMEDIA.tabla);
  await pedir('PATCH', `${API()}/${cab.set}(${id})`, await cuerpo(INTERMEDIA, valores));
  return id;
}
