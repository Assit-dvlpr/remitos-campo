// Pruebas de la columna Items de la lista de SharePoint: formato original y datos agregados.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= { search: '', origin: 'http://localhost', pathname: '/' };
const { aCampos, deItem } = await import('../js/datos/sharepoint/listas.js');
const items = [{ cod: '10', cant: 1 }];

test('sin datos extra, Items queda en el formato original (lista)', () => {
  assert.equal(aCampos({ items, extras: {}, sistema: null, materiales: [] }).Items, JSON.stringify(items));
});

test('sistema y materiales se guardan y se leen de vuelta', () => {
  const r = { remito: '0001-00000001', items, sistema: { tipo: 'orden', ordenId: 'a' }, materiales: [{ tipo: 'stock', materialId: 'm', cant: 2 }] };
  const leido = deItem({ id: '1', fields: aCampos(r) });
  assert.deepEqual(leido.items, items);
  assert.deepEqual(leido.sistema, r.sistema);
  assert.deepEqual(leido.materiales, r.materiales);
  assert.deepEqual(leido.extras, {});
});

test('remitos viejos (Items como lista) se leen sin sistema ni materiales', () => {
  const leido = deItem({ id: '1', fields: { Items: JSON.stringify(items) } });
  assert.equal(leido.sistema, null);
  assert.deepEqual(leido.materiales, []);
});
