// Tabla intermedia de Dataverse: al aprobar, el remito queda ahí para que ALO Manager lo importe.
// En demo se guarda en el navegador. Si no está activada, no hace nada.
import { CONFIG, MODO_DEMO } from '../nucleo/config.js';
import { registroIntermedio, ESTADOS_INTERMEDIA } from '../dominio/intermedia.js';

export const intermediaActiva = () => MODO_DEMO || (CONFIG.dataverse.activo && CONFIG.dataverse.escribir);

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
  const registro = registroIntermedio(r, { estado: ESTADOS_INTERMEDIA.PENDIENTE, revisorId });
  if (MODO_DEMO) { demo.guardar(claveDemo(r), registro); return claveDemo(r); }
  const { escribirIntermedia } = await import('./dataverse/escritura.js');
  return escribirIntermedia(r, registro);
}

// Paso 2 (Excel escrito): pasa a Aprobado, que es lo que importa ALO Manager
export async function publicarAprobado(r) {
  if (!intermediaActiva()) return null;
  // El archivo ya quedó en el paso 1 (carpeta común de ALO Manager); acá solo cambia el estado
  const valores = { estado: ESTADOS_INTERMEDIA.APROBADO, fechaRevision: r.fechaRevision || null };
  if (MODO_DEMO) {
    const d = demo.leer()[claveDemo(r)];
    demo.guardar(claveDemo(r), { cabecera: { ...d?.cabecera, ...valores } });
    return claveDemo(r);
  }
  const { estadoIntermedia } = await import('./dataverse/escritura.js');
  return estadoIntermedia(r, valores);
}
