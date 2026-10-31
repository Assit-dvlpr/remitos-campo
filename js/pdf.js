// Fotos del remito: reducción, giro, recorte, mejora de contraste y armado de un PDF.
// El PDF se escribe a mano (una imagen JPEG por página), sin librerías externas.

const LADO_MAX = 2000;

function cargarImagen(blob) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); mal(new Error('No se pudo leer la imagen.')); };
    img.src = url;
  });
}

function aBlob(canvas, calidad = 0.82) {
  return new Promise(ok => canvas.toBlob(ok, 'image/jpeg', calidad));
}

// Reduce la foto de la cámara (suele venir de 4000 px o más) para no llenar la memoria del celular.
export async function prepararFoto(archivo) {
  const img = await cargarImagen(archivo);
  const k = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k);
  c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return aBlob(c, 0.9);
}

// Estira los niveles de cada canal (percentiles 1 % y 99 %): papel más blanco, tinta más marcada.
function mejorar(ctx, w, h) {
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let i = 0; i < d.length; i += 4) { hist[0][d[i]]++; hist[1][d[i + 1]]++; hist[2][d[i + 2]]++; }
  const total = w * h;
  const lut = hist.map(hc => {
    let a = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { a += hc[v]; if (a > total * 0.01) { lo = v; break; } }
    a = 0;
    for (let v = 255; v >= 0; v--) { a += hc[v]; if (a > total * 0.01) { hi = v; break; } }
    const t = new Uint8ClampedArray(256);
    const r = Math.max(1, hi - lo);
    for (let v = 0; v < 256; v++) t[v] = ((v - lo) * 255) / r;
    return t;
  });
  for (let i = 0; i < d.length; i += 4) { d[i] = lut[0][d[i]]; d[i + 1] = lut[1][d[i + 1]]; d[i + 2] = lut[2][d[i + 2]]; }
  ctx.putImageData(im, 0, 0);
}

/**
 * Dibuja una página con sus ajustes.
 * pagina = { blob, giro: 0|90|180|270, recorte: {x,y,w,h} en 0..1 sobre la imagen ya girada, mejorar: bool }
 */
export async function dibujarPagina(pagina, ladoMax = LADO_MAX) {
  const img = await cargarImagen(pagina.blob);
  const giro = ((pagina.giro || 0) % 360 + 360) % 360;
  const rot = document.createElement('canvas');
  const vertical = giro === 90 || giro === 270;
  rot.width = vertical ? img.naturalHeight : img.naturalWidth;
  rot.height = vertical ? img.naturalWidth : img.naturalHeight;
  const rc = rot.getContext('2d');
  rc.translate(rot.width / 2, rot.height / 2);
  rc.rotate((giro * Math.PI) / 180);
  rc.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

  const r = pagina.recorte || { x: 0, y: 0, w: 1, h: 1 };
  const sx = Math.round(r.x * rot.width), sy = Math.round(r.y * rot.height);
  const sw = Math.max(1, Math.round(r.w * rot.width)), sh = Math.max(1, Math.round(r.h * rot.height));
  const k = Math.min(1, ladoMax / Math.max(sw, sh));
  const out = document.createElement('canvas');
  out.width = Math.round(sw * k);
  out.height = Math.round(sh * k);
  const oc = out.getContext('2d');
  oc.drawImage(rot, sx, sy, sw, sh, 0, 0, out.width, out.height);
  if (pagina.mejorar) mejorar(oc, out.width, out.height);
  return out;
}

// Arma el PDF: cada página del tamaño de la imagen, con el lado mayor a 842 pt (alto de A4).
export async function armarPdf(paginas) {
  const enc = new TextEncoder();
  const partes = [];
  let largo = 0;
  const offsets = [];
  const escribir = p => { const b = typeof p === 'string' ? enc.encode(p) : p; partes.push(b); largo += b.length; };
  const objeto = (n, cuerpo) => { offsets[n] = largo; escribir(`${n} 0 obj\n`); cuerpo(); escribir('\nendobj\n'); };

  const imgs = [];
  for (const p of paginas) {
    const c = await dibujarPagina(p, 1700);
    const jpg = new Uint8Array(await (await aBlob(c, 0.78)).arrayBuffer());
    imgs.push({ jpg, w: c.width, h: c.height });
  }

  const n = imgs.length;
  // 1 catálogo, 2 páginas, luego por página: página, contenido, imagen
  const idPag = i => 3 + i * 3;
  escribir('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  objeto(1, () => escribir('<< /Type /Catalog /Pages 2 0 R >>'));
  objeto(2, () => escribir(`<< /Type /Pages /Count ${n} /Kids [${imgs.map((_, i) => `${idPag(i)} 0 R`).join(' ')}] >>`));
  imgs.forEach((im, i) => {
    const k = 842 / Math.max(im.w, im.h);
    const W = +(im.w * k).toFixed(2), H = +(im.h * k).toFixed(2);
    const contenido = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    objeto(idPag(i), () => escribir(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] ` +
      `/Resources << /XObject << /Im0 ${idPag(i) + 2} 0 R >> >> /Contents ${idPag(i) + 1} 0 R >>`));
    objeto(idPag(i) + 1, () => { escribir(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`); });
    objeto(idPag(i) + 2, () => {
      escribir(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${im.jpg.length} >>\nstream\n`);
      escribir(im.jpg);
      escribir('\nendstream');
    });
  });
  const total = 3 + n * 3;
  const xref = largo;
  let tabla = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) tabla += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  escribir(tabla + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(partes, { type: 'application/pdf' });
}
