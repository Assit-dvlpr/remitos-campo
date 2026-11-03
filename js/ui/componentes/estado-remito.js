// Cómo se muestra el estado de un remito.
import { ESTADOS } from '../../nucleo/constantes.js';
import { esc } from '../../nucleo/texto.js';

export function claseEstado(e) {
  return {
    [ESTADOS.PENDIENTE]: 'pendiente', [ESTADOS.PENDIENTE_EXCEL]: 'pendiente',
    [ESTADOS.APROBADO]: 'aprobado', [ESTADOS.RECHAZADO]: 'rechazado',
  }[e] || 'cola';
}

// Para el técnico, "Pendiente" y "Pendiente Excel" son lo mismo: está en la oficina
const paraTecnico = e => (e === ESTADOS.PENDIENTE || e === ESTADOS.PENDIENTE_EXCEL ? 'En revisión' : e);

// directo: remito de Seguridad eléctrica que fue a Dataverse sin pasar por la revisión de la app
export const chipEstado = (e, { tecnico = false, directo = false } = {}) =>
  `<span class="estado ${claseEstado(e)}">${esc(directo && e === ESTADOS.APROBADO ? 'En el sistema' : tecnico ? paraTecnico(e) : e)}</span>`;
