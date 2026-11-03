// Tabla intermedia de Dataverse: al aprobar, el remito queda ahí para que ALO Manager lo importe.
// En demo se guarda en el navegador. Si no está activada, no hace nada.
import { CONFIG, MODO_DEMO, MODO_PRUEBA_DV } from '../nucleo/config.js';
import { registrosIntermedios, lineasDelRemito, ESTADOS_INTERMEDIA, nombreArchivoSistema, semillaRemito } from '../dominio/intermedia.js';
import { ESTADOS } from '../nucleo/constantes.js';
import { guidEstable } from '../nucleo/ids.js';

// En modo prueba se escribe de verdad en la tabla intermedia (es lo que se quiere probar)
export const intermediaActiva = () => MODO_DEMO || MODO_PRUEBA_DV || (CONFIG.dataverse.activo && CONFIG.dataverse.escribir);

const CLAVE_DEMO = 'demo-intermedia';
const demo = {
  leer() { try { return JSON.parse(localStorage.getItem(CLAVE_DEMO) || '{}'); } catch { return {}; } },
  guardar(clave, cambio) {
    const d = demo.leer();
    d[clave] = { ...d[clave], ...cambio };
    localStorage.setItem(CLAVE_DEMO, JSON.stringify(d));
  },
};
const claveDemo = r => r.idLocal || r.remito;

// Paso 1 (antes del Excel): el remito con sus filas, en estado Pendiente
export async function publicarPendiente(r, { revisorId } = {}) {
  if (!intermediaActiva()) return null;
  const registros = registrosIntermedios(r, { estado: ESTADOS_INTERMEDIA.PENDIENTE, revisorId });
  if (MODO_DEMO) {
    for (const { sufijo, ...reg } of registros) demo.guardar(claveDemo(r) + (sufijo ? ':' + sufijo : ''), reg);
    return claveDemo(r);
  }
  const { escribirIntermedia } = await import('./dataverse/escritura.js');
  const ids = [];
  for (const reg of registros) ids.push(await escribirIntermedia(r, reg));
  return ids[0];
}

// Paso 2 (Excel escrito): pasa a Aprobado, que es lo que importa ALO Manager
export async function publicarAprobado(r) {
  if (!intermediaActiva()) return null;
  // El archivo ya quedó en el paso 1 (carpeta común de ALO Manager); acá solo cambia el estado
  const valores = { estado: ESTADOS_INTERMEDIA.APROBADO, fechaRevision: r.fechaRevision || null };
  const sufijos = lineasDelRemito(r).length > 1 ? lineasDelRemito(r) : [''];
  if (MODO_DEMO) {
    for (const s of sufijos) {
      const clave = claveDemo(r) + (s ? ':' + s : '');
      demo.guardar(clave, { cabecera: { ...demo.leer()[clave]?.cabecera, ...valores } });
    }
    return claveDemo(r);
  }
  const { estadoIntermedia } = await import('./dataverse/escritura.js');
  for (const s of sufijos) await estadoIntermedia(r, valores, s);
  return claveDemo(r);
}

// Envío directo (Seguridad eléctrica): sin revisión en la app ni Excel. Al enviar, la foto va a la carpeta común
// de remitos de ALO Manager (SharePoint) y el remito, a la tabla intermedia como Pendiente, para revisarlo en el sistema.
// guardado: el remito ya guardado en la lista de la app (con id y archivo). Si algo falla, el envío se reintenta entero
// (el GUID del remito es fijo, así que no se duplica).
export async function enviarDirecto(api, e, guardado) {
  const r = { ...guardado, ...e.datos, id: guardado.id, idLocal: e.idLocal, archivoId: guardado.archivoId };
  let sistema = { ...r.sistema };
  if (!sistema.archivo && r.archivoId) {
    sistema.archivo = await api.subirAlSistema(r, nombreArchivoSistema(r.remito, await guidEstable(semillaRemito(r))));
  }
  await publicarPendiente({ ...r, sistema });
  // En la lista de la app queda cerrado (no pasa por la revisión de la oficina) con el vínculo al archivo del sistema
  await api.actualizar({ ...r, sistema, estado: ESTADOS.APROBADO, comentario: 'Enviado al sistema (ALO Manager).', archivoUrl: sistema.archivo || r.archivoUrl });
}
