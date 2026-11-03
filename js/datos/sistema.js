// Conexión con el sistema principal (Dataverse, solo lectura): usuario, sector y catálogos.
// Con señal lee Dataverse y guarda una copia en el celular; sin señal usa esa copia.
import { CONFIG, MODO_DEMO, MODO_PRUEBA_DV } from '../nucleo/config.js';
import { recordar } from '../nucleo/estado.js';
import { buscarPorId, esSectorElectrico, usuarioHabilitado, referenciasFaltantes } from '../dominio/sistema.js';
import { catalogosGuardados } from './cola.js';

export const sistemaActivo = () => MODO_DEMO || MODO_PRUEBA_DV || CONFIG.dataverse.activo;

const fuente = async () => (MODO_DEMO ? import('./dataverse/demo.js') : import('./dataverse/api.js')).then(m => m.dataverse);
// GUIDs y valores de opciones con los que se decide (sector eléctrico, internas cerradas, usuarios habilitados)
// En modo prueba, lo elegido en Configuración → Sistema (guardado en el navegador) completa lo que falte en config.js
export async function referencias() {
  if (MODO_DEMO) return (await import('./dataverse/demo.js')).REFERENCIAS;
  const r = CONFIG.dataverse.referencias;
  if (!MODO_PRUEBA_DV) return r;
  const g = recordar('referencias-prueba') || {};
  return {
    sectorElectricoId: r.sectorElectricoId || g.sectorElectricoId || '',
    internaEstadosCerrados: r.internaEstadosCerrados?.length ? r.internaEstadosCerrados : g.internaEstadosCerrados || [],
    usuarioEstadosHabilitados: r.usuarioEstadosHabilitados?.length ? r.usuarioEstadosHabilitados : g.usuarioEstadosHabilitados || [],
  };
}
export const guardarReferenciasPrueba = ref => recordar('referencias-prueba', ref);

// Devuelve { usuario, sector, electrico, catalogos, sinSenal }, o null si el usuario trabaja como siempre
// (no está en el sistema o no hay señal ni copia). Solo un usuario deshabilitado bloquea la entrada.
export async function cargarSistema(email) {
  const ref = await referencias();
  const faltan = referenciasFaltantes(ref);
  // En la prueba se entra igual: sin referencias no se filtran internas ni usuarios y nadie es del sector eléctrico
  if (faltan.length && !MODO_PRUEBA_DV) {
    const e = new Error(`Falta configurar en config.js (dataverse.referencias): ${faltan.join(', ')}.`);
    e.codigo = 'REFERENCIAS';
    throw e;
  }
  const dv = await fuente();
  let usuario, catalogos, sinSenal = false;
  try {
    [usuario, catalogos] = await Promise.all([dv.usuario(email), dv.catalogos()]);
    await catalogosGuardados.guardar('ultimo', { usuario, catalogos }).catch(() => {});
  } catch (e) {
    const copia = await catalogosGuardados.leer('ultimo').catch(() => null);
    // Sin señal y sin copia: se sigue con el funcionamiento de siempre (sin sistema)
    if (!copia || copia.usuario?.email !== String(email).toLowerCase()) return null;
    ({ usuario, catalogos } = copia);
    sinSenal = true;
  }
  // Sin alta en el sistema principal: funcionamiento de siempre (algunos sectores trabajan así)
  if (!usuario) return null;
  const sinFiltroUsuario = MODO_PRUEBA_DV && !ref.usuarioEstadosHabilitados?.length;
  if (!sinFiltroUsuario && !usuarioHabilitado(usuario, ref)) throw new Error(`Tu usuario del sistema principal está "${usuario.estado}". Pedile al administrador que lo habilite.`);
  const sector = buscarPorId(catalogos.sectores, usuario.sectorId);
  return { usuario, sector, electrico: esSectorElectrico(usuario.sectorId, ref), catalogos, ref, sinSenal, faltan };
}
