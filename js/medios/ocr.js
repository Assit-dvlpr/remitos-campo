// Lectura del N° de remito en la foto. Corre en el celular (Tesseract, archivos propios en vendor/tesseract):
// la imagen no sale del dispositivo. La primera vez descarga el motor (~7 MB) y queda guardado.
import { dibujarPagina } from './pdf.js';
import { numeroRemitoDeLineas } from '../dominio/ocr.js';

const url = p => new URL(p, location.href).href;
let motor = null;

function cargarScript(src) {
  return new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el lector de texto.'));
    document.head.append(s);
  });
}

async function obtenerMotor() {
  motor ??= (async () => {
    if (!window.Tesseract) await cargarScript(url('vendor/tesseract/tesseract.min.js'));
    const w = await window.Tesseract.createWorker('eng', 1, {
      workerPath: url('vendor/tesseract/worker.min.js'),
      corePath: url('vendor/tesseract/core'),
      langPath: url('vendor/tesseract/lang'),
      workerBlobURL: false,
      gzip: true,
    });
    // Solo hace falta el número: dígitos, guiones y la "N°"
    await w.setParameters({ tessedit_char_whitelist: '0123456789-–Nº°o. ' });
    return w;
  })().catch(e => { motor = null; throw e; });
  return motor;
}

// pagina = { blob, giro, recorte, mejorar } -> { pv, numero } o null si no lo encuentra
export async function leerNumeroRemito(pagina) {
  const lienzo = await dibujarPagina({ ...pagina, mejorar: true }, 1800);
  const w = await obtenerMotor();
  const { data } = await w.recognize(lienzo);
  const lineas = (data.lines || []).map(l => ({ texto: l.text, y: l.bbox?.y0 ?? 0, x: l.bbox?.x0 ?? 0 }));
  return numeroRemitoDeLineas(lineas.length ? lineas : String(data.text || '').split('\n').map((texto, y) => ({ texto, y, x: 0 })));
}
