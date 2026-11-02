// Acceso al Excel del cliente por Graph: sesiones de trabajo, tablas y rangos.
import { g } from './http.js';

export const wb = excel => `/drives/${excel.driveId}/items/${excel.itemId}/workbook`;
export const comillas = s => encodeURIComponent(String(s).replace(/'/g, "''"));

// Abre una sesión (los cambios se guardan), corre fn con sus encabezados y la cierra
export async function conSesion(excel, fn) {
  const s = await g(`${wb(excel)}/createSession`, { method: 'POST', body: { persistChanges: true } });
  const h = { 'workbook-session-id': s.id };
  try { return await fn(h); }
  finally { g(`${wb(excel)}/closeSession`, { method: 'POST', headers: h }).catch(() => {}); }
}

export async function leerRango(excel, hoja, direccion, h) {
  return (await g(`${wb(excel)}/worksheets('${comillas(hoja)}')/range(address='${direccion}')?$select=values`, { headers: h })).values;
}

export async function leerTablaEntera(excel, tabla, h) {
  return (await g(`${wb(excel)}/tables('${comillas(tabla)}')/range?$select=values`, { headers: h })).values;
}
