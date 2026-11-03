// Reglas sobre los catálogos del sistema principal (Dataverse): sector del usuario, órdenes internas
// que puede ver, líneas por empresa y materiales. Lógica pura: trabaja con lo que devuelve datos/dataverse.
import { mismoId, idDv } from '../nucleo/ids.js';

// Solo para la búsqueda por texto que escribe el usuario (no para decidir nada)
const etiqueta = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '').toLowerCase();

// Todas las decisiones van por GUID o por el valor numérico de la opción, nunca por el texto que se muestra.
// ref = { sectorElectricoId, internaEstadosCerrados: [valores], usuarioEstadosHabilitados: [valores] }
const valorEn = (lista, v) => v !== null && v !== undefined && (lista || []).map(Number).includes(Number(v));

export const buscarPorId = (lista, id) => (lista || []).find(x => mismoId(x.id, id)) || null;

// Una interna finalizada o cancelada ya no admite remitos
export const internaCerrada = (orden, ref) => valorEn(ref?.internaEstadosCerrados, orden?.estadoValor);

// El sector eléctrico es el configurado por su GUID
export const esSectorElectrico = (sectorId, ref) => mismoId(sectorId, ref?.sectorElectricoId);

// Solo entran los usuarios cuyo estado está en la lista de habilitados (un estado nuevo no deja entrar)
// Sin lista configurada no se filtra (el acceso ya lo controlan Entra y los roles de Dataverse)
export const usuarioHabilitado = (u, ref) => Boolean(u) && (!ref?.usuarioEstadosHabilitados?.length || valorEn(ref.usuarioEstadosHabilitados, u.estadoValor));

// Referencias que faltan configurar (sin ellas no se puede decidir nada por ID)
export function referenciasFaltantes(ref) {
  const f = [];
  // El sector eléctrico y los estados de usuario ya no son obligatorios: los materiales van por servicio
  // y sin lista de estados de usuario no se filtra. Solo falta saber qué estados de la interna están cerrados.
  if (!ref?.internaEstadosCerrados?.length) f.push('estados cerrados de la interna');
  return f;
}

// Empresas activas que tienen al menos una línea activa, ordenadas por nombre
export function empresasConLineas(cat) {
  const conLinea = new Set((cat.lineas || []).map(l => l.empresaId));
  return (cat.empresas || []).filter(e => conLinea.has(e.id)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export const lineasDeEmpresa = (cat, empresaId) => (cat.lineas || [])
  .filter(l => mismoId(l.empresaId, empresaId)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

export const nombreLinea = l => (l ? [l.nombre, l.psl && `PSL ${l.psl}`].filter(Boolean).join(' · ') : '');

// Servicios de una orden interna: los vinculados a ella, o (si no tienen interna) los de su solicitud y sector
export function serviciosDeOrden(cat, orden) {
  return (cat.solicitudServicios || []).filter(s => mismoId(s.solicitudId, orden.solicitudId) &&
    (s.ordenInternaId ? mismoId(s.ordenInternaId, orden.id) : mismoId(s.sectorId, orden.sectorId)))
    .map(s => ({ ...s, servicio: buscarPorId(cat.servicios, s.servicioId) }));
}

export function lineasDeOrden(cat, orden) {
  const filas = (cat.solicitudLineas || []).filter(l => mismoId(l.ordenInternaId, orden.id) ||
    (!l.ordenInternaId && mismoId(l.solicitudId, orden.solicitudId)));
  return filas.map(f => buscarPorId(cat.lineas, f.lineaId)).filter(Boolean);
}

// Órdenes internas abiertas que el usuario puede asociar: las de su sector, o todas si verTodas (revisor/admin).
// Vienen con su solicitud, empresa, líneas y servicios; las más nuevas primero.
export function ordenesAbiertas(cat, { sectorId, verTodas = false, ref }) {
  return (cat.ordenesInternas || [])
    .filter(o => !internaCerrada(o, ref) && (verTodas || mismoId(o.sectorId, sectorId)))
    .map(o => {
      const solicitud = buscarPorId(cat.solicitudes, o.solicitudId);
      return {
        ...o, solicitud,
        empresa: buscarPorId(cat.empresas, solicitud?.empresaId),
        sector: buscarPorId(cat.sectores, o.sectorId),
        lineas: lineasDeOrden(cat, o),
        servicios: serviciosDeOrden(cat, o),
      };
    })
    .filter(o => o.solicitud)
    // Las más nuevas primero (fecha de creación en Dataverse; sin fecha, por número)
    .sort((a, b) => String(b.creado || '').localeCompare(String(a.creado || '')) || String(b.numero).localeCompare(String(a.numero), 'es', { numeric: true }));
}

// Identidad de la interna igual que en ALO Manager: "ALO-000009 - Ref. 1380"
export function identidadInterna(o, sector) {
  const alo = String(o?.numeroALO || '').trim();
  const ref = String(o?.numero || '').trim();
  const pendiente = ref.startsWith('ALO-PENDIENTE-');
  if (!alo) return pendiente ? 'Número pendiente' : ref;
  if (!ref || pendiente) return alo;
  const codigo = String(sector?.codigo || '').trim();
  if (['google sheets', 'sheets', 'sheet'].includes(String(o.origenNumeracion || '').trim().toLowerCase()) && /^[a-z0-9]+$/i.test(codigo)) {
    return `${alo}_ext${codigo}-${ref}`;
  }
  return `${alo} - Ref. ${ref}`;
}

// Búsqueda por número de interna, de solicitud, empresa o ubicación
export function filtrarOrdenes(ordenes, texto) {
  const t = etiqueta(texto);
  if (!t) return ordenes;
  return ordenes.filter(o => [o.numero, o.numeroALO, o.solicitud?.numero, o.solicitud?.numeroExterno, o.empresa?.nombre, o.locacion, o.solicitud?.locacion, ...(o.servicios || []).map(s => s.servicio?.codigoInterno || s.servicio?.codigo)]
    .some(v => etiqueta(v).includes(t)));
}

// Materiales de stock que se ofrecen: los del sector (o sin sector asignado)
// Materiales de stock que se pueden informar: todos los activos, haya o no saldo (la app no descuenta stock;
// la comparación con el stock la hace después el sistema). Mismo criterio que ALO Manager.
export const materialesDeStock = cat => (cat.materialesStock || [])
  .slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

// Saldo de un material recuperado en una empresa y línea: suma de sus movimientos (solo para mostrar)
export const saldoRecuperado = (cat, materialId, empresaId, lineaId) => Math.round((cat.movimientosRecuperado || [])
  .filter(x => mismoId(x.materialId, materialId) && mismoId(x.empresaId, empresaId) && mismoId(x.lineaId, lineaId))
  .reduce((t, x) => t + (+x.cantidad || 0), 0) * 100) / 100;

// Material recuperado: cada empresa y línea tiene el suyo (como en ALO Manager). Se muestran todos, haya o no saldo,
// con el saldo al lado. Sin línea elegida, los de toda la empresa.
export const materialesRecuperadosDe = (cat, empresaId, lineaId) => (cat.materialesRecuperados || [])
  .filter(m => (!empresaId || mismoId(m.empresaId, empresaId)) && (!lineaId || mismoId(m.lineaId, lineaId)))
  .map(m => ({ ...m, saldo: saldoRecuperado(cat, m.id, m.empresaId, m.lineaId) }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

// Código interno normalizado, con los mismos alias que ALO Manager
const ALIAS_CODIGO = { mon: 'MONT', mont: 'MONT', montaje: 'MONT', dmon: 'DMONT', dmont: 'DMONT', desm: 'DMONT', desmontaje: 'DMONT' };
export const codigoServicio = s => {
  const c = etiqueta(s?.codigoInterno || s?.codigo);
  return ALIAS_CODIGO[c] || c.toUpperCase();
};
// Montaje y Desmontaje llevan materiales; los demás, si tienen "Requiere recuento". Mismo criterio que ALO Manager.
export function llevaMateriales(s) {
  if (!s || s.recuento === false) return false;
  return ['MONT', 'DMONT'].includes(codigoServicio(s)) || s.recuento === true;
}

// Datos del sistema guardados en un remito (IDs) -> nombres para mostrar. Sin catálogos, queda vacío.
export function resumenSistema(cat, sistema) {
  if (!sistema) return null;
  const c = cat || {};
  const orden = buscarPorId(c.ordenesInternas, sistema.ordenId);
  const sol = buscarPorId(c.solicitudes, sistema.solicitudId);
  return {
    tipo: sistema.tipo,
    interna: orden ? identidadInterna(orden, buscarPorId(c.sectores, orden.sectorId)) : '',
    solicitud: sol ? [sol.numero, sol.numeroExterno].filter(Boolean).join(' · ') : '',
    empresa: buscarPorId(c.empresas, sistema.empresaId)?.nombre || '',
    linea: (sistema.lineaIds?.length > 1 ? sistema.lineaIds : [sistema.lineaId]).map(id => nombreLinea(buscarPorId(c.lineas, id))).filter(Boolean).join(' · '),
    operadora: buscarPorId(c.operadoras, sistema.operadoraId)?.nombre || '',
    sector: buscarPorId(c.sectores, sistema.sectorId)?.nombre || '',
  };
}

// Compañeros que se pueden elegir como acompañante: habilitados, sin el propio usuario, por nombre
export const acompanantesPosibles = (cat, usuarioId, ref) => (cat.usuarios || [])
  .filter(u => !mismoId(u.id, usuarioId) && usuarioHabilitado(u, ref))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

// ---------- Remito del sistema: cliente = empresa de Dataverse, ítems = servicios de Dataverse ----------

export const ITEM_KM = Object.freeze({ cod: 'KM', servicio: 'KILÓMETROS', planilla: false, unidad: 'km' });
const porNombre = (a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es');

// Servicios que se ofrecen: los de la interna; si no tiene, los del sector; si el sector no tiene, todos
export function serviciosParaRemito(cat, sistema) {
  const c = cat || {};
  const orden = buscarPorId(c.ordenesInternas, sistema?.ordenId);
  const deOrden = orden ? serviciosDeOrden(c, orden).map(x => x.servicio).filter(Boolean) : [];
  if (deOrden.length) return deOrden.slice().sort(porNombre);
  const activos = (c.servicios || []).filter(x => x.activo !== false);
  const deSector = activos.filter(x => mismoId(x.sectorId, sistema?.sectorId));
  return (deSector.length ? deSector : activos).slice().sort(porNombre);
}

// Cliente "virtual" de un remito del sistema. Los ítems se identifican por el GUID del servicio.
// Si hay un cliente configurado con Excel para esa empresa, se usan sus campos y establecimientos,
// y al aprobar también se escribe su Excel. cargados: ítems ya cargados (no se pierden si salen del catálogo).
export function clienteDelSistema(cat, sistema, clientes, cargados = []) {
  const empresa = buscarPorId(cat?.empresas, sistema?.empresaId);
  const claveExcel = Object.keys(clientes || {}).find(k => mismoId(clientes[k].empresaId, sistema?.empresaId)) || '';
  const conExcel = claveExcel ? clientes[claveExcel] : null;
  const items = serviciosParaRemito(cat, sistema).map(x => ({
    cod: idDv(x.id), codigo: x.codigoInterno || x.codigo || '', servicio: x.nombre, servicioId: idDv(x.id), materiales: llevaMateriales(x),
  }));
  for (const i of cargados || []) {
    if (i.servicioId && !items.some(x => mismoId(x.servicioId, i.servicioId))) {
      items.push({ cod: i.cod, codigo: i.codigo || '', servicio: i.servicio, servicioId: idDv(i.servicioId), materiales: Boolean(i.materiales) });
    }
  }
  return {
    sistema: true, claveExcel, nombre: empresa?.nombre || conExcel?.nombre || 'Empresa del sistema',
    items: [...items, ITEM_KM], extras: conExcel?.extras || [], establecimientos: conExcel?.establecimientos || [],
    responsable: conExcel?.responsable, excel: conExcel?.excel || null,
  };
}
