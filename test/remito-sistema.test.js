// Pruebas del remito armado desde Dataverse: cliente = empresa, ítems = servicios por GUID, Excel opcional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clienteDelSistema, serviciosParaRemito, llevaMateriales, materialesRecuperadosDe } from '../js/dominio/sistema.js';
import { filasMaterialesPorServicio, materialesPorServicioDeFilas } from '../js/dominio/materiales.js';
import { registroIntermedio, registrosIntermedios, TODAS_LAS_LINEAS } from '../js/dominio/intermedia.js';
import { itemsParaExcel } from '../js/dominio/intermedia.js';
import { itemsDeCantidades } from '../js/dominio/remito.js';

const cat = {
  empresas: [{ id: 'e1', nombre: 'YPF' }],
  servicios: [
    { id: 's1', codigo: 'TER', nombre: 'Termografía', sectorId: 'sec1' },
    { id: 's2', codigo: 'PAT', nombre: 'Puesta a tierra', sectorId: 'sec1' },
    { id: 's3', codigo: 'RUI', nombre: 'Ruido', sectorId: 'sec2' },
  ],
  ordenesInternas: [{ id: 'o1', solicitudId: 'sol1', sectorId: 'sec1' }],
  solicitudServicios: [{ solicitudId: 'sol1', servicioId: 's2', ordenInternaId: 'o1' }],
};

test('servicios: los de la interna; sin interna los del sector', () => {
  assert.deepEqual(serviciosParaRemito(cat, { ordenId: 'o1', sectorId: 'sec1' }).map(s => s.id), ['s2']);
  assert.deepEqual(serviciosParaRemito(cat, { sectorId: 'sec1' }).map(s => s.id), ['s2', 's1']);
  assert.equal(serviciosParaRemito(cat, { sectorId: 'otro' }).length, 3);
});

test('cliente del sistema: nombre de la empresa, ítems por GUID y km; Excel solo si está vinculado', () => {
  const sinExcel = clienteDelSistema(cat, { empresaId: 'E1', sectorId: 'sec1' }, { demo: { nombre: 'Demo' } });
  assert.equal(sinExcel.nombre, 'YPF');
  assert.equal(sinExcel.claveExcel, '');
  assert.deepEqual(sinExcel.items.map(i => i.cod), ['s2', 's1', 'KM']);
  const conExcel = clienteDelSistema(cat, { empresaId: 'e1', sectorId: 'sec1' }, { ypf: { nombre: 'YPF Excel', empresaId: '{E1}', extras: [{ campo: 'x' }] } });
  assert.equal(conExcel.claveExcel, 'ypf');
  assert.equal(conExcel.extras.length, 1);
});

test('un servicio ya cargado que salió del catálogo no se pierde', () => {
  const c = clienteDelSistema(cat, { empresaId: 'e1', ordenId: 'o1' }, {}, [{ cod: 's9', servicio: 'Viejo', servicioId: 's9', cant: 1 }]);
  assert.ok(c.items.some(i => i.servicioId === 's9'));
});

test('ítems cargados conservan el GUID del servicio', () => {
  const c = clienteDelSistema(cat, { empresaId: 'e1', sectorId: 'sec1' }, {});
  const items = itemsDeCantidades(c.items, { s1: 2, KM: 30 });
  assert.deepEqual(items[0], { cod: 's1', servicio: 'Termografía', cant: 2, servicioId: 's1', codigo: 'TER' });
});

test('para el Excel: GUID -> código de la planilla; avisa lo no vinculado', () => {
  const planilla = [{ cod: 10, servicio: 'TERMOGRAFIA', servicioId: '{S1}' }, { cod: 'KM', servicio: 'KM', unidad: 'km' }];
  const r = itemsParaExcel([{ cod: 's1', servicioId: 's1', cant: 2 }, { cod: 's2', servicioId: 's2', servicio: 'PAT', cant: 1 }, { cod: 'KM', cant: 5 }], planilla);
  assert.deepEqual(r.items.map(i => i.cod), [10, 'KM']);
  assert.deepEqual(r.sinVincular.map(i => i.servicio), ['PAT']);
});

test('Montaje y Desmontaje llevan materiales (código interno o recuento, como ALO Manager)', () => {
  assert.ok(llevaMateriales({ codigoInterno: 'MONT' }));
  assert.ok(llevaMateriales({ codigoInterno: 'dmont' }));
  assert.ok(llevaMateriales({ codigoInterno: 'Desmontaje' }));
  assert.ok(llevaMateriales({ codigo: 'X', recuento: true }));
  assert.ok(!llevaMateriales({ codigoInterno: 'MONT', recuento: false }));
  assert.ok(!llevaMateriales({ codigoInterno: 'RUI' }));
});

test('recuperado: solo el de la empresa y línea, con su saldo', () => {
  const c = {
    materialesRecuperados: [
      { id: 'm1', nombre: 'Cable', empresaId: 'hal', lineaId: 'frac' },
      { id: 'm2', nombre: 'Cable', empresaId: 'hal', lineaId: 'wire' },
      { id: 'm3', nombre: 'Cable', empresaId: 'slb', lineaId: 'frac2' },
    ],
    movimientosRecuperado: [
      { materialId: 'm1', empresaId: 'hal', lineaId: 'frac', cantidad: 250 }, { materialId: 'm1', empresaId: 'hal', lineaId: 'frac', cantidad: -50 },
      { materialId: 'm2', empresaId: 'hal', lineaId: 'wire', cantidad: 60 },
    ],
  };
  assert.deepEqual(materialesRecuperadosDe(c, 'hal', 'frac').map(m => [m.id, m.saldo]), [['m1', 200]]);
  assert.deepEqual(materialesRecuperadosDe(c, 'hal', 'wire').map(m => [m.id, m.saldo]), [['m2', 60]]);
  assert.equal(materialesRecuperadosDe(c, 'hal', '').length, 2);
});

test('materiales por servicio: filas con su servicio, ida y vuelta, y detalle de la intermedia', () => {
  const catalogos = { materialesStock: [{ id: 'n1', nombre: 'Jabalina', unidad: 'UN' }], materialesRecuperados: [{ id: 'm1', nombre: 'Cable', unidad: 'M' }] };
  const porServicio = { s1: { stock: { n1: 2 }, recuperado: {}, reutilizado: { m1: 30 } }, s2: { stock: { n1: 1 }, recuperado: {}, reutilizado: {} } };
  const filas = filasMaterialesPorServicio(porServicio, catalogos, ['s1']);
  assert.deepEqual(filas.map(f => [f.servicioId, f.tipo, f.materialId, f.cant]), [['s1', 'stock', 'n1', 2], ['s1', 'reutilizado', 'm1', 30]]);
  assert.deepEqual(materialesPorServicioDeFilas(filas).s1.reutilizado, { m1: 30 });
  const { detalle } = registroIntermedio({ remito: '1', items: [], materiales: filas }, { estado: 'pendiente' });
  assert.ok(detalle.every(d => d.servicioId === 's1'));
});

test('varias líneas: un registro por línea; cada servicio a su línea o a todas; km en la primera', () => {
  const r = {
    remito: '0001-1', idLocal: 'x', km: 40,
    sistema: { empresaId: 'e', lineaIds: ['L1', 'L2'], operadoraId: '', operadorasPorLinea: { L1: 'O1', L2: 'O2' } },
    items: [
      { cod: 'a', servicioId: 'a', cant: 1, lineaId: 'L1' },
      { cod: 'b', servicioId: 'b', cant: 2, lineaId: TODAS_LAS_LINEAS },
      { cod: 'KM', servicio: 'KM', cant: 40 },
    ],
    materiales: [
      { tipo: 'stock', materialId: 'n1', cant: 3, servicioId: 'b' },
      { tipo: 'reutilizado', materialId: 'm2', cant: 30, servicioId: 'b', lineaId: 'L2' },
    ],
  };
  const regs = registrosIntermedios(r, { estado: 'pendiente' });
  assert.deepEqual(regs.map(x => [x.sufijo, x.cabecera.lineaId, x.cabecera.operadoraId, x.cabecera.kilometros]), [['l1', 'l1', 'o1', 40], ['l2', 'l2', 'o2', 0]]);
  assert.deepEqual(regs[0].detalle.map(d => d.clave), ['servicio:a', 'servicio:b', 'stock:b:n1']);
  assert.deepEqual(regs[1].detalle.map(d => d.clave), ['servicio:b', 'reutilizado:b:m2']);
});

test('una sola línea: un registro con sufijo vacío (mismo GUID de siempre)', () => {
  const regs = registrosIntermedios({ remito: '1', sistema: { lineaId: 'L1' }, items: [] }, { estado: 'pendiente' });
  assert.deepEqual(regs.map(x => [x.sufijo, x.cabecera.lineaId]), [['', 'l1']]);
});
