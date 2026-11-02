// Lista "Remitos Campo": traducción entre un remito de la app y los campos de la lista, y búsquedas.
import { CONFIG } from '../../nucleo/config.js';
import { isoLocal } from '../../nucleo/fechas.js';
import { todasLasPaginas } from './http.js';
import { sitioId, listaId } from './sitio.js';

// Fechas sin hora: se guardan al mediodía UTC para que no cambien de día por la zona horaria
const fechaLista = iso => (iso ? iso + 'T12:00:00Z' : null);

// Remito de la app -> campos de la lista
export function aCampos(r) {
  return {
    Title: r.remito,
    Remito: r.remito,
    Cliente: r.cliente,
    Establecimiento: r.establecimiento,
    Zona: r.zona,
    FechaRemito: fechaLista(r.fechaRemito),
    FechaSolicitud: fechaLista(r.fechaSolicitud),
    Periodo: r.periodo || '',
    Tecnico: r.tecnico,
    TecnicoEmail: r.tecnicoEmail,
    // Con campos adicionales se guarda { items, extras }; sin ellos, la lista de ítems sola (formato original)
    Items: JSON.stringify(r.extras && Object.keys(r.extras).length ? { items: r.items || [], extras: r.extras } : r.items || []),
    Kilometros: +r.km || 0,
    Observaciones: r.observaciones || '',
    Estado: r.estado,
    ComentarioRevision: r.comentario || '',
    Revisor: r.revisor || '',
    FechaRevision: r.fechaRevision || null,
    ArchivoId: r.archivoId || '',
    ArchivoUrl: r.archivoUrl || '',
    FilasExcel: r.filasExcel || '',
    IdLocal: r.idLocal || '',
  };
}

// Ítem de la lista -> remito de la app
export function deItem(it) {
  const f = it.fields;
  let items = [], extras = {};
  try {
    const j = JSON.parse(f.Items || '[]');
    if (Array.isArray(j)) items = j; else ({ items = [], extras = {} } = j);
  } catch { /* vacío */ }
  return {
    id: it.id,
    remito: f.Remito || f.Title,
    cliente: f.Cliente,
    establecimiento: f.Establecimiento,
    zona: f.Zona,
    fechaRemito: isoLocal(f.FechaRemito),
    fechaSolicitud: isoLocal(f.FechaSolicitud),
    periodo: f.Periodo || '',
    tecnico: f.Tecnico,
    tecnicoEmail: f.TecnicoEmail,
    items,
    extras,
    km: f.Kilometros || 0,
    observaciones: f.Observaciones || '',
    estado: f.Estado,
    comentario: f.ComentarioRevision || '',
    revisor: f.Revisor || '',
    archivoId: f.ArchivoId || '',
    archivoUrl: f.ArchivoUrl || '',
    filasExcel: f.FilasExcel || '',
    idLocal: f.IdLocal || '',
    creado: it.createdDateTime,
  };
}

const PREFER = { Prefer: 'HonorNonIndexedQueriesWarningMayFailRandomly' };

// Ruta de la lista de remitos: /sites/<sitio>/lists/<lista>
export const rutaRemitos = async () => `/sites/${await sitioId()}/lists/${await listaId(CONFIG.listaRemitos)}`;

// Remitos cuyo campo es igual al valor
export async function remitosDonde(campo, valor) {
  const v = String(valor).replace(/'/g, "''");
  const items = await todasLasPaginas(
    `${await rutaRemitos()}/items?$expand=fields&$top=200&$filter=fields/${campo} eq '${v}'`, PREFER);
  return items.map(deItem);
}
