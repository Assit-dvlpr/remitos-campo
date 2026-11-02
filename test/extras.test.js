// Pruebas de los campos adicionales por cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tablasDeExtras, resolverExtras, completarAutomaticos } from '../js/dominio/extras.js';

const TABLAS = {
  Tabla3: { encabezados: ['LINEA', 'CENTRO DE COSTO'], filas: [['BUNDLE', '600'], ['HPS', '601'], ['', '999']] },
};
const DEFS = [
  { campo: 'linea', etiqueta: 'Línea', columna: 'LÍNEA', quien: 'tecnico', origen: 'Tabla3[LINEA]' },
  { campo: 'cc', etiqueta: 'Centro de costo', columna: 'CC', quien: 'auto', origen: 'Tabla3[CENTRO DE COSTO] según Línea' },
  { campo: 'sector', etiqueta: 'Sector', columna: 'SECTOR', quien: 'revisor', origen: 'Coordinación, HSE' },
];

test('tablasDeExtras lista las tablas a leer sin repetir', () => {
  assert.deepEqual(tablasDeExtras(DEFS), ['Tabla3']);
});

test('resolverExtras arma opciones y mapa automático', () => {
  const { extras, error } = resolverExtras(DEFS, TABLAS);
  assert.equal(error, undefined);
  assert.deepEqual(extras[0].opciones, ['BUNDLE', 'HPS']);
  assert.deepEqual(extras[2].opciones, ['Coordinación', 'HSE']);
  assert.equal(extras[1].segun, 'linea');
  assert.deepEqual(extras[1].mapa, { BUNDLE: '600', HPS: '601' });
  assert.deepEqual(completarAutomaticos(extras, { linea: 'hps' }), { linea: 'hps', cc: '601' });
});

test('resolverExtras informa tabla o columna faltante', () => {
  assert.match(resolverExtras([{ ...DEFS[0], origen: 'TablaX[LINEA]' }], TABLAS).error, /TablaX/);
  assert.match(resolverExtras([{ ...DEFS[0], origen: 'Tabla3[NADA]' }], TABLAS).error, /NADA/);
});
