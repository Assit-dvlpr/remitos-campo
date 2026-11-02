// Lógica pura para escribir un remito en la planilla del cliente.
// No llama a ningún servicio: recibe lo que hay en la tabla y devuelve qué celdas escribir.
// Regla: solo se escriben las columnas mapeadas; las demás (fórmulas de precio, etc.) no se tocan.

export function norm(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

export function colLetra(n) { // 0 -> A
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function colNumero(letras) { // A -> 0
  return [...letras.toUpperCase()].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
}

// "'Planilla Carga'!A5:S228" -> { hoja, col1, fila1, col2, fila2 }
export function parseDireccion(addr) {
  const i = addr.lastIndexOf('!');
  let hoja = addr.slice(0, i);
  if (hoja.startsWith("'")) hoja = hoja.slice(1, -1).replace(/''/g, "'");
  const m = addr.slice(i + 1).match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) throw new Error('Dirección de rango no reconocida: ' + addr);
  return {
    hoja,
    col1: colNumero(m[1]), fila1: +m[2],
    col2: colNumero(m[3] || m[1]), fila2: +(m[4] || m[2]),
  };
}

// 'YYYY-MM-DD' -> número de serie de Excel (fecha sin hora)
export function fechaSerial(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d || 1) / 86400000 + 25569;
}

const vacio = v => v === null || v === undefined || String(v).trim() === '';

// ---------- Campos adicionales por cliente ----------
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
    for (const d of out.filter(x => x.quien !== 'auto')) {
      const m = String(d.origen || '').match(REF);
      if (m) {
        const i = col(m[1], m[2]);
        d.opciones = [...new Set(tablas[m[1]].filas.map(f => String(f[i] ?? '').trim()).filter(Boolean))];
        d.tabla = m[1]; d.columnaTabla = m[2];
      } else {
        d.opciones = String(d.origen || '').split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    for (const d of out.filter(x => x.quien === 'auto')) {
      const [ref, segun] = String(d.origen || '').split(/\s+según\s+/i);
      const m = (ref || '').match(REF);
      if (!m || !segun) throw new Error(`"${d.etiqueta}": el origen automático va como Tabla[COLUMNA] según <campo>.`);
      const fuente = out.find(x => norm(x.etiqueta) === norm(segun) && x.quien !== 'auto');
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
  for (const d of (defs || []).filter(x => x.quien === 'auto')) v[d.campo] = d.mapa?.[norm(v[d.segun])] ?? '';
  return v;
}

// Columnas a escribir: las fijas más las de los campos adicionales
export function columnasCliente(cliente) {
  return { ...(cliente.excel?.columnas || {}), ...Object.fromEntries((cliente.extras || []).map(d => [d.campo, d.columna])) };
}

// Convierte un remito aprobado en las filas para la planilla (una por ítem que va a la planilla).
export function filasDeRemito(remito, catalogoItems) {
  const vaPlanilla = cod => (catalogoItems.find(i => String(i.cod) === String(cod))?.planilla) !== false;
  return remito.items
    .filter(it => it.cant > 0 && vaPlanilla(it.cod))
    .map(it => ({
      fechaSolicitud: fechaSerial(remito.fechaSolicitud),
      remito: remito.remito,
      fechaRemito: fechaSerial(remito.fechaRemito),
      item: isNaN(+it.cod) ? it.cod : +it.cod,
      cant: +it.cant,
      establecimiento: remito.establecimiento,
      periodo: remito.periodo ? fechaSerial(remito.periodo + '-01') : '',
      zona: remito.zona,
      responsable: remito.tecnico,
      ...(remito.extras || {}), // campos adicionales del cliente (ej. línea, centro de costo, sector)
    }));
}

/**
 * Planifica la escritura.
 * @param encabezados  valores de la fila de encabezados de la tabla
 * @param cuerpo       fórmulas (o valores) del cuerpo de la tabla, matriz filas x columnas
 * @param direccion    dirección del cuerpo, ej. "'Planilla Carga'!A5:S228"
 * @param columnas     { campo: 'NOMBRE DE ENCABEZADO' }
 * @param filas        objetos { campo: valor } a escribir
 * @param formatos     (opcional) formatos numéricos del cuerpo, misma forma que cuerpo
 * @returns { escrituras:[{address, values|formulas, numberFormat?}], agregar:[[...]], desde, hasta } o { error }
 *
 * Si la fila destino no tiene las fórmulas que sí tiene la última fila cargada (ej. precio y costo),
 * se completan copiándolas, solo en celdas vacías. El formato de las columnas escritas se copia de esa fila.
 */
export function planificarEscritura({ encabezados, cuerpo, direccion, columnas, filas, formatos }) {
  const enc = encabezados.map(norm);
  const idx = {};
  const faltan = [];
  for (const [campo, nombre] of Object.entries(columnas)) {
    if (!String(nombre ?? '').trim()) continue; // columna que esta planilla no tiene
    const i = enc.indexOf(norm(nombre));
    if (i < 0) faltan.push(nombre); else idx[campo] = i;
  }
  if (faltan.length) return { error: 'La planilla no tiene estas columnas: ' + faltan.join(', ') };
  const sinMapear = ['remito', 'item', 'cant'].filter(k => idx[k] === undefined);
  if (sinMapear.length) return { error: 'Falta indicar en Configuración la columna de: ' + sinMapear.join(', ') };
  if (!filas.length) return { error: 'El remito no tiene ítems para la planilla.' };

  const d = parseDireccion(direccion);
  const remito = norm(filas[0].remito);

  // Remito ya cargado
  const dup = cuerpo.findIndex(f => norm(f[idx.remito]) === remito);
  if (dup >= 0) return { error: `El remito ${filas[0].remito} ya está en la planilla (fila ${d.fila1 + dup}).`, duplicado: true };

  // Última fila cargada: la que tiene remito, ítem o cantidad. Otras columnas pueden venir
  // precargadas en filas vacías (ej. Sector y Período en Halliburton) y no cuentan.
  const usadas = Object.values(idx);
  const claves = [idx.remito, idx.item, idx.cant];
  let ultima = -1;
  cuerpo.forEach((f, r) => { if (claves.some(c => !vacio(f[c]))) ultima = r; });
  const inicio = ultima + 1;

  // Columnas mapeadas agrupadas en tramos contiguos (para no pisar las del medio)
  const orden = Object.entries(idx).sort((a, b) => a[1] - b[1]);
  const tramos = [];
  for (const [campo, c] of orden) {
    const t = tramos[tramos.length - 1];
    if (t && t.hasta === c - 1) { t.hasta = c; t.campos.push(campo); }
    else tramos.push({ desde: c, hasta: c, campos: [campo] });
  }

  const enRango = filas.slice(0, Math.max(0, cuerpo.length - inicio));
  const fuera = filas.slice(enRango.length);
  const modelo = ultima >= 0 ? cuerpo[ultima] : [];
  const formatoModelo = ultima >= 0 && formatos ? formatos[ultima] : null;
  const escrituras = [];
  if (enRango.length) {
    const f1 = d.fila1 + inicio;
    const f2 = f1 + enRango.length - 1;
    for (const t of tramos) {
      const w = {
        address: `${colLetra(d.col1 + t.desde)}${f1}:${colLetra(d.col1 + t.hasta)}${f2}`,
        values: enRango.map(f => t.campos.map(c => f[c] ?? '')),
      };
      // Formato solo para números y fechas; en texto queda el de la celda (null = no tocar)
      if (formatoModelo) {
        w.numberFormat = enRango.map(f => t.campos.map(c => (typeof f[c] === 'number' ? formatoModelo[idx[c]] ?? null : null)));
      }
      escrituras.push(w);
    }
    // Fórmulas faltantes (columnas no mapeadas cuya fila modelo tiene fórmula y la destino está vacía)
    encabezados.forEach((_, c) => {
      if (usadas.includes(c)) return;
      const f = modelo[c];
      if (typeof f !== 'string' || !f.startsWith('=')) return;
      const vacias = enRango.map((_, k) => inicio + k).filter(r => vacio(cuerpo[r][c]));
      const tramosF = [];
      for (const r of vacias) {
        const t = tramosF[tramosF.length - 1];
        if (t && t.hasta === r - 1) t.hasta = r; else tramosF.push({ desde: r, hasta: r });
      }
      const col = colLetra(d.col1 + c);
      for (const t of tramosF) {
        escrituras.push({
          address: `${col}${d.fila1 + t.desde}:${col}${d.fila1 + t.hasta}`,
          formulas: Array.from({ length: t.hasta - t.desde + 1 }, () => [f]),
        });
      }
    });
  }

  // Si la tabla se llena: filas nuevas completas, copiando las fórmulas de la última fila con datos
  const agregar = fuera.map(f => encabezados.map((_, c) => {
    const campo = Object.keys(idx).find(k => idx[k] === c);
    if (campo) return f[campo] ?? '';
    const m = modelo[c];
    return typeof m === 'string' && m.startsWith('=') ? m : '';
  }));

  return {
    escrituras,
    agregar,
    desde: d.fila1 + inicio,
    hasta: d.fila1 + inicio + filas.length - 1,
    hoja: d.hoja,
  };
}
