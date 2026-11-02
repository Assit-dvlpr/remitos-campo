// Guardado en el celular (IndexedDB):
// - "cola": remitos listos para enviar; se envían solos cuando hay señal.
// - "borrador": el remito que se está cargando (con fotos), por si el celular cierra la app al abrir la cámara.

const DB = 'remitos-campo';

function abrir() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('cola', { keyPath: 'idLocal' });
      r.result.createObjectStore('borrador');
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
}

async function tx(almacen, modo, fn) {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const t = db.transaction(almacen, modo);
    const pedido = fn(t.objectStore(almacen));
    t.oncomplete = () => ok(pedido?.result);
    t.onerror = () => mal(t.error);
  });
}

export const cola = {
  guardar: e => tx('cola', 'readwrite', s => s.put(e)),
  todos: () => tx('cola', 'readonly', s => s.getAll()),
  quitar: id => tx('cola', 'readwrite', s => s.delete(id)),
};

export const borrador = {
  guardar: v => tx('borrador', 'readwrite', s => s.put(v, 'actual')),
  leer: () => tx('borrador', 'readonly', s => s.get('actual')),
  borrar: () => tx('borrador', 'readwrite', s => s.delete('actual')),
};

let procesando = false;

// Envía lo pendiente. Los errores de red quedan para el próximo intento;
// un remito duplicado queda marcado para que el técnico lo corrija.
export async function procesarCola(api, alCambiar) {
  if (procesando || !navigator.onLine) return;
  procesando = true;
  try {
    for (const e of await cola.todos()) {
      if (e.estado === 'duplicado') continue;
      try {
        await api.enviarRemito(e);
        await cola.quitar(e.idLocal);
      } catch (err) {
        e.intentos = (e.intentos || 0) + 1;
        e.error = err.message;
        if (err.codigo === 'duplicado') e.estado = 'duplicado';
        await cola.guardar(e);
      }
      alCambiar?.();
    }
  } finally {
    procesando = false;
  }
}
