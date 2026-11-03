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

// Remito del sistema -> ítems con el código del Excel del cliente (por el GUID del servicio vinculado en Configuración).
// sinVincular: servicios cargados que ese Excel no tiene vinculados.
export function itemsParaExcel(items, catalogoCliente) {
  const sinVincular = [];
  const salida = [];
  for (const i of items || []) {
    if (esKm(i)) { salida.push(i); continue; }
    const c = (catalogoCliente || []).find(x => idDv(x.servicioId) && idDv(x.servicioId) === idDv(i.servicioId));
    if (c) salida.push({ ...i, cod: c.cod, servicio: c.servicio }); else if (+i.cant > 0) sinVincular.push(i);
  }
  return { items: salida, sinVincular };
}

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
      descripcion: `${i.codigo || (i.servicioId && i.cod === i.servicioId ? '' : i.cod)} ${i.servicio || ''}`.trim(), cantidad: +i.cant, unidad: '',
      servicioId: id(i.servicioId), materialStockId: null, materialRecuperadoId: null,
    })),
    ...(r.materiales || []).filter(m => TIPOS_DETALLE[m.tipo] && +m.cant > 0).map(m => ({
      clave: `${m.tipo}:${m.servicioId ? idDv(m.servicioId) + ':' : ''}${idDv(m.materialId)}`, tipo: TIPOS_DETALLE[m.tipo],
      descripcion: m.nombre || '', cantidad: +m.cant, unidad: m.unidad || '',
      servicioId: id(m.servicioId),
      materialStockId: m.tipo === 'stock' ? id(m.materialId) : null,
      materialRecuperadoId: m.tipo === 'stock' ? null : id(m.materialId),
    })),
  ];
  return { cabecera, detalle };
}

// TODAS: el servicio se adjunta a todas las líneas del remito
export const TODAS_LAS_LINEAS = '*';

// Líneas del remito: varias si la interna tiene varias, si no la única elegida
export function lineasDelRemito(r) {
  const s = r.sistema || {};
  const varias = (s.lineaIds || []).map(idDv).filter(Boolean);
  return varias.length > 1 ? varias : [idDv(s.lineaId) || ''];
}

// Un registro por línea (mismo número de remito repetido, como en la tabla intermedia).
// Con una sola línea el sufijo es '' (mismo GUID de siempre). Cada servicio va a su línea o a todas;
// los materiales van con su servicio, y el recuperado a la línea de la que es. Los km van en la primera.
export function registrosIntermedios(r, opciones) {
  const lineas = lineasDelRemito(r);
  if (lineas.length === 1) return [{ sufijo: '', ...registroIntermedio(r, opciones) }];
  const s = r.sistema || {};
  const lineaDeItem = i => (i?.lineaId === TODAS_LAS_LINEAS ? TODAS_LAS_LINEAS : lineas.find(l => l === idDv(i?.lineaId)) || lineas[0]);
  return lineas.map((linea, n) => {
    const items = (r.items || []).filter(i => esKm(i) || [TODAS_LAS_LINEAS, linea].includes(lineaDeItem(i)));
    const materiales = (r.materiales || []).filter(m => {
      const propia = lineas.find(l => l === idDv(m.lineaId));
      if (propia) return propia === linea;
      const li = lineaDeItem((r.items || []).find(i => idDv(i.servicioId) && idDv(i.servicioId) === idDv(m.servicioId)));
      return (li === TODAS_LAS_LINEAS ? lineas[0] : li) === linea;
    });
    const reg = registroIntermedio({
      ...r, items, materiales, km: n === 0 ? r.km : 0,
      sistema: { ...s, lineaId: linea, operadoraId: Object.entries(s.operadorasPorLinea || {}).find(([l]) => idDv(l) === linea)?.[1] || s.operadoraId },
    }, opciones);
    return { sufijo: linea, ...reg };
  });
}
