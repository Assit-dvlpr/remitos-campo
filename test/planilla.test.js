// Pruebas de la lógica pura que escribe en la planilla del cliente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colLetra, colNumero, parseDireccion, planificarEscritura, filasDeRemito, columnasCliente } from '../js/dominio/planilla.js';
import { norm } from '../js/nucleo/texto.js';
import { fechaSerial } from '../js/nucleo/fechas.js';

test('norm: sin acentos, símbolos ni puntos', () => {
  assert.equal(norm('N° REMITO'), 'N REMITO');
  assert.equal(norm('Cant.'), 'CANT');
  assert.equal(norm('FECHA\nSOLICITUD'), 'FECHA SOLICITUD');
  assert.equal(norm(null), '');
});

test('colLetra y colNumero son inversas', () => {
  for (const [n, l] of [[0, 'A'], [25, 'Z'], [26, 'AA'], [51, 'AZ'], [702, 'AAA']]) {
    assert.equal(colLetra(n), l);
    assert.equal(colNumero(l), n);
  }
});

test('parseDireccion con hoja entre comillas', () => {
  assert.deepEqual(parseDireccion("'Planilla Carga'!A5:S228"), { hoja: 'Planilla Carga', col1: 0, fila1: 5, col2: 18, fila2: 228 });
  assert.deepEqual(parseDireccion("'D''Agostino'!B2"), { hoja: "D'Agostino", col1: 1, fila1: 2, col2: 1, fila2: 2 });
});

test('fechaSerial: 2026-10-27 es 46322', () => {
  assert.equal(fechaSerial('2026-10-27'), 46322);
  assert.equal(fechaSerial(''), '');
});

const ENC = ['FECHA SOLICITUD', 'REMITO', 'ITEM', 'CANT', 'PRECIO', 'ESTABLECIMIENTO'];
const COLS = { fechaSolicitud: 'FECHA SOLICITUD', remito: 'REMITO', item: 'ITEM', cant: 'CANT', establecimiento: 'ESTABLECIMIENTO' };
const F = '=VLOOKUP([@ITEM],T,2,0)';
const cuerpoBase = () => [
  [46000, '0001-00000001', 10, 1, F, 'Planta A'],
  ['', '', '', '', '', ''],
  ['', '', '', '', '', ''],
];
const fila = (remito, item, cant) => ({ fechaSolicitud: 46100, remito, item, cant, establecimiento: 'Planta B' });

test('escribe en la primera fila libre, por tramos, y completa fórmulas vacías', () => {
  const plan = planificarEscritura({
    encabezados: ENC, cuerpo: cuerpoBase(), direccion: "'Hoja'!A5:F7", columnas: COLS,
    filas: [fila('0001-00000002', 20, 2), fila('0001-00000002', 30, 1)],
  });
  assert.equal(plan.error, undefined);
  assert.equal(plan.desde, 6);
  assert.equal(plan.hasta, 7);
  assert.equal(plan.hoja, 'Hoja');
  assert.deepEqual(plan.escrituras.map(w => w.address), ['A6:D7', 'F6:F7', 'E6:E7']);
  assert.deepEqual(plan.escrituras[0].values[1], [46100, '0001-00000002', 30, 1]);
  assert.deepEqual(plan.escrituras[2].formulas, [[F], [F]]);
  assert.deepEqual(plan.agregar, []);
});

test('si la tabla se llena agrega filas con fórmulas', () => {
  const plan = planificarEscritura({
    encabezados: ENC, cuerpo: cuerpoBase(), direccion: "'Hoja'!A5:F7", columnas: COLS,
    filas: [1, 2, 3].map(i => fila('0001-00000003', i, 1)),
  });
  assert.equal(plan.agregar.length, 1);
  assert.deepEqual(plan.agregar[0], [46100, '0001-00000003', 3, 1, F, 'Planta B']);
  assert.equal(plan.hasta, 8);
});

test('remito ya cargado: error de duplicado', () => {
  const plan = planificarEscritura({
    encabezados: ENC, cuerpo: cuerpoBase(), direccion: "'Hoja'!A5:F7", columnas: COLS, filas: [fila('0001-00000001', 10, 1)],
  });
  assert.equal(plan.duplicado, true);
  assert.match(plan.error, /fila 5/);
});

test('columna mapeada inexistente u obligatoria sin mapear', () => {
  const a = planificarEscritura({ encabezados: ENC, cuerpo: cuerpoBase(), direccion: "'H'!A5:F7", columnas: { ...COLS, zona: 'ZONA' }, filas: [fila('x', 1, 1)] });
  assert.match(a.error, /ZONA/);
  const b = planificarEscritura({ encabezados: ENC, cuerpo: cuerpoBase(), direccion: "'H'!A5:F7", columnas: { ...COLS, cant: '' }, filas: [fila('x', 1, 1)] });
  assert.match(b.error, /cant/);
});

test('filasDeRemito: una fila por ítem que va a la planilla, sin km', () => {
  const items = [{ cod: 10, planilla: true }, { cod: 'KM', planilla: false }];
  const r = {
    remito: '0001-00000009', fechaRemito: '2026-10-27', fechaSolicitud: '', periodo: '2026-10',
    establecimiento: 'Planta', zona: 'OESTE', tecnico: 'Valverdi', extras: { linea: 'HPS' },
    items: [{ cod: '10', cant: 2 }, { cod: 'KM', cant: 120 }, { cod: 20, cant: 0 }],
  };
  const f = filasDeRemito(r, items);
  assert.equal(f.length, 1);
  assert.equal(f[0].item, 10);
  assert.equal(f[0].periodo, fechaSerial('2026-10-01'));
  assert.equal(f[0].linea, 'HPS');
});

test('columnasCliente suma las columnas de los campos adicionales', () => {
  assert.deepEqual(columnasCliente({ excel: { columnas: { remito: 'REMITO' } }, extras: [{ campo: 'linea', columna: 'LÍNEA' }] }),
    { remito: 'REMITO', linea: 'LÍNEA' });
});
