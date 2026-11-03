// Pruebas de las reglas sobre los catálogos del sistema principal y del mapeo de Dataverse.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  identidadInterna, esSectorElectrico, usuarioHabilitado, ordenesAbiertas, filtrarOrdenes, lineasDeEmpresa, empresasConLineas,
  materialesDeStock, materialesRecuperadosDe, internaCerrada, referenciasFaltantes,
} from '../js/dominio/sistema.js';
import { lookupId, mapear, numeroNegocio } from '../js/datos/dataverse/mapeo.js';
import { mismoId } from '../js/nucleo/ids.js';
import { dataverse, REFERENCIAS as ref } from '../js/datos/dataverse/demo.js';

const cat = await dataverse.catalogos();
const SEC_ELEC = cat.sectores[0].id;

test('mismoId ignora llaves y mayúsculas; vacío nunca coincide', () => {
  assert.ok(mismoId('{ABC-1}', 'abc-1'));
  assert.ok(!mismoId('', ''));
});

test('lookupId lee _col_value sin importar mayúsculas', () => {
  assert.equal(lookupId({ _cr1d0_Empresa_value: '{AA}' }, 'cr1d0_empresa'), 'aa');
  assert.equal(lookupId({}, 'cr1d0_empresa'), '');
});

test('mapear líneas y descartar inactivas', () => {
  const filas = [
    { cr1d0_generallineasid: 'L1', cr1d0_nombrelinea: 'Norte', _cr1d0_empresa_value: 'E1', cr1d0_activo: true },
    { cr1d0_generallineasid: 'L2', cr1d0_nombrelinea: 'Vieja', _cr1d0_empresa_value: 'E1', cr1d0_activo: false },
  ];
  const r = mapear('lineas', filas, {});
  assert.deepEqual(r.map(l => [l.id, l.empresaId]), [['l1', 'e1']]);
});

test('mapear usuario: email en minúsculas, rol y sector', () => {
  const f = { cr1d0_generalusuarioid: 'U1', cr1d0_email: ' Juan@Alonger.com.AR ', '_cr1d0_rol_value@OData.Community.Display.V1.FormattedValue': 'Tecnico', _cr1d0_sector_value: 'S1', 'cr1d0_estado@OData.Community.Display.V1.FormattedValue': 'Activo' };
  f._cr1d0_rol_value = 'R1'; f.cr1d0_estado = 1;
  const [u] = mapear('usuarios', [f], {}, { inactivos: true });
  assert.deepEqual([u.email, u.rolId, u.sectorId, u.estadoValor], ['juan@alonger.com.ar', 'r1', 's1', 1]);
});

test('sector eléctrico, usuario habilitado e interna cerrada se deciden por GUID y valor, no por texto', () => {
  assert.ok(esSectorElectrico(SEC_ELEC.toUpperCase(), ref));
  assert.ok(!esSectorElectrico(cat.sectores[1].id, ref));
  // Un sector que se llame "eléctrico" pero no sea el configurado no cuenta
  assert.ok(!esSectorElectrico('otro-guid', ref));
  assert.ok(usuarioHabilitado({ estadoValor: 1, estado: 'Pendiente' }, ref));
  assert.ok(!usuarioHabilitado({ estadoValor: 2, estado: 'Activo' }, ref));
  assert.ok(!usuarioHabilitado({ estadoValor: null }, ref));
  assert.ok(!usuarioHabilitado(null, ref));
  assert.ok(internaCerrada({ estadoValor: 109, estado: 'En curso' }, ref));
  assert.ok(!internaCerrada({ estadoValor: 101, estado: 'Finalizada' }, ref));
  assert.deepEqual(referenciasFaltantes(ref), []);
  assert.equal(referenciasFaltantes({}).length, 3);
});

test('órdenes abiertas del sector, con solicitud, empresa, líneas y servicios', () => {
  const o = ordenesAbiertas(cat, { sectorId: SEC_ELEC, ref });
  assert.deepEqual(o.map(x => x.numero), ['INT-0501', 'INT-0503']);
  assert.equal(o[0].empresa.nombre, 'Cliente Demo');
  assert.deepEqual(o[0].lineas.map(l => l.nombre), ['Oleoducto Demo Norte', 'Gasoducto Demo Sur']);
  assert.deepEqual(o[0].servicios.map(s => s.servicio.nombre), ['Medición de puesta a tierra', 'Montaje de puesta a tierra', 'Desmontaje de puesta a tierra']);
  assert.equal(ordenesAbiertas(cat, { sectorId: SEC_ELEC, verTodas: true, ref }).length, 3);
});

test('servicio sin interna se asocia por solicitud y sector', () => {
  const [o] = ordenesAbiertas(cat, { sectorId: cat.sectores[1].id, ref });
  assert.equal(o.numero, 'INT-0502');
  assert.deepEqual(o.servicios.map(s => s.servicio.nombre), ['Iluminación']);
  assert.deepEqual(o.lineas.map(l => l.nombre), ['Gasoducto Demo Sur']);
});

test('filtrar órdenes por número, empresa o ubicación', () => {
  const o = ordenesAbiertas(cat, { sectorId: SEC_ELEC, verTodas: true, ref });
  assert.deepEqual(filtrarOrdenes(o, 'otra').map(x => x.numero), ['INT-0503']);
  assert.deepEqual(filtrarOrdenes(o, '0102').map(x => x.numero), ['INT-0502']);
});

test('líneas por empresa, empresas con líneas y materiales', () => {
  const demo = cat.empresas[0].id;
  assert.deepEqual(lineasDeEmpresa(cat, demo).map(l => l.nombre), ['Gasoducto Demo Sur', 'Oleoducto Demo Norte']);
  assert.equal(empresasConLineas(cat).length, 2);
  // Todos los materiales activos, haya o no stock, sin filtrar por sector
  assert.equal(materialesDeStock(cat).length, 3);
  assert.equal(materialesRecuperadosDe(cat, demo, cat.lineas[0].id).length, 1);
  // Sin saldo en esa línea igual se ofrecen los de la empresa
  assert.equal(materialesRecuperadosDe(cat, demo, cat.lineas[1].id).length, 1);
});

test('resumenSistema traduce los IDs guardados a nombres', async () => {
  const { resumenSistema } = await import('../js/dominio/sistema.js');
  const o = cat.ordenesInternas[0];
  const s = resumenSistema(cat, { tipo: 'orden', ordenId: o.id, solicitudId: o.solicitudId, empresaId: cat.empresas[0].id, sectorId: SEC_ELEC });
  assert.equal(s.interna, `${o.numeroALO} - Ref. ${o.numero}`);
  assert.equal(s.empresa, cat.empresas[0].nombre);
  assert.equal(s.sector, cat.sectores[0].nombre);
  assert.equal(resumenSistema(cat, null), null);
  assert.equal(resumenSistema(null, { tipo: 'nuevo' }).empresa, '');
});

test('N° de solicitud como en ALO Manager (GEN-año-número)', () => {
  assert.equal(numeroNegocio('12', '2026-03-01T00:00:00Z', 'GEN'), 'GEN-2026-0012');
  assert.equal(numeroNegocio('GEN-2025-0007', '2026-01-01', 'GEN'), 'GEN-2025-0007');
  assert.equal(numeroNegocio('ABC-x', '2026-01-01', 'GEN'), 'ABC-x');
  assert.equal(numeroNegocio('', '2026', 'GEN'), '');
});

test('identidad de la interna como en ALO Manager', () => {
  assert.equal(identidadInterna({ numeroALO: 'ALO-000009', numero: '1380' }), 'ALO-000009 - Ref. 1380');
  assert.equal(identidadInterna({ numeroALO: 'ALO-000009', numero: '' }), 'ALO-000009');
  assert.equal(identidadInterna({ numeroALO: '', numero: 'ALO-PENDIENTE-3' }), 'Número pendiente');
  assert.equal(identidadInterna({ numeroALO: 'ALO-1', numero: '55', origenNumeracion: 'Google Sheets' }, { codigo: 'SE' }), 'ALO-1_extSE-55');
});
