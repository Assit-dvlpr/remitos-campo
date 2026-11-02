// Modo demostración: misma API que graph.js, pero guarda en el navegador y simula la planilla.
// Sirve para probar la interfaz antes de tener el registro en Entra. Los datos son ficticios.
import { planificarEscritura, filasDeRemito, columnasCliente, norm } from './excel.js';

// La planilla simulada tiene columnas fijas: los campos adicionales que no estén ahí solo se registran
const columnasDemo = cliente => Object.fromEntries(Object.entries(columnasCliente(cliente))
  .filter(([, v]) => !v || ENCABEZADOS.some(h => norm(h) === norm(v))));

const CLAVE = 'demo-remitos';
const leer = () => JSON.parse(localStorage.getItem(CLAVE) || '{"remitos":[],"pdfs":{},"tabla":null}');
const guardar = d => localStorage.setItem(CLAVE, JSON.stringify(d));
const esperar = ms => new Promise(r => setTimeout(r, ms));

const COLUMNAS = {
  fechaSolicitud: 'FECHA SOLICITUD', remito: 'REMITO', fechaRemito: 'FECHA REMITO INFORME', item: 'ITEM',
  cant: 'CANT', establecimiento: 'ESTABLECIMIENTO', periodo: 'PERIODO', zona: 'ZONA', responsable: 'RESPONSABLE TECNICO VISITA',
};
const ENCABEZADOS = ['FECHA\nSOLICITUD', 'REMITO', 'FECHA REMITO\nINFORME', 'ITEM', 'CANT', 'N° ORDEN DE COMPRA',
  'FECHA DE CIERRE EN SISTEMA', 'SECTOR', 'NUMERO DE PATENTE', 'DETALLE DE UNIDAD', 'ORIGEN', 'ESTABLECIMIENTO',
  'PERIODO', 'MANTENIMIENTO -MEDICION PUESTA A TIERRA', 'COSTO TOTAL', 'ZONA', 'RESPONSABLE TECNICO VISITA',
  'OBS OLDELVAL', 'RTA PROVEEDOR'];
const F_N = '=IFERROR(VLOOKUP(Tabla1[[#This Row],[ITEM]],Tabla17456[],2,FALSE),0)';
const F_O = '=IFERROR(VLOOKUP(Tabla1[[#This Row],[ITEM]],Tabla17456[],5,FALSE),0)*Tabla1[[#This Row],[CANT]]';

function tablaInicial() {
  const filas = [];
  for (let i = 0; i < 12; i++) {
    const f = Array(19).fill('');
    if (i < 3) Object.assign(f, { 0: 46286, 1: '0001-0000100' + i, 2: 46290, 3: 50, 4: 1, 11: 'Planta Demo Norte', 12: 46266, 16: 'Técnico Demo', 15: 'OESTE' });
    f[13] = F_N; f[14] = F_O;
    filas.push(f);
  }
  return filas;
}

export const CLIENTES_DEMO = {
  demo: {
    nombre: 'Cliente Demo',
    items: [
      { cod: 10, servicio: 'CALIDAD DE AIRE', planilla: true },
      { cod: 20, servicio: 'ESTUDIO DE VENTILACIÓN', planilla: true },
      { cod: 30, servicio: 'ANALISIS DE CALIDAD DE AGUA', planilla: true },
      { cod: 40, servicio: 'MEDICIONES DE NIVEL SONORO', planilla: true },
      { cod: 50, servicio: 'ILUMINACION', planilla: true },
      { cod: 60, servicio: 'CARGA DE FUEGO', planilla: true },
      { cod: 'KM', servicio: 'KILÓMETROS', planilla: false, unidad: 'km' },
    ],
    establecimientos: [
      { nombre: 'Planta Demo Norte', zona: 'OESTE' },
      { nombre: 'Planta Demo Sur', zona: 'OESTE' },
      { nombre: 'Estación Demo Este', zona: 'ESTE' },
    ],
    excel: { nombre: 'Planilla demo (simulada)', tabla: 'Tabla1', columnas: COLUMNAS },
  },
};

const blobADataUrl = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });

export const api = {
  modo: 'demo',

  async usuario() {
    return { email: 'demo@alonger.com.ar', displayName: 'Usuario Demo', nombre: 'Técnico Demo', rol: 'Admin' };
  },

  async leerClientes() { return leer().clientes || CLIENTES_DEMO; },
  async guardarClientes(clientes) { const d = leer(); d.clientes = clientes; guardar(d); },

  async buscarRemito(nro) { return leer().remitos.find(r => r.remito === nro) || null; },

  async enviarRemito(e) {
    await esperar(400);
    const d = leer();
    const existente = d.remitos.find(r => r.remito === e.datos.remito);
    if (existente && existente.idLocal !== e.idLocal && existente.id !== e.itemId) {
      throw Object.assign(new Error(`El remito ${e.datos.remito} ya fue cargado por ${existente.tecnico}.`), { codigo: 'duplicado' });
    }
    const id = e.itemId || existente?.id || String(Date.now());
    const previo = d.remitos.find(r => r.id === id);
    const nuevo = { ...previo, ...e.datos, id, idLocal: e.idLocal, estado: 'Pendiente', comentario: '', creado: previo?.creado || new Date().toISOString() };
    if (e.pdf) { d.pdfs[id] = await blobADataUrl(e.pdf); nuevo.archivoId = id; }
    if (e.paginas?.length) {
      nuevo.paginas = [];
      for (const [i, p] of e.paginas.entries()) {
        const fid = `${id}-p${i + 1}`;
        d.pdfs[fid] = await blobADataUrl(p.blob);
        nuevo.paginas.push({ archivoId: fid, giro: p.giro || 0, recorte: p.recorte || null, mejorar: !!p.mejorar });
      }
    }
    d.remitos = d.remitos.filter(r => r.id !== id).concat(nuevo);
    guardar(d);
  },

  async misRemitos(email) {
    return leer().remitos.filter(r => r.tecnicoEmail === email).sort((a, b) => b.creado.localeCompare(a.creado));
  },

  async pendientes() {
    return leer().remitos.filter(r => r.estado === 'Pendiente' || r.estado === 'Pendiente Excel')
      .sort((a, b) => a.creado.localeCompare(b.creado));
  },

  async pdf(remito) {
    const u = leer().pdfs[remito.archivoId];
    return u ? (await fetch(u)).blob() : null;
  },

  async eliminarRemito(remito) {
    const d = leer();
    for (const id of [remito.archivoId, ...(remito.paginas || []).map(p => p.archivoId)]) delete d.pdfs[id];
    d.remitos = d.remitos.filter(r => r.id !== remito.id);
    guardar(d);
  },

  async fotoOriginal(pagina) {
    return (await fetch(leer().pdfs[pagina.archivoId])).blob();
  },

  async subirFotoOriginal(remito, blob) {
    const d = leer();
    const fid = `${remito.id}-p${Date.now()}`;
    d.pdfs[fid] = await blobADataUrl(blob);
    guardar(d);
    return fid;
  },

  async reemplazarPdf(remito, pdf) {
    const d = leer();
    const id = remito.archivoId || remito.id;
    d.pdfs[id] = await blobADataUrl(pdf);
    guardar(d);
    return { archivoId: id, archivoUrl: remito.archivoUrl || '' };
  },

  async actualizar(remito) {
    const d = leer();
    d.remitos = d.remitos.map(r => (r.id === remito.id ? { ...r, ...remito } : r));
    guardar(d);
  },

  async escribirExcel(cliente, remito) {
    await esperar(500);
    const d = leer();
    const cuerpo = d.tabla || tablaInicial();
    const plan = planificarEscritura({
      encabezados: ENCABEZADOS, cuerpo, direccion: `'Planilla Carga'!A5:S${4 + cuerpo.length}`,
      columnas: columnasDemo(cliente), filas: filasDeRemito(remito, cliente.items),
    });
    if (plan.error) throw Object.assign(new Error(plan.error), { codigo: plan.duplicado ? 'duplicado' : 'planilla' });
    const idx = Object.fromEntries(Object.entries(columnasDemo(cliente)).filter(([, v]) => v)
      .map(([k, v]) => [k, ENCABEZADOS.findIndex(h => norm(h) === norm(v))]));
    const largoInicial = cuerpo.length;
    filasDeRemito(remito, cliente.items).forEach((f, i) => {
      const r = plan.desde - 5 + i;
      if (!cuerpo[r]) cuerpo[r] = [...plan.agregar[r - largoInicial]];
      for (const [k, c] of Object.entries(idx)) cuerpo[r][c] = f[k];
    });
    d.tabla = cuerpo;
    guardar(d);
    console.info('[demo] Escrituras en la planilla simulada:', plan);
    return `${plan.desde}-${plan.hasta}`;
  },

  async archivarPdf(cliente, remito) {
    const [y, m] = remito.fechaRemito.split('-');
    const ruta = `Remitos ${cliente.nombre}/${y}/${m}/Remito ${remito.remito} - ${cliente.nombre} - ${remito.establecimiento} - ${remito.fechaRemito}.pdf`;
    console.info('[demo] PDF archivado en:', ruta);
    return ruta;
  },

  tablaDemo() { return { encabezados: ENCABEZADOS, cuerpo: leer().tabla || tablaInicial() }; },

  async crearEstructura(alAvanzar) { alAvanzar?.('Modo demo: no se crea nada en SharePoint.'); },
  async agregarUsuario() {},
  async urlLista() { return null; },
  async resolverExcel() { throw new Error('En modo demo no se vincula un Excel real.'); },
  async contarItems() { return { 50: 12, 40: 9, 30: 4 }; },

  async leerTabla() {
    return {
      encabezados: ['LINEA', 'CENTRO DE COSTO', 'PSL'],
      filas: [['BUNDLE', '6004510016', 'PERIFERICOS'], ['HPS', '6004510017', 'HPS'], ['MPD', '6004510115', 'MPD']],
    };
  },

  async leerCatalogo(excel, lectura) {
    const c = CLIENTES_DEMO.demo;
    return { items: c.items.filter(i => i.cod !== 'KM'), establecimientos: lectura?.hojaEstab ? c.establecimientos : [] };
  },
};
