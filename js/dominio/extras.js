// Campos adicionales por cliente (columnas propias de su planilla). Lógica pura.
import { norm } from '../nucleo/texto.js';
import { QUIEN } from '../nucleo/constantes.js';

const vacio = v => v === null || v === undefined || String(v).trim() === '';

// def = { campo, etiqueta, columna, quien: 'tecnico'|'revisor'|'auto', origen, obligatorio }
// origen: "Coordinación, HSE" (lista fija) · "Tabla3[LINEA]" (columna de una tabla del Excel)
//         · para 'auto': "Tabla3[CENTRO DE COSTO] según Línea" (valor de la fila cuya clave elige otro campo)

const REF = /^\s*([^[\]]+?)\s*\[\s*([^\]]+?)\s*\]\s*$/;

// Tablas del Excel que hace falta leer para resolver los orígenes
export function tablasDeExtras(defs) {
  return [...new Set(defs.map(d => (String(d.origen || '').split(/\s+según\s+/i)[0].match(REF) || [])[1]).filter(Boolean))];
}

// Completa opciones (y mapa para los automáticos) leyendo las tablas. Devuelve { extras } o { error }.
export function resolverExtras(defs, tablas) {
  const col = (tabla, nombre) => {
    const t = tablas[tabla];
    if (!t) throw new Error(`No se encontró la tabla "${tabla}" en el Excel.`);
    const i = t.encabezados.map(norm).indexOf(norm(nombre));
    if (i < 0) throw new Error(`La tabla "${tabla}" no tiene la columna "${nombre}".`);
    return i;
  };
  try {
    const out = defs.map(d => ({ ...d }));
    for (const d of out.filter(x => x.quien !== QUIEN.AUTO)) {
      const m = String(d.origen || '').match(REF);
      if (m) {
        const i = col(m[1], m[2]);
        d.opciones = [...new Set(tablas[m[1]].filas.map(f => String(f[i] ?? '').trim()).filter(Boolean))];
        d.tabla = m[1]; d.columnaTabla = m[2];
      } else {
        d.opciones = String(d.origen || '').split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    for (const d of out.filter(x => x.quien === QUIEN.AUTO)) {
      const [ref, segun] = String(d.origen || '').split(/\s+según\s+/i);
      const m = (ref || '').match(REF);
      if (!m || !segun) throw new Error(`"${d.etiqueta}": el origen automático va como Tabla[COLUMNA] según <campo>.`);
      const fuente = out.find(x => norm(x.etiqueta) === norm(segun) && x.quien !== QUIEN.AUTO);
      if (!fuente || fuente.tabla !== m[1]) throw new Error(`"${d.etiqueta}": el campo "${segun}" tiene que tomar sus opciones de la tabla ${m[1]}.`);
      const iClave = col(m[1], fuente.columnaTabla), iValor = col(m[1], m[2]);
      d.segun = fuente.campo;
      d.mapa = Object.fromEntries(tablas[m[1]].filas.filter(f => !vacio(f[iClave])).map(f => [norm(f[iClave]), f[iValor] ?? '']));
    }
    return { extras: out };
  } catch (e) {
    return { error: e.message };
  }
}

// Recalcula los campos automáticos a partir de los que eligió una persona
export function completarAutomaticos(defs, valores) {
  const v = { ...valores };
  for (const d of (defs || []).filter(x => x.quien === QUIEN.AUTO)) v[d.campo] = d.mapa?.[norm(v[d.segun])] ?? '';
  return v;
}
