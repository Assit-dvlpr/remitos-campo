// Catálogo de un cliente: ítems de servicio (de su tabla de tarifas), establecimientos y columnas de su planilla.
// Lógica pura: no lee el Excel, trabaja con lo que ya se leyó.

// El código del ítem es su identificador. Puede venir como número (50) o texto ("50", "KM"): se compara siempre como texto.
export const mismoCodigo = (a, b) => String(a) === String(b);
export const buscarItem = (items, cod) => (items || []).find(i => mismoCodigo(i.cod, cod)) || null;

// Kilómetros: ítem propio (cod KM) o el ítem del cliente marcado con unidad km
export const esKm = it => it?.unidad === 'km' || String(it?.cod).toUpperCase() === 'KM';
export const itemKm = items => (items || []).find(esKm) || null;

// Un ítem va a la planilla salvo que esté marcado planilla:false (ej. kilómetros propios)
export const vaAPlanilla = (items, cod) => buscarItem(items, cod)?.planilla !== false;

// Detecta el ítem de kilómetros del cliente (ej. "KM RECORRIDO", que se factura) o agrega uno propio
// que solo queda registrado en el remito. Modifica y devuelve la lista.
export function prepararItems(items) {
  const km = items.find(i => /\bKM\b|KIL[OÓ]METR/i.test(i.servicio));
  if (km) km.unidad = 'km';
  else items.push({ cod: 'KM', servicio: 'KILÓMETROS', planilla: false, unidad: 'km' });
  return items;
}

// Filas de la tabla de tarifas (con encabezado) -> ítems { cod, servicio, planilla }
export const itemsDeTarifas = valores => valores.slice(1)
  .filter(f => f[0] !== '' && f[1] !== '')
  .map(f => ({ cod: f[0], servicio: String(f[1]).trim(), planilla: true }));

// Rango zona | establecimiento -> [{ zona, nombre }]. Se corta en la primera fila vacía:
// debajo suele haber otra tabla de la misma hoja.
export function establecimientosDeRango(valores) {
  const fin = valores.findIndex(f => !String(f[1]).trim());
  return valores.slice(0, fin < 0 ? valores.length : fin)
    .map(f => ({ zona: String(f[0]).trim(), nombre: String(f[1]).trim() }));
}

export const buscarEstablecimiento = (cliente, nombre) => (cliente?.establecimientos || []).find(e => e.nombre === nombre) || null;

// ---------- Columnas de la planilla ----------

// Valores por defecto tomados de la planilla de Oldelval (se pueden cambiar en Configuración).
export const CLIENTE_POR_DEFECTO = {
  nombre: '',
  tabla: 'Tabla1',
  tablaTarifas: 'Tabla17456',
  hojaEstab: 'Control Campaña',
  rangoEstab: 'B9:C33',
  columnas: {
    fechaSolicitud: 'FECHA SOLICITUD',
    remito: 'REMITO',
    fechaRemito: 'FECHA REMITO INFORME',
    item: 'ITEM',
    cant: 'CANT',
    establecimiento: 'ESTABLECIMIENTO',
    periodo: 'PERIODO',
    zona: 'ZONA',
    responsable: 'RESPONSABLE TECNICO VISITA',
  },
};

export const ETIQUETAS_COLUMNAS = {
  fechaSolicitud: 'Fecha de solicitud', remito: 'N° de remito', fechaRemito: 'Fecha del remito', item: 'Ítem',
  cant: 'Cantidad', establecimiento: 'Establecimiento', periodo: 'Período', zona: 'Zona', responsable: 'Responsable técnico',
};

// Sin estas columnas no se puede escribir un remito; las demás son opcionales
export const COLUMNAS_OBLIGATORIAS = ['remito', 'item', 'cant'];
