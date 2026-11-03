// Remito por líneas: pestañas por línea, el mismo servicio en varias, km único y búsqueda por abreviatura
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemsDeLineas, cantidadesPorLinea } from '../js/dominio/remito.js';
import { clienteDelSistema, serviciosDelSector, buscarServicios } from '../js/dominio/sistema.js';
import { itemsParaExcel, registrosIntermedios } from '../js/dominio/intermedia.js';
import { claveMaterial, filasMaterialesPorClave, materialesPorClaveDeFilas } from '../js/dominio/materiales.js';

const cat = {
  servicios: [
    { id: 's1', codigoInterno: 'MONT', nombre: 'Montaje', sectorId: 'sec1', activo: true },
    { id: 's2', codigoInterno: 'DMONT', nombre: 'Desmontaje', sectorId: 'sec1', activo: true },
    { id: 's3', codigoInterno: 'TER', nombre: 'Termografía', sectorId: 'sec1', activo: true },
    { id: 's4', codigoInterno: 'PAT', nombre: 'Puesta a tierra', sectorId: 'otro', activo: true },
  ],
  empresas: [{ id: 'e1', nombre: 'YPF' }],
  lineas: [], ordenesInternas: [], solicitudServicios: [],
};
const catalogo = [{ cod: 's1', servicio: 'Montaje', servicioId: 's1', codigo: 'MONT', materiales: true }, { cod: 's3', servicio: 'Termografía', servicioId: 's3', codigo: 'TER' }, { cod: 'KM', servicio: 'KILÓMETROS', unidad: 'km' }];

test('cada pestaña da sus ítems con la línea; el mismo servicio puede ir en dos líneas', () => {
  const items = itemsDeLineas(catalogo, { L1: { s1: 2, KM: 9 }, L2: { s1: 1, s3: 4 } }, ['L1', 'L2']);
  assert.deepEqual(items.map(i => [i.cod, i.cant, i.lineaId]), [['s1', 2, 'L1'], ['s1', 1, 'L2'], ['s3', 4, 'L2']]);
  // Sin líneas: sin lineaId
  assert.deepEqual(itemsDeLineas(catalogo, { '': { s3: 1 } }, []).map(i => i.lineaId), [undefined]);
});

test('ítems guardados -> cantidades por línea (los de "todas" en cada una, los sin línea en la primera)', () => {
  const r = cantidadesPorLinea([
    { cod: 's1', cant: 2, lineaId: 'l1' }, { cod: 's3', cant: 1, lineaId: '*' }, { cod: 's2', cant: 5 }, { cod: 'KM', cant: 30 },
  ], ['L1', 'L2']);
  assert.deepEqual(r, { L1: { s1: 2, s3: 1, s2: 5 }, L2: { s3: 1 } });
});

test('al Excel el mismo servicio de varias líneas va sumado', () => {
  const planilla = [{ cod: '7', servicio: 'MONTAJE', servicioId: 's1' }];
  const r = itemsParaExcel([{ cod: 's1', servicioId: 's1', cant: 2, lineaId: 'L1' }, { cod: 's1', servicioId: 's1', cant: 1, lineaId: 'L2' }, { cod: 'KM', cant: 5 }], planilla);
  assert.deepEqual(r.items.map(i => [i.cod, i.cant, i.lineaId]), [['7', 3, undefined], ['KM', 5, undefined]]);
});

test('cada línea va en su registro de la tabla intermedia con sus servicios', () => {
  const regs = registrosIntermedios({
    remito: '1', sistema: { lineaId: 'L1', lineaIds: ['L1', 'L2'], operadorasPorLinea: { L1: 'o1', L2: 'o2' } },
    items: itemsDeLineas(catalogo, { L1: { s1: 2 }, L2: { s1: 1 } }, ['L1', 'L2']),
    materiales: [{ tipo: 'stock', materialId: 'n1', cant: 3, servicioId: 's1', lineaId: 'L2' }],
  }, { estado: 'pendiente' });
  assert.deepEqual(regs.map(x => x.detalle.map(d => [d.clave, d.cantidad])), [[['servicio:s1', 2]], [['servicio:s1', 1], ['stock:s1:n1', 3]]]);
});

test('sin interna la lista base está vacía: los servicios se agregan desde el catálogo del sector', () => {
  const c = clienteDelSistema(cat, { empresaId: 'e1', sectorId: 'sec1' }, {}, [], { soloInterna: true });
  assert.deepEqual(c.items.map(i => i.cod), ['KM']);
  const conAgregado = clienteDelSistema(cat, { empresaId: 'e1', sectorId: 'sec1' }, {}, [{ servicioId: 's2' }], { soloInterna: true });
  assert.deepEqual(conAgregado.items.map(i => [i.cod, i.codigo, i.materiales]), [['s2', 'DMONT', true], ['KM', undefined, undefined]]);
});

test('buscador: servicios del sector, por abreviatura primero', () => {
  const sector = serviciosDelSector(cat, 'sec1');
  assert.deepEqual(sector.map(i => i.codigo), ['DMONT', 'MONT', 'TER']);
  assert.deepEqual(buscarServicios(sector, 'mont').map(i => i.codigo), ['MONT', 'DMONT']);
  assert.deepEqual(buscarServicios(sector, 'termo').map(i => i.codigo), ['TER']);
});

test('materiales por línea y servicio: ida y vuelta', () => {
  const cats = { materialesStock: [{ id: 'n1', nombre: 'Cable', unidad: 'm' }], materialesRecuperados: [] };
  const filas = filasMaterialesPorClave({ [claveMaterial('L2', 's1')]: { stock: { n1: 4 } } }, cats);
  assert.deepEqual(filas, [{ tipo: 'stock', materialId: 'n1', nombre: 'Cable', unidad: 'm', cant: 4, servicioId: 's1', lineaId: 'L2' }]);
  assert.deepEqual(materialesPorClaveDeFilas(filas), { 'L2|s1': { stock: { n1: 4 }, recuperado: {}, reutilizado: {} } });
});

test('sector Seguridad eléctrica: se toma de la tabla de sectores si no está configurado', async () => {
  const { sectorElectricoDe } = await import('../js/dominio/sistema.js');
  assert.equal(sectorElectricoDe([{ id: 'a', nombre: 'Higiene y Seguridad', codigo: 'HYS' }, { id: 'b', nombre: 'Seguridad Eléctrica', codigo: '' }])?.id, 'b');
  assert.equal(sectorElectricoDe([{ id: 'c', nombre: 'Otro nombre', codigo: 'ELEC' }])?.id, 'c');
  assert.equal(sectorElectricoDe([{ id: 'd', nombre: 'Higiene', codigo: 'HYS' }]), null);
});
