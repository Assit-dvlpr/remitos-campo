// Remito aprobado -> registro para la tabla intermedia de Dataverse ("Remito de campo" y su detalle),
// de donde ALO Manager lo importa. Reglas puras: sin red ni nombres de columnas de Dataverse.
import { idDv } from '../nucleo/ids.js';
import { esKm } from './catalogo.js';

// Claves de las opciones; el valor numérico de cada una en Dataverse está en CONFIG.dataverse.intermedia
export const ESTADOS_INTERMEDIA = Object.freeze({ PENDIENTE: 'pendiente', APROBADO: 'aprobado' });
export const TIPOS_DETALLE = Object.freeze({ servicio: 'servicio', stock: 'stock', recuperado: 'recuperado', reutilizado: 'reutilizado' });

const id = v => idDv(v) || null;

// Semilla del GUID fijo del remito (el mismo en Dataverse y en el nombre del archivo): reintentar no duplica
export const semillaRemito = r => `remito-campo:${r.idLocal || r.remito}`;

// Nombre del archivo en la carpeta común de remitos, igual que ALO Manager: <N° remito>_<GUID>_<archivo>
export const nombreArchivoSistema = (numero, guid, original = 'remito.pdf') =>
  `${numero}_${guid}_${original}`.replace(/[^a-z0-9._-]/gi, '_');

// Ítems con cantidad que no tienen servicio del sistema vinculado (no se pueden pasar sin GUID)
export const itemsSinServicio = r => (r.items || []).filter(i => +i.cant > 0 && !esKm(i) && !idDv(i.servicioId));

// Ítems del remito + servicio del sistema (GUID) según el catálogo del cliente
// (los kilómetros van en la cabecera, no como fila)
export const conServicios = (items, catalogoCliente) => (items || []).map(i => {
  const c = (catalogoCliente || []).find(x => String(x.cod) === String(i.cod));
  return { ...i, servicioId: c?.servicioId || i.servicioId || '', ...(c?.unidad ? { unidad: c.unidad } : {}) };
});

// estado: ESTADOS_INTERMEDIA.*; revisorId: usuario del sistema del revisor (puede faltar)
export function registroIntermedio(r, { estado, revisorId = null } = {}) {
  const s = r.sistema || {};
  const cabecera = {
    numero: r.remito,
    idLocal: r.idLocal || '',
    estado,
    fechaRemito: r.fechaRemito || null,
    ordenId: id(s.ordenId),
    solicitudId: id(s.solicitudId),
    empresaId: id(s.empresaId),
    lineaId: id(s.lineaId),
    operadoraId: id(s.operadoraId),
    sectorId: id(s.sectorId),
    tecnicoId: id(s.tecnicoId),
    acompananteId: id(s.acompananteId),
    revisorId: id(revisorId),
    kilometros: Math.round(+r.km || 0),
    observaciones: r.observaciones || '',
    // Vínculo al archivo en la carpeta común de ALO Manager (si se subió); si no, el del PDF del remito
    archivoUrl: s.archivo || r.archivoUrl || '',
    fechaRevision: r.fechaRevision || null,
    comentarioRevision: r.comentario || '',
  };
  const detalle = [
    ...(r.items || []).filter(i => +i.cant > 0 && !esKm(i)).map(i => ({
      clave: `servicio:${i.cod}`, tipo: TIPOS_DETALLE.servicio,
      descripcion: `${i.cod} ${i.servicio || ''}`.trim(), cantidad: +i.cant, unidad: '',
      servicioId: id(i.servicioId), materialStockId: null, materialRecuperadoId: null,
    })),
    ...(r.materiales || []).filter(m => TIPOS_DETALLE[m.tipo] && +m.cant > 0).map(m => ({
      clave: `${m.tipo}:${idDv(m.materialId)}`, tipo: TIPOS_DETALLE[m.tipo],
      descripcion: m.nombre || '', cantidad: +m.cant, unidad: m.unidad || '',
      servicioId: null,
      materialStockId: m.tipo === 'stock' ? id(m.materialId) : null,
      materialRecuperadoId: m.tipo === 'stock' ? null : id(m.materialId),
    })),
  ];
  return { cabecera, detalle };
}
