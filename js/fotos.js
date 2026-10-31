// Editor de una foto del remito: girar, recortar (arrastrando las esquinas) y mejorar contraste.
import { $ } from './app.js';
import { dibujarPagina } from './pdf.js';

// Devuelve la página editada, null si se eliminó, o la original si se cancela.
export function editarFoto(pagina) {
  const p = { giro: 0, recorte: { x: 0, y: 0, w: 1, h: 1 }, mejorar: true, ...pagina };
  const modal = $('#modal');
  modal.innerHTML = `
    <div class="editor-lienzo"><canvas></canvas></div>
    <div class="editor-barra">
      <button type="button" data-a="girar">↻ Girar</button>
      <button type="button" data-a="mejorar">Mejorar</button>
      <button type="button" data-a="todo">Sin recorte</button>
      <button type="button" data-a="eliminar">Eliminar</button>
      <button type="button" data-a="cancelar">Cancelar</button>
      <button type="button" data-a="listo" class="primario">Listo</button>
    </div>`;
  modal.hidden = false;
  const lienzo = $('canvas', modal);
  const ctx = lienzo.getContext('2d');
  let base = null;

  async function cargarBase() {
    // Imagen girada y sin recortar, a tamaño de pantalla
    base = await dibujarPagina({ ...p, recorte: null, mejorar: p.mejorar }, 1200);
    lienzo.width = base.width;
    lienzo.height = base.height;
    pintar();
  }

  function pintar() {
    ctx.drawImage(base, 0, 0);
    const r = p.recorte, W = lienzo.width, H = lienzo.height;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.rect(r.x * W, r.y * H, r.w * W, r.h * H);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#00b0f0';
    ctx.lineWidth = Math.max(2, W / 300);
    ctx.strokeRect(r.x * W, r.y * H, r.w * W, r.h * H);
    const t = Math.max(14, W / 40);
    ctx.fillStyle = '#00b0f0';
    for (const [cx, cy] of esquinas()) ctx.fillRect(cx * W - t / 2, cy * H - t / 2, t, t);
    $('[data-a="mejorar"]', modal).classList.toggle('activo', p.mejorar);
  }

  const esquinas = () => {
    const r = p.recorte;
    return [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]];
  };

  // Arrastre de esquinas (o del recuadro completo)
  let arrastre = null;
  const punto = e => {
    const b = lienzo.getBoundingClientRect();
    return [(e.clientX - b.left) / b.width, (e.clientY - b.top) / b.height];
  };
  lienzo.addEventListener('pointerdown', e => {
    const [x, y] = punto(e);
    const b = lienzo.getBoundingClientRect();
    const tol = 36 / Math.min(b.width, b.height);
    const i = esquinas().findIndex(([cx, cy]) => Math.abs(cx - x) < tol && Math.abs(cy - y) < tol);
    const r = p.recorte;
    if (i >= 0) arrastre = { esquina: i };
    else if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) arrastre = { mover: [x - r.x, y - r.y] };
    if (arrastre) lienzo.setPointerCapture(e.pointerId);
  });
  lienzo.addEventListener('pointermove', e => {
    if (!arrastre) return;
    const [x0, y0] = punto(e);
    const x = Math.min(1, Math.max(0, x0)), y = Math.min(1, Math.max(0, y0));
    const r = p.recorte;
    const MIN = 0.1;
    if (arrastre.mover) {
      r.x = Math.min(1 - r.w, Math.max(0, x - arrastre.mover[0]));
      r.y = Math.min(1 - r.h, Math.max(0, y - arrastre.mover[1]));
    } else {
      let x1 = r.x, y1 = r.y, x2 = r.x + r.w, y2 = r.y + r.h;
      const i = arrastre.esquina;
      if (i === 0 || i === 2) x1 = Math.min(x, x2 - MIN); else x2 = Math.max(x, x1 + MIN);
      if (i === 0 || i === 1) y1 = Math.min(y, y2 - MIN); else y2 = Math.max(y, y1 + MIN);
      Object.assign(r, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
    }
    pintar();
  });
  lienzo.addEventListener('pointerup', () => { arrastre = null; });

  return new Promise(resolver => {
    const cerrar = v => { modal.hidden = true; modal.innerHTML = ''; resolver(v); };
    modal.querySelector('.editor-barra').addEventListener('click', async e => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'girar') { p.giro = (p.giro + 90) % 360; p.recorte = { x: 0, y: 0, w: 1, h: 1 }; await cargarBase(); }
      if (a === 'mejorar') { p.mejorar = !p.mejorar; await cargarBase(); }
      if (a === 'todo') { p.recorte = { x: 0, y: 0, w: 1, h: 1 }; pintar(); }
      if (a === 'eliminar' && confirm('¿Eliminar esta foto?')) cerrar(null);
      if (a === 'cancelar') cerrar(pagina);
      if (a === 'listo') cerrar(p);
    });
    cargarBase();
  });
}

export async function miniatura(pagina) {
  const c = await dibujarPagina(pagina, 360);
  return c.toDataURL('image/jpeg', 0.7);
}
