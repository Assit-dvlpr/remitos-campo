// Pruebas de la lectura del N° de remito a partir del texto reconocido en la foto.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numeroRemitoDeLineas } from '../js/dominio/ocr.js';

test('toma el N° del encabezado y descarta el rango de impresión del pie', () => {
  const lineas = [
    { texto: 'CUIT 30-71234518-3', y: 120 },
    { texto: 'N° 0001 - 00004758', y: 160 },
    { texto: '0001-00004451 0001-00004950', y: 1200 },
    { texto: 'F. de Imp. 1/2026- N° 0001-00004451 al 0001-00004950', y: 1210 },
  ];
  assert.deepEqual(numeroRemitoDeLineas(lineas), { pv: '0001', numero: '00004758' });
});

test('acepta guiones distintos y espacios; sin número devuelve null', () => {
  assert.deepEqual(numeroRemitoDeLineas([{ texto: 'Nº 0002–00012345', y: 1 }]), { pv: '0002', numero: '00012345' });
  assert.equal(numeroRemitoDeLineas([{ texto: 'REMITO', y: 1 }]), null);
  assert.equal(numeroRemitoDeLineas([]), null);
});
