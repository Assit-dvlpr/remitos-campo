// Materiales que carga Seguridad eléctrica: stock utilizado, material recuperado y recuperado reutilizado.
// En el borrador se guardan como { tipo: { materialId: cantidad } }; al enviar, como filas con IDs.

export const TIPOS_MATERIAL = Object.freeze({
  stock: { etiqueta: 'Material de stock utilizado', catalogo: 'materialesStock' },
  recuperado: { etiqueta: 'Material recuperado en la obra', catalogo: 'materialesRecuperados' },
  reutilizado: { etiqueta: 'Material recuperado reutilizado', catalogo: 'materialesRecuperados' },
});

export const materialesVacios = () => ({ stock: {}, recuperado: {}, reutilizado: {} });

// Por servicio: { servicioId: { tipo: { id: cant } } } -> filas con el servicio al que pertenecen
export function filasMaterialesPorServicio(porServicio, catalogos, servicioIds) {
  return Object.entries(porServicio || {}).filter(([sid]) => !servicioIds || servicioIds.includes(sid))
    .flatMap(([servicioId, m]) => filasMateriales(m, catalogos).map(f => ({ ...f, servicioId })));
}
// Filas -> { servicioId: { tipo: { id: cant } } } (filas sin servicio quedan bajo '')
export function materialesPorServicioDeFilas(filas) {
  const r = {};
  for (const f of filas || []) {
    const m = (r[f.servicioId || ''] ||= materialesVacios());
    if (m[f.tipo]) m[f.tipo][f.materialId] = f.cant;
  }
  return r;
}

// { tipo: { id: cant } } -> [{ tipo, materialId, nombre, unidad, cant }] usando los catálogos para nombre y unidad
export function filasMateriales(materiales, catalogos) {
  const filas = [];
  for (const [tipo, cantidades] of Object.entries(materiales || {})) {
    const lista = catalogos[TIPOS_MATERIAL[tipo]?.catalogo] || [];
    for (const [materialId, cant] of Object.entries(cantidades || {})) {
      if (!(+cant > 0)) continue;
      const m = lista.find(x => x.id === materialId);
      filas.push({ tipo, materialId, nombre: m?.nombre || '', unidad: m?.unidad || '', cant: +cant, ...(m?.lineaId ? { lineaId: m.lineaId } : {}) });
    }
  }
  return filas;
}

// Filas -> { tipo: { id: cant } } (para corregir un remito rechazado)
export function materialesDeFilas(filas) {
  const m = materialesVacios();
  for (const f of filas || []) if (m[f.tipo]) m[f.tipo][f.materialId] = f.cant;
  return m;
}

// Cantidades no válidas (negativas o no numéricas) -> lista de errores
export function validarMateriales(materiales) {
  const err = [];
  for (const [tipo, cantidades] of Object.entries(materiales || {})) {
    if (Object.values(cantidades || {}).some(c => c !== '' && c !== 0 && !(+c > 0))) err.push(`Revisá las cantidades de "${TIPOS_MATERIAL[tipo].etiqueta}".`);
  }
  return err;
}
