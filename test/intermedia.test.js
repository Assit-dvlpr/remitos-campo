// Pruebas del registro para la tabla intermedia de Dataverse y de los GUID estables.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registroIntermedio, ESTADOS_INTERMEDIA, TIPOS_DETALLE, conServicios, itemsSinServicio } from '../js/dominio/intermedia.js';
import { guidEstable } from '../js/nucleo/ids.js';

const remito = {
  remito: '0001-00005782', idLocal: 'abc', fechaRemito: '2026-11-02', km: 12.6, observaciones: 'ok', acompanante: 'Pérez',
  sistema: { tipo: 'orden', ordenId: '{AAA-1}', solicitudId: 'b', empresaId: 'c', lineaId: '', operadoraId: 'd', sectorId: 'e', tecnicoId: 'f', acompananteId: 'ACO' },
  items: [{ cod: '10', servicio: 'Calidad de aire', cant: 1 }, { cod: '20', servicio: 'X', cant: 0 }],
  materiales: [{ tipo: 'stock', materialId: 'M1', nombre: 'Cable', unidad: 'M', cant: 3 }, { tipo: 'recuperado', materialId: 'R1', cant: 2 }],
};

test('cabecera con IDs normalizados y lookups vacíos en null', () => {
  const { cabecera } = registroIntermedio(remito, { estado: ESTADOS_INTERMEDIA.PENDIENTE, revisorId: 'REV' });
  assert.equal(cabecera.ordenId, 'aaa-1');
  assert.equal(cabecera.lineaId, null);
  assert.equal(cabecera.revisorId, 'rev');
  assert.equal(cabecera.kilometros, 13);
  assert.equal(cabecera.acompananteId, 'aco');
  assert.equal(cabecera.observaciones, 'ok');
});

test('detalle: servicios con cantidad y materiales en su columna', () => {
  const { detalle } = registroIntermedio(remito, { estado: ESTADOS_INTERMEDIA.PENDIENTE });
  assert.equal(detalle.length, 3);
  assert.equal(detalle[0].tipo, TIPOS_DETALLE.servicio);
  const stock = detalle.find(f => f.tipo === TIPOS_DETALLE.stock);
  assert.equal(stock.materialStockId, 'm1');
  assert.equal(stock.materialRecuperadoId, null);
  assert.equal(detalle.find(f => f.tipo === TIPOS_DETALLE.recuperado).materialRecuperadoId, 'r1');
  assert.equal(new Set(detalle.map(f => f.clave)).size, 3);
});

test('guidEstable: mismo texto, mismo GUID; formato válido', async () => {
  const a = await guidEstable('remito-campo:abc');
  assert.equal(a, await guidEstable('remito-campo:abc'));
  assert.notEqual(a, await guidEstable('remito-campo:abd'));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('servicios: se completan por GUID desde el catálogo del cliente; los km no son fila', () => {
  const cat = [{ cod: 10, servicio: 'Aire', servicioId: 'SERV-1' }, { cod: 'KM', servicio: 'KILÓMETROS', unidad: 'km' }];
  const items = conServicios([{ cod: '10', cant: 1 }, { cod: 'KM', cant: 20 }, { cod: '30', cant: 1 }], cat);
  assert.equal(items[0].servicioId, 'SERV-1');
  assert.deepEqual(itemsSinServicio({ items }).map(i => i.cod), ['30']);
  const { detalle } = registroIntermedio({ items: items.slice(0, 2) }, { estado: ESTADOS_INTERMEDIA.PENDIENTE });
  assert.deepEqual(detalle.map(f => [f.tipo, f.servicioId]), [['servicio', 'serv-1']]);
});

test('nombre del archivo como ALO Manager: <N° remito>_<GUID>_<archivo>, sin caracteres raros', async () => {
  const { nombreArchivoSistema, semillaRemito } = await import('../js/dominio/intermedia.js');
  const g = await guidEstable(semillaRemito({ idLocal: 'abc', remito: '0001-00005782' }));
  assert.equal(nombreArchivoSistema('0001-00005782', g), `0001-00005782_${g}_remito.pdf`);
  assert.equal(nombreArchivoSistema('0001-1', 'x', 'foto ñ (1).jpg'), '0001-1_x_foto____1_.jpg');
  assert.equal(g, await guidEstable(semillaRemito({ idLocal: 'abc', remito: 'otro número' })));
});
