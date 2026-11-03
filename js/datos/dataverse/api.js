// Catálogos de Dataverse para Remitos de Campo (solo lectura).
import { TABLAS } from './tablas.js';
import { leerTodo } from './lectura.js';
import { mapear } from './mapeo.js';

// Lo que necesita la app, en una sola lectura. Una tabla que falle no frena las demás: queda en avisos.
const LEER = ['empresas', 'operadoras', 'yacimientos', 'lineas', 'sectores', 'servicios', 'solicitudes',
  'solicitudServicios', 'solicitudLineas', 'ordenesInternas', 'materialesStock', 'materialesRecuperados', 'movimientosRecuperado', 'usuarios'];
// Columnas que se piden por tabla (por defecto, todas). De los usuarios solo lo necesario para elegir acompañante.
const COLUMNAS = {
  usuarios: '$select=cr1d0_generalusuarioid,cr1d0_nombrecompleto,cr1d0_estado,_cr1d0_sector_value',
  movimientosRecuperado: '$select=cr1d0_generalcablerecuperadomovimientoid,_cr1d0_materialreferencia_value,_cr1d0_empresa_value,_cr1d0_linea_value,cr1d0_metros,cr1d0_activo,statecode',
};

export const dataverse = {
  modo: 'dataverse',

  // Usuario del sistema principal por email (sin distinguir mayúsculas). null si no existe.
  async usuario(email) {
    const e = String(email || '').trim().toLowerCase().replace(/'/g, "''");
    const { filas, metadata } = await leerTodo(TABLAS.usuarios, `$filter=cr1d0_email eq '${e}'`);
    return mapear('usuarios', filas, metadata, { inactivos: true })[0] || null;
  },

  async catalogos() {
    const avisos = [];
    const pares = await Promise.all(LEER.map(async nombre => {
      try {
        const { filas, metadata } = await leerTodo(TABLAS[nombre], COLUMNAS[nombre] || '');
        return [nombre, mapear(nombre, filas, metadata)];
      } catch (e) {
        avisos.push(`${nombre}: ${e.message}`);
        return [nombre, []];
      }
    }));
    return { ...Object.fromEntries(pares), avisos, leido: new Date().toISOString() };
  },
};
