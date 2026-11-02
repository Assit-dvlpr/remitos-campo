// Pruebas de las reglas del remito y del catálogo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarRemito, responsable, itemsDeCantidades, kilometros, validarCarga, faltantesAprobacion,
} from '../js/dominio/remito.js';
import { prepararItems, establecimientosDeRango, itemsDeTarifas, vaAPlanilla } from '../js/dominio/catalogo.js';

const CATALOGO = prepararItems([{ cod: 10, servicio: 'CALIDAD DE AIRE', planilla: true }, { cod: 20, servicio: 'RUIDO', planilla: true }]);
const CLIENTE = { items: CATALOGO, extras: [{ campo: 'linea', etiqueta: 'Línea', quien: 'tecnico', obligatorio: true }] };

test('normalizarRemito completa con ceros y exige ambas partes', () => {
  assert.equal(normalizarRemito('1', '5780'), '0001-00005780');
  assert.equal(normalizarRemito('0001', 'a5780'), '0001-00005780');
  assert.equal(normalizarRemito('', '5780'), '');
});

test('responsable con y sin acompañante', () => {
  assert.equal(responsable(' Nicolas Valverdi ', ''), 'Nicolas Valverdi');
  assert.equal(responsable('Nicolas Valverdi', ' Caro '), 'Valverdi - Caro');
});

test('ítems y kilómetros desde las cantidades', () => {
  assert.equal(CATALOGO.at(-1).cod, 'KM');
  const cant = { 10: 2, 20: 0, KM: 35 };
  assert.deepEqual(itemsDeCantidades(CATALOGO, cant).map(i => [i.cod, i.cant]), [[10, 2], ['KM', 35]]);
  assert.equal(kilometros(CATALOGO, cant), 35);
  assert.equal(vaAPlanilla(CATALOGO, 'KM'), false);
  assert.equal(vaAPlanilla(CATALOGO, '10'), true);
});

test('el ítem KM del cliente se factura y no se agrega uno propio', () => {
  const items = prepararItems([{ cod: 7, servicio: 'KM RECORRIDO', planilla: true }]);
  assert.equal(items.length, 1);
  assert.equal(items[0].unidad, 'km');
});

test('validarCarga: solo kilómetros no alcanza', () => {
  const b = { fechaRemito: '2026-10-27', establecimiento: 'Planta', tecnico: 'Valverdi', extras: { linea: 'HPS' }, paginas: [1] };
  const items = itemsDeCantidades(CATALOGO, { KM: 10 });
  assert.deepEqual(validarCarga(b, CLIENTE, { hoy: '2026-11-02', remito: '0001-00000001', items }), ['Cargá al menos un servicio.']);
  const ok = itemsDeCantidades(CATALOGO, { 10: 1 });
  assert.deepEqual(validarCarga(b, CLIENTE, { hoy: '2026-11-02', remito: '0001-00000001', items: ok }), []);
  assert.deepEqual(validarCarga({ ...b, fechaRemito: '2026-12-01', extras: {} }, CLIENTE, { hoy: '2026-11-02', remito: 'x', items: ok }),
    ['La fecha no puede ser futura.', 'Elegí línea.']);
});

test('faltantesAprobacion lista lo que completa la oficina', () => {
  const d = { remito: 'x', fechaRemito: '2026-10-27', fechaSolicitud: '', periodo: '', tecnico: 'V', extras: {}, items: [{ cod: 10, cant: 1 }] };
  assert.deepEqual(faltantesAprobacion(d, CLIENTE), ['fecha de solicitud', 'período', 'línea']);
});

test('establecimientos se leen hasta la primera fila vacía', () => {
  const v = [['OESTE', 'Planta A '], ['ESTE', 'Planta B'], ['', ''], ['X', 'Otra tabla']];
  assert.deepEqual(establecimientosDeRango(v), [{ zona: 'OESTE', nombre: 'Planta A' }, { zona: 'ESTE', nombre: 'Planta B' }]);
  assert.deepEqual(itemsDeTarifas([['COD', 'SERV'], [10, ' Aire '], ['', 'x']]), [{ cod: 10, servicio: 'Aire', planilla: true }]);
});
