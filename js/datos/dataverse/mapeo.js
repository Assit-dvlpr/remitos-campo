// Registros de Dataverse -> objetos de la app. Lógica pura: recibe las filas tal como las devuelve la Web API
// (con anotaciones de valor formateado) y la metadata { PrimaryIdAttribute, PrimaryNameAttribute } de cada tabla.
import { idDv } from '../../nucleo/ids.js';

const FORMATEADO = '@OData.Community.Display.V1.FormattedValue';

// Lookup: Dataverse devuelve _<columna>_value (las mayúsculas varían según cómo se creó la columna)
export function lookupId(fila, columna) {
  const k = `_${columna}_value`.toLowerCase();
  const m = Object.keys(fila || {}).find(x => x.toLowerCase() === k);
  return m ? idDv(fila[m]) : '';
}
export function lookupNombre(fila, columna) {
  const k = `_${columna}_value${FORMATEADO}`.toLowerCase();
  const m = Object.keys(fila || {}).find(x => x.toLowerCase() === k);
  return m ? fila[m] : '';
}
// Valor formateado (opciones, fechas) o el valor crudo
export const formateado = (fila, columna, siNo = '') => fila?.[columna + FORMATEADO] ?? fila?.[columna] ?? siNo;
// Primer valor presente entre columnas posibles
export const valor = (fila, ...cols) => { for (const c of cols) if (fila?.[c] !== undefined && fila[c] !== null) return fila[c]; return ''; };
const activo = f => f.cr1d0_activo !== false && f.statecode !== 1;


export const MAPEOS = {
  empresas: (f, m) => ({ id: idDv(f[m.PrimaryIdAttribute]), nombre: f[m.PrimaryNameAttribute] || 'Sin nombre', abreviatura: f.cr1d0_abreviatura || '', activo: activo(f) }),
  operadoras: f => ({ id: idDv(f.cr1d0_generaloperadoraid), nombre: f.cr1d0_nombreoperadora || 'Sin nombre', abreviatura: f.cr1d0_abreviatura || '', activo: activo(f) }),
  yacimientos: f => ({ id: idDv(f.cr1d0_generalyacimientoid), nombre: f.cr1d0_nombreyacimiento || 'Sin nombre', operadoraId: lookupId(f, 'cr1d0_generaloperadora'), activo: activo(f) }),
  lineas: f => ({
    id: idDv(f.cr1d0_generallineasid), nombre: f.cr1d0_nombrelinea || 'Sin nombre', abreviatura: f.cr1d0_abreviatura || '', psl: f.cr1d0_psl || '',
    empresaId: lookupId(f, 'cr1d0_empresa'), operadoraId: lookupId(f, 'cr1d0_generaloperadora'), yacimientoId: lookupId(f, 'cr1d0_generalyacimiento'), activo: activo(f),
  }),
  usuarios: f => ({
    id: idDv(f.cr1d0_generalusuarioid), email: String(f.cr1d0_email || '').trim().toLowerCase(), nombre: f.cr1d0_nombrecompleto || f.cr1d0_email || '',
    rolId: lookupId(f, 'cr1d0_rol'), rol: formateado(f, '_cr1d0_rol_value') || '',
    estadoValor: f.cr1d0_estado ?? null, estado: formateado(f, 'cr1d0_estado') || '', sectorId: lookupId(f, 'cr1d0_sector'),
    grupo: formateado(f, 'cr1d0_grupodetrabajo') || '',
  }),
  sectores: f => ({ id: idDv(f.cr1d0_generalsectoresid), nombre: f.cr1d0_nombre || '', codigo: f.cr1d0_codigo || '', activo: activo(f) }),
  servicios: f => ({
    id: idDv(f.cr1d0_generalservicioid), codigo: f.cr1d0_codigo || '', nombre: f.cr1d0_nombre || '', sectorId: lookupId(f, 'cr1d0_sector'),
    // Mismas columnas que lee ALO Manager: código interno (MONT, DMONT…) y "Requiere recuento"
    codigoInterno: valor(f, 'cr1d0_Codigointernoexterno', 'cr1d0_CodigoInternoExterno', 'cr1d0_codigointernoexterno', 'cr1d0_CodigoInterno',
      'cr1d0_Codigointerno', 'cr1d0_codigointerno', 'cr1d0_codigoInterno', 'cr1d0_CdigoInterno', 'cr1d0_Cdigointerno', 'cr1d0_cdigointerno'),
    recuento: f.cr1d0_recuento ?? null, activo: activo(f),
  }),
  solicitudes: f => ({
    id: idDv(f.cr1d0_generalsolicitudid), numero: f.cr1d0_nrosolicitudsistema || '', numeroExterno: f.cr1d0_nrosolicitudexterno || '',
    empresaId: lookupId(f, 'cr1d0_clienteempresaid'), empresa: lookupNombre(f, 'cr1d0_clienteempresaid'),
    ubicacion: f.cr1d0_ubicacion || '', estado: formateado(f, 'cr1d0_estadogeneral'), activo: activo(f),
  }),
  solicitudServicios: f => ({
    id: idDv(f.cr1d0_generalsolicitudserviciosid), solicitudId: lookupId(f, 'cr1d0_solicitud'), servicioId: lookupId(f, 'cr1d0_servicio'),
    sectorId: lookupId(f, 'cr1d0_sector'), ordenInternaId: lookupId(f, 'cr1d0_ordeninterna'), activo: activo(f),
  }),
  solicitudLineas: f => ({
    id: idDv(f.cr1d0_generalsolicitudlineaid), lineaId: lookupId(f, 'cr1d0_lineacatalogo'), ordenInternaId: lookupId(f, 'cr1d0_ordeninterna'),
    solicitudId: lookupId(f, 'cr1d0_solicitud'), activo: activo(f),
  }),
  ordenesInternas: f => ({
    id: idDv(f.cr1d0_generalordenesinternasid), numero: f.cr1d0_numeroordeninterna || '', numeroALO: f.cr1d0_numeroalo || '',
    solicitudId: lookupId(f, 'cr1d0_solicitudgeneral'), sectorId: lookupId(f, 'cr1d0_sector'),
    estadoValor: f.cr1d0_estadooperativo ?? null, estado: formateado(f, 'cr1d0_estadooperativo', 'Pendiente'), fechaProgramada: String(f.cr1d0_fechaprogramada || '').slice(0, 10),
    detalle: f.cr1d0_detalle || '', activo: activo(f),
  }),
  materialesStock: (f, m) => ({
    id: idDv(f.cr1d0_generalstockmaterialid), nombre: valor(f, 'cr1d0_nombredelmaterial', 'cr1d0_Nombredelmaterial', m?.PrimaryNameAttribute, 'cr1d0_nombre'),
    codigo: valor(f, 'cr1d0_codigo', 'cr1d0_Codigo'), unidad: valor(f, 'cr1d0_unidad', 'cr1d0_Unidad') || 'UN',
    sectorId: lookupId(f, 'cr1d0_generalsectores') || lookupId(f, 'cr1d0_sector'), activo: activo(f),
  }),
  // Movimientos de material recuperado (para mostrar el saldo por empresa y línea; la app no los escribe)
  movimientosRecuperado: f => ({
    id: idDv(f.cr1d0_generalcablerecuperadomovimientoid), materialId: lookupId(f, 'cr1d0_materialreferencia'),
    empresaId: lookupId(f, 'cr1d0_empresa'), lineaId: lookupId(f, 'cr1d0_linea'), cantidad: Number(f.cr1d0_metros) || 0, activo: activo(f),
  }),
  materialesRecuperados: (f, m) => ({
    id: idDv(f[m.PrimaryIdAttribute]), nombre: f[m.PrimaryNameAttribute] || '', unidad: f.cr1d0_unidad || '',
    empresaId: lookupId(f, 'cr1d0_clienteempresa'), lineaId: lookupId(f, 'cr1d0_lineadeorigen'), activo: activo(f),
  }),
};

// Mapea una tabla completa; las filas inactivas se descartan salvo que se pidan
export const mapear = (nombre, filas, metadata, { inactivos = false } = {}) =>
  filas.map(f => MAPEOS[nombre](f, metadata)).filter(x => inactivos || x.activo !== false);
