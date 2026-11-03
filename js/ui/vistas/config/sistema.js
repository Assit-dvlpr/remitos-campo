// Configuración, sección Sistema (Dataverse): verificar la conexión, elegir las referencias por GUID/valor
// y revisar que las tablas intermedias tengan las columnas que usa la app. Solo lee de Dataverse.
import { CONFIG, MODO_PRUEBA_DV } from '../../../nucleo/config.js';
import { estado } from '../../../nucleo/estado.js';
import { esc } from '../../../nucleo/texto.js';
import { mismoId } from '../../../nucleo/ids.js';
import { referencias, guardarReferenciasPrueba } from '../../../datos/sistema.js';
import { TABLAS } from '../../../datos/dataverse/tablas.js';
import { $, $$, aviso } from '../../dom.js';

const CATALOGOS = ['empresas', 'lineas', 'operadoras', 'sectores', 'solicitudes', 'ordenesInternas',
  'servicios', 'materialesStock', 'materialesRecuperados', 'usuarios'];

export async function seccionSistema(sec) {
  sec.innerHTML = '<h2>4. Sistema (Dataverse)</h2><p class="ayuda">Leyendo Dataverse…</p>';
  const [{ dataverse }, lectura, { INTERMEDIA, DETALLE }] = await Promise.all([
    import('../../../datos/dataverse/api.js'),
    import('../../../datos/dataverse/lectura.js'),
    import('../../../datos/dataverse/escritura.js'),
  ]);
  let usuario, cat, estadosInterna, estadosUsuario;
  try {
    [usuario, cat, estadosInterna, estadosUsuario] = await Promise.all([
      dataverse.usuario(estado.usuario.email),
      dataverse.catalogos(),
      lectura.opciones(TABLAS.ordenesInternas, 'cr1d0_estadooperativo'),
      lectura.opciones(TABLAS.usuarios, 'cr1d0_estado'),
    ]);
  } catch (e) {
    sec.innerHTML = `<h2>4. Sistema (Dataverse)</h2><div class="mensaje error">${esc(e.message)}</div>`;
    return;
  }
  const ref = await referencias();
  const sectorDe = id => cat.sectores.find(s => mismoId(s.id, id))?.nombre || 'sin sector';
  const conteo = CATALOGOS.map(k => `<tr><td>${k}</td><td style="text-align:right">${(cat[k] || []).length}</td></tr>`).join('');
  const marcar = (lista, nombre, elegidos) => lista.map(o => `<label style="display:block;font-weight:normal">
    <input type="checkbox" data-${nombre}="${o.valor}" ${(elegidos || []).map(Number).includes(o.valor) ? 'checked' : ''} style="width:auto;min-height:0">
    ${esc(o.etiqueta)} <small>(${o.valor})</small></label>`).join('');

  sec.innerHTML = `
    <h2>4. Sistema (Dataverse)</h2>
    <p class="ayuda" style="margin-top:0">${esc(CONFIG.dataverse.url)}${MODO_PRUEBA_DV ? ' · modo prueba' : ''}</p>
    <div class="mensaje ${usuario ? 'ok' : 'alerta'}">${usuario
      ? `Tu usuario está en el sistema: <b>${esc(usuario.nombre)}</b>, estado "${esc(usuario.estado)}" (${esc(usuario.estadoValor)}), sector ${esc(sectorDe(usuario.sectorId))}.`
      : `No se encontró ${esc(estado.usuario.email)} en General Usuario (se busca por email).`}</div>
    ${cat.avisos?.length ? `<div class="mensaje error">No se pudo leer:<br>${cat.avisos.map(esc).join('<br>')}</div>` : ''}
    <div class="tabla-scroll"><table class="tabla"><tr><th>Catálogo</th><th>Filas</th></tr>${conteo}</table></div>

    <h3>Referencias (por GUID y valor, nunca por texto)</h3>
    <label for="r-sector">Sector Seguridad eléctrica</label>
    <select id="r-sector"><option value="">Elegir…</option>${cat.sectores.map(s =>
      `<option value="${esc(s.id)}" ${mismoId(s.id, ref.sectorElectricoId) ? 'selected' : ''}>${esc(s.nombre)}</option>`).join('')}</select>
    <p class="ayuda">Estados de la interna que ya no admiten remitos:</p>${marcar(estadosInterna, 'cerrada', ref.internaEstadosCerrados)}
    <p class="ayuda">Estados del usuario que dejan entrar:</p>${marcar(estadosUsuario, 'habilitado', ref.usuarioEstadosHabilitados)}
    <div class="acciones"><button id="btn-ref" class="primario">${MODO_PRUEBA_DV ? 'Guardar para esta prueba' : 'Ver lo que va en config.js'}</button></div>
    <pre id="ref-json" class="ayuda" style="white-space:pre-wrap" hidden></pre>

    <h3>Tablas intermedias</h3>
    <div class="acciones"><button id="btn-tablas">Verificar columnas</button></div>
    <div id="tablas" class="ayuda"></div>`;

  $('#btn-ref', sec).onclick = () => {
    const nuevo = {
      sectorElectricoId: $('#r-sector', sec).value,
      internaEstadosCerrados: $$('[data-cerrada]', sec).filter(c => c.checked).map(c => +c.dataset.cerrada),
      usuarioEstadosHabilitados: $$('[data-habilitado]', sec).filter(c => c.checked).map(c => +c.dataset.habilitado),
    };
    const pre = $('#ref-json', sec);
    pre.textContent = 'referencias: ' + JSON.stringify(nuevo, null, 2);
    pre.hidden = false;
    if (MODO_PRUEBA_DV) { guardarReferenciasPrueba(nuevo); aviso('Guardado en este navegador. Recargá la app para usarlo.', 'ok'); }
  };

  $('#btn-tablas', sec).onclick = async e => {
    e.target.disabled = true;
    const out = [];
    for (const def of [INTERMEDIA, DETALLE]) {
      try {
        const hay = await lectura.columnas(def.tabla);
        const faltan = Object.values(def.columnas).filter(c => !hay.includes(c));
        out.push(`<b>${esc(def.tabla)}</b>: ${faltan.length
          ? `<span style="color:var(--error)">faltan ${faltan.map(esc).join(', ')}</span>` : 'están todas las columnas'}`);
      } catch (err) { out.push(`<b>${esc(def.tabla)}</b>: <span style="color:var(--error)">${esc(err.message)}</span>`); }
    }
    $('#tablas', sec).innerHTML = out.join('<br>');
    e.target.disabled = false;
  };
}
