// Reglas sobre los catálogos del sistema principal (Dataverse): sector del usuario, órdenes internas
// que puede ver, líneas por empresa y materiales. Lógica pura: trabaja con lo que devuelve datos/dataverse.
import { mismoId } from '../nucleo/ids.js';

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
export const usuarioHabilitado = (u, ref) => Boolean(u) && valorEn(ref?.usuarioEstadosHabilitados, u.estadoValor);

// Referencias que faltan configurar (sin ellas no se puede decidir nada por ID)
export function referenciasFaltantes(ref) {
  const f = [];
  if (!ref?.sectorElectricoId) f.push('sector eléctrico');
  if (!ref?.internaEstadosCerrados?.length) f.push('estados cerrados de la interna');
  if (!ref?.usuarioEstadosHabilitados?.length) f.push('estados habilitados del usuario');
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
// Vienen con su solicitud, empresa, líneas y servicios; las más próximas primero.
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
    .sort((a, b) => (a.fechaProgramada || '9999').localeCompare(b.fechaProgramada || '9999') || String(b.numero).localeCompare(String(a.numero)));
}

// Búsqueda por número de interna, de solicitud, empresa o ubicación
export function filtrarOrdenes(ordenes, texto) {
  const t = etiqueta(texto);
  if (!t) return ordenes;
  return ordenes.filter(o => [o.numero, o.numeroALO, o.solicitud?.numero, o.solicitud?.numeroExterno, o.empresa?.nombre, o.solicitud?.ubicacion]
    .some(v => etiqueta(v).includes(t)));
}

// Materiales de stock que se ofrecen: los del sector (o sin sector asignado)
// Materiales de stock que se pueden informar: todos los activos, haya o no saldo (la app no descuenta stock;
// la comparación con el stock la hace después el sistema). Mismo criterio que ALO Manager.
export const materialesDeStock = cat => (cat.materialesStock || [])
  .slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

// Material recuperado del catálogo para una empresa y línea de origen
// Material recuperado: todos los de la empresa, haya o no saldo; primero los de la línea del remito
export const materialesRecuperadosDe = (cat, empresaId, lineaId) => (cat.materialesRecuperados || [])
  .filter(m => !empresaId || mismoId(m.empresaId, empresaId))
  .sort((a, b) => (mismoId(b.lineaId, lineaId) - mismoId(a.lineaId, lineaId)) || a.nombre.localeCompare(b.nombre, 'es'));

// Datos del sistema guardados en un remito (IDs) -> nombres para mostrar. Sin catálogos, queda vacío.
export function resumenSistema(cat, sistema) {
  if (!sistema) return null;
  const c = cat || {};
  const orden = buscarPorId(c.ordenesInternas, sistema.ordenId);
  const sol = buscarPorId(c.solicitudes, sistema.solicitudId);
  return {
    tipo: sistema.tipo,
    interna: orden ? orden.numero || orden.numeroALO || '' : '',
    solicitud: sol ? [sol.numero, sol.numeroExterno].filter(Boolean).join(' · ') : '',
    empresa: buscarPorId(c.empresas, sistema.empresaId)?.nombre || '',
    linea: nombreLinea(buscarPorId(c.lineas, sistema.lineaId)),
    operadora: buscarPorId(c.operadoras, sistema.operadoraId)?.nombre || '',
    sector: buscarPorId(c.sectores, sistema.sectorId)?.nombre || '',
  };
}

// Compañeros que se pueden elegir como acompañante: habilitados, sin el propio usuario, por nombre
export const acompanantesPosibles = (cat, usuarioId, ref) => (cat.usuarios || [])
  .filter(u => !mismoId(u.id, usuarioId) && usuarioHabilitado(u, ref))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
