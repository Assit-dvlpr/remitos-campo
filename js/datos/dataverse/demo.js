// Modo demostración: catálogos del sistema principal inventados, con la misma forma que datos/dataverse/api.js.
const id = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const E = { demo: id(1), otra: id(2) };
const SEC = { elec: id(10), hys: id(11) };
const OP = { ypf: id(20), pae: id(21) };
const LIN = { norte: id(30), sur: id(31), otra: id(32) };
const SOL = { a: id(40), b: id(41), c: id(42) };
const OI = { a: id(50), b: id(51), c: id(52), cerrada: id(53) };
const SERV = { pat: id(60), ilum: id(61), ruido: id(62), mont: id(63), dmont: id(64) };

// El usuario demo es del sector eléctrico, para ver la sección de materiales
const USUARIO = { id: id(99), email: 'demo@alonger.com.ar', nombre: 'Usuario Demo', rolId: '', rol: 'Tecnico', estadoValor: 1, estado: 'Activo', sectorId: SEC.elec, grupo: '' };

const CATALOGOS = {
  empresas: [{ id: E.demo, nombre: 'Cliente Demo', abreviatura: 'DEMO', activo: true }, { id: E.otra, nombre: 'Otra Empresa', abreviatura: 'OTRA', activo: true }],
  operadoras: [{ id: OP.ypf, nombre: 'Operadora Norte', activo: true }, { id: OP.pae, nombre: 'Operadora Sur', activo: true }],
  yacimientos: [],
  lineas: [
    { id: LIN.norte, nombre: 'Oleoducto Demo Norte', psl: 'PSL-1', empresaId: E.demo, operadoraId: OP.ypf, activo: true },
    { id: LIN.sur, nombre: 'Gasoducto Demo Sur', psl: '', empresaId: E.demo, operadoraId: OP.pae, activo: true },
    { id: LIN.otra, nombre: 'Línea Otra Empresa', psl: '', empresaId: E.otra, operadoraId: OP.ypf, activo: true },
  ],
  usuarios: [
    { ...USUARIO, email: '' },
    { id: id(97), nombre: 'Juan Pérez', estadoValor: 1, sectorId: SEC.elec },
    { id: id(98), nombre: 'Ana Gómez', estadoValor: 1, sectorId: SEC.hys },
    { id: id(96), nombre: 'Usuario Dado de Baja', estadoValor: 2, sectorId: SEC.elec },
  ],
  sectores: [{ id: SEC.elec, nombre: 'Seguridad eléctrica', codigo: 'ELEC', activo: true }, { id: SEC.hys, nombre: 'Higiene y Seguridad', codigo: 'HYS', activo: true }],
  servicios: [
    { id: SERV.pat, codigo: '10', nombre: 'Medición de puesta a tierra', sectorId: SEC.elec, activo: true },
    { id: SERV.ilum, codigo: '50', nombre: 'Iluminación', sectorId: SEC.hys, activo: true },
    { id: SERV.ruido, codigo: '40', nombre: 'Nivel sonoro', sectorId: SEC.hys, activo: true },
    { id: SERV.mont, codigo: '20', codigoInterno: 'MONT', nombre: 'Montaje de puesta a tierra', sectorId: SEC.elec, recuento: null, activo: true },
    { id: SERV.dmont, codigo: '21', codigoInterno: 'DMONT', nombre: 'Desmontaje de puesta a tierra', sectorId: SEC.elec, recuento: null, activo: true },
  ],
  solicitudes: [
    { id: SOL.a, numero: 'GEN-2026-0101', numeroExterno: 'OC 4500123', empresaId: E.demo, empresa: 'Cliente Demo', ubicacion: 'Planta Demo Norte', locacion: 'Locación LDN-12', estado: 'En curso', activo: true },
    { id: SOL.b, numero: 'GEN-2026-0102', numeroExterno: '', empresaId: E.demo, empresa: 'Cliente Demo', ubicacion: 'Estación Demo Este', locacion: 'Locación EDE-3', estado: 'En curso', activo: true },
    { id: SOL.c, numero: 'GEN-2026-0103', numeroExterno: '', empresaId: E.otra, empresa: 'Otra Empresa', ubicacion: 'Base Otra', estado: 'Nueva', activo: true },
  ],
  solicitudServicios: [
    { id: id(70), solicitudId: SOL.a, servicioId: SERV.pat, sectorId: SEC.elec, ordenInternaId: OI.a, activo: true },
    { id: id(73), solicitudId: SOL.a, servicioId: SERV.mont, sectorId: SEC.elec, ordenInternaId: OI.a, activo: true },
    { id: id(74), solicitudId: SOL.a, servicioId: SERV.dmont, sectorId: SEC.elec, ordenInternaId: OI.a, activo: true },
    { id: id(71), solicitudId: SOL.b, servicioId: SERV.ilum, sectorId: SEC.hys, ordenInternaId: '', activo: true },
    { id: id(72), solicitudId: SOL.c, servicioId: SERV.pat, sectorId: SEC.elec, ordenInternaId: OI.c, activo: true },
  ],
  solicitudLineas: [
    { id: id(80), solicitudId: SOL.a, lineaId: LIN.norte, ordenInternaId: OI.a, activo: true },
    { id: id(82), solicitudId: SOL.a, lineaId: LIN.sur, ordenInternaId: OI.a, activo: true },
    { id: id(81), solicitudId: SOL.b, lineaId: LIN.sur, ordenInternaId: '', activo: true },
  ],
  ordenesInternas: [
    { id: OI.a, numero: 'INT-0501', numeroALO: 'ALO-000501', solicitudId: SOL.a, sectorId: SEC.elec, estadoValor: 101, estado: 'Programada', fechaProgramada: '2026-11-03', detalle: 'Medición PAT tanques', creado: '2026-11-02T10:00:00Z', activo: true },
    { id: OI.b, numero: 'INT-0502', numeroALO: 'ALO-000502', solicitudId: SOL.b, sectorId: SEC.hys, estadoValor: 102, estado: 'Pendiente', fechaProgramada: '2026-11-05', detalle: '', creado: '2026-10-30T10:00:00Z', activo: true },
    { id: OI.c, numero: 'INT-0503', numeroALO: 'ALO-000503', solicitudId: SOL.c, sectorId: SEC.elec, estadoValor: 103, estado: 'En curso', fechaProgramada: '', detalle: '', creado: '2026-10-28T10:00:00Z', activo: true },
    { id: OI.cerrada, numero: 'INT-0400', numeroALO: 'ALO-000400', solicitudId: SOL.a, sectorId: SEC.elec, estadoValor: 109, estado: 'Finalizada', fechaProgramada: '2026-10-01', detalle: '', activo: true },
  ],
  materialesStock: [
    { id: id(90), nombre: 'Jabalina 1,5 m', codigo: 'JAB15', unidad: 'UN', sectorId: SEC.elec, activo: true },
    { id: id(91), nombre: 'Cable Cu desnudo 35 mm²', codigo: 'CU35', unidad: 'M', sectorId: SEC.elec, activo: true },
    { id: id(92), nombre: 'Morseto bronce', codigo: 'MOR', unidad: 'UN', sectorId: '', activo: true },
  ],
  materialesRecuperados: [
    { id: id(95), nombre: 'Cable Cu recuperado 35 mm²', unidad: 'M', empresaId: E.demo, lineaId: LIN.norte, activo: true },
    { id: id(96), nombre: 'Cable Cu recuperado 35 mm²', unidad: 'M', empresaId: E.demo, lineaId: LIN.sur, activo: true },
  ],
  // Saldo del recuperado: 200 m en la línea Norte, 150 m en la Sur
  movimientosRecuperado: [
    { id: id(110), materialId: id(95), empresaId: E.demo, lineaId: LIN.norte, cantidad: 260, activo: true },
    { id: id(111), materialId: id(95), empresaId: E.demo, lineaId: LIN.norte, cantidad: -60, activo: true },
    { id: id(112), materialId: id(96), empresaId: E.demo, lineaId: LIN.sur, cantidad: 150, activo: true },
  ],
};



// Referencias por ID/valor del entorno demo (en el real están en CONFIG.dataverse.referencias)
export const REFERENCIAS = Object.freeze({ sectorElectricoId: SEC.elec, internaEstadosCerrados: [109], usuarioEstadosHabilitados: [1] });

export const dataverse = {
  modo: 'demo',
  async usuario(email) { return email === USUARIO.email ? { ...USUARIO } : null; },
  async catalogos() { return { ...structuredClone(CATALOGOS), avisos: [], leido: new Date().toISOString() }; },
};
