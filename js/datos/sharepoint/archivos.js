// Archivos en SharePoint/OneDrive: nombres y carpetas de los PDF, subir y descargar.
import { MESES } from '../../nucleo/fechas.js';
import { g } from './http.js';
import { driveId } from './sitio.js';

export const rutaArchivo = p => p.split('/').map(encodeURIComponent).join('/');
export const nombreSeguro = s => String(s).replace(/["*:<>?/\\|#%]/g, '-').replace(/\s+/g, ' ').trim();

// Orden de los PDF: <Cliente>/<Año>/<MM - Mes>/Remito <N°> - <Cliente> - <Establecimiento> - <AAAA-MM-DD>.pdf
export const carpetaMes = fecha => { const [y, m] = fecha.split('-'); return `${y}/${m} - ${MESES[+m - 1]}`; };
export const nombrePdf = (r, cliente) =>
  nombreSeguro(`Remito ${r.remito} - ${cliente} - ${r.establecimiento} - ${r.fechaRemito}`) + '.pdf';

// ruta relativa a la raíz de la biblioteca de trabajo, o a la carpeta `desde` = { drive, carpeta } si se indica
export async function subirArchivo(ruta, blob, desde) {
  const base = desde
    ? `/drives/${desde.drive}/items/${desde.carpeta}:/${rutaArchivo(ruta)}:`
    : `/drives/${await driveId()}/root:/${rutaArchivo(ruta)}:`;
  if (blob.size < 3.5 * 1024 * 1024) {
    return g(`${base}/content?@microsoft.graph.conflictBehavior=replace`, {
      method: 'PUT', body: blob, headers: { 'Content-Type': blob.type || 'application/octet-stream' },
    });
  }
  const s = await g(`${base}/createUploadSession`, {
    method: 'POST', body: { item: { '@microsoft.graph.conflictBehavior': 'replace' } },
  });
  const PARTE = 5 * 320 * 1024;
  let r;
  for (let i = 0; i < blob.size; i += PARTE) {
    const trozo = blob.slice(i, i + PARTE);
    r = await fetch(s.uploadUrl, {
      method: 'PUT', body: trozo,
      headers: { 'Content-Range': `bytes ${i}-${i + trozo.size - 1}/${blob.size}` },
    });
    if (!r.ok && r.status !== 202) throw new Error('Falló la subida del PDF (' + r.status + ').');
  }
  return r.json();
}

export async function descargar(driveIdArchivo, itemId) {
  const it = await g(`/drives/${driveIdArchivo}/items/${itemId}`);
  const r = await fetch(it['@microsoft.graph.downloadUrl']);
  if (!r.ok) throw new Error('No se pudo descargar el archivo.');
  return r.blob();
}
