// Configuración, sección 3: alta y edición de un cliente, vínculo con su Excel y lectura del catálogo.
import { QUIEN, ETIQUETA_QUIEN } from '../../../nucleo/constantes.js';
import { estado, recordar } from '../../../nucleo/estado.js';
import { esc } from '../../../nucleo/texto.js';
import { claveDe, claveLibre, mismoId } from '../../../nucleo/ids.js';
import { tablasDeExtras, resolverExtras } from '../../../dominio/extras.js';
import {
  CLIENTE_POR_DEFECTO, ETIQUETAS_COLUMNAS, COLUMNAS_OBLIGATORIAS, prepararItems, esKm,
} from '../../../dominio/catalogo.js';
import { $, $$, aviso } from '../../dom.js';

// Sección 3 de Configuración: un cliente y su Excel. clientes se actualiza en el lugar al guardar o quitar.
export function seccionClientes(sec, clientes) {
  pintarCliente(Object.keys(clientes)[0] || '');

  // clave '' = cliente nuevo
  function pintarCliente(clave) {
    const actual = clientes[clave] || {};
    const c = {
      ...CLIENTE_POR_DEFECTO,
      nombre: actual.nombre || '',
      ...(actual.lectura || {}),
      columnas: { ...CLIENTE_POR_DEFECTO.columnas, ...(actual.excel?.columnas || {}) },
      tabla: actual.excel?.tabla || CLIENTE_POR_DEFECTO.tabla,
    };
    let excel = actual.excel?.itemId ? actual.excel : null;
    let catalogo = actual.items ? { items: actual.items, establecimientos: actual.establecimientos || [] } : null;
    let extras = (actual.extras || []).map(d => ({ ...d }));
    // Vínculo con el sistema principal, siempre por GUID: empresa del cliente y servicio de cada ítem
    const cat = estado.sistema?.catalogos;
    const opcionesId = (lista, sel, nombre = x => x.nombre) => (lista || []).filter(x => x.activo !== false)
      .map(x => `<option value="${esc(x.id)}" ${mismoId(x.id, sel) ? 'selected' : ''}>${esc(nombre(x))}</option>`).join('');
    const nombreServicio = s => `${s.codigo ? s.codigo + ' · ' : ''}${s.nombre}`;
    const filaExtra = d => `<div class="extra dos-col" style="border-top:1px solid var(--borde);padding-top:8px;margin-top:8px">
        <div><label>Nombre</label><input data-k="etiqueta" value="${esc(d.etiqueta || '')}" placeholder="Línea"></div>
        <div><label>Columna en la planilla</label><input data-k="columna" value="${esc(d.columna || '')}" placeholder="LÍNEA"></div>
        <div><label>Lo completa</label><select data-k="quien">
          ${Object.entries(ETIQUETA_QUIEN).map(([v, t]) => `<option value="${v}" ${d.quien === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></div>
        <div><label>Opciones</label><input data-k="origen" value="${esc(d.origen || '')}" placeholder="Tabla3[LINEA] o Coordinación, HSE"></div>
        <div><label><input type="checkbox" data-k="obligatorio" ${d.obligatorio ? 'checked' : ''} style="width:auto;min-height:0"> Obligatorio</label></div>
        <div><button type="button" class="peligro" data-quitar-extra>Quitar campo</button></div>
      </div>`;

    sec.innerHTML = `
      <h2>3. Clientes y su Excel</h2>
      <label for="c-elegir">Cliente</label>
      <select id="c-elegir">
        ${Object.entries(clientes).map(([k, v]) => `<option value="${esc(k)}" ${k === clave ? 'selected' : ''}>${esc(v.nombre)}</option>`).join('')}
        <option value="" ${clave ? '' : 'selected'}>+ Nuevo cliente</option>
      </select>
      <div class="dos-col">
        <div><label for="c-nombre">Nombre del cliente</label><input id="c-nombre" value="${esc(c.nombre)}" placeholder="Ej.: Pan American Energy"></div>
        <div><label for="c-tabla">Tabla de carga</label><input id="c-tabla" value="${esc(c.tabla)}"></div>
      </div>
      ${cat ? `<label for="c-empresa">Empresa en el sistema</label>
      <select id="c-empresa"><option value="">Sin vincular</option>${opcionesId(cat.empresas, actual.empresaId)}</select>
      <p class="ayuda">Con la empresa vinculada, al elegir una interna de esa empresa el cliente se elige solo.</p>` : ''}
      <label for="c-link">Vínculo del Excel (en SharePoint/OneDrive: Compartir → Copiar vínculo)</label>
      <input id="c-link" placeholder="https://…sharepoint.com/…">
      <p class="ayuda" id="c-excel">${excel ? 'Vinculado: <b>' + esc(excel.nombre) + '</b>' : 'Sin Excel vinculado.'}</p>
      <div class="dos-col">
        <div><label for="c-tarifas">Tabla de ítems (tarifas)</label><input id="c-tarifas" value="${esc(c.tablaTarifas)}"></div>
        <div><label for="c-hoja">Hoja de establecimientos (opcional)</label><input id="c-hoja" value="${esc(c.hojaEstab)}"></div>
        <div><label for="c-rango">Rango (zona | establecimiento)</label><input id="c-rango" value="${esc(c.rangoEstab)}"></div>
      </div>
      <p class="ayuda">Sin hoja de establecimientos, el técnico escribe el lugar a mano.</p>
      <details style="margin-top:12px"><summary>Columnas de la planilla (encabezados)</summary>
        <p class="ayuda">Tal cual el encabezado en la planilla. Dejá vacía la que no exista; N° de remito, Ítem y Cantidad son obligatorias.</p>
        ${Object.keys(CLIENTE_POR_DEFECTO.columnas).map(k => `<label for="col-${k}">${ETIQUETAS_COLUMNAS[k]}${COLUMNAS_OBLIGATORIAS.includes(k) ? ' *' : ''}</label><input id="col-${k}" value="${esc(c.columnas[k])}">`).join('')}
      </details>
      <label for="c-resp">Responsable en la planilla</label>
      <select id="c-resp">
        <option value="apellido" ${actual.responsable !== 'completo' ? 'selected' : ''}>Apellido (ej. Valverdi)</option>
        <option value="completo" ${actual.responsable === 'completo' ? 'selected' : ''}>Nombre completo (ej. Nicolas Valverdi)</option>
      </select>
      <p class="ayuda">Si fueron dos técnicos, queda "Apellido - Apellido".</p>
      <details ${extras.length ? 'open' : ''} style="margin-top:12px"><summary>Campos adicionales de este cliente (${extras.length})</summary>
        <p class="ayuda">Columnas propias de su planilla. Opciones: lista separada por comas (<b>Coordinación, HSE</b>)
          o una columna de una tabla del Excel (<b>Tabla3[LINEA]</b>). Automático: <b>Tabla3[CENTRO DE COSTO] según Línea</b>.
          Se leen al tocar "Vincular y leer catálogo".</p>
        <div id="extras">${extras.map(filaExtra).join('')}</div>
        <div class="acciones"><button type="button" id="btn-extra">+ Agregar campo</button></div>
      </details>
      <div class="acciones"><button id="btn-leer" class="primario">Vincular y leer catálogo</button></div>
      <div id="catalogo"></div>
      <div class="acciones">
        <button id="btn-guardar" class="primario" ${catalogo ? '' : 'disabled'}>Guardar cliente</button>
        ${clave ? '<button id="btn-quitar" class="peligro">Quitar cliente</button>' : ''}
      </div>`;

    const pintarCatalogo = () => {
      if (!catalogo) return;
      $('#catalogo', sec).innerHTML = `
        <p class="ayuda"><b>${catalogo.items.length}</b> ítems y <b>${catalogo.establecimientos.length}</b> establecimientos.</p>
        <div class="tabla-scroll"><table class="tabla"><tr><th>Ítem</th><th>Servicio</th><th>A planilla</th>${cat ? '<th>Servicio en el sistema</th>' : ''}</tr>
        ${catalogo.items.map(i => `<tr><td>${esc(i.cod)}</td><td>${esc(i.servicio)}</td><td>${i.planilla === false ? 'No' : 'Sí'}</td>
          ${!cat ? '' : esKm(i) ? '<td>Va en la cabecera</td>'
            : `<td><select data-servicio="${esc(i.cod)}"><option value="">Sin vincular</option>${opcionesId(cat.servicios, i.servicioId, nombreServicio)}</select></td>`}</tr>`).join('')}</table></div>
        ${catalogo.establecimientos.length ? `<div class="tabla-scroll" style="margin-top:8px"><table class="tabla"><tr><th>Zona</th><th>Establecimiento</th></tr>
        ${catalogo.establecimientos.map(e => `<tr><td>${esc(e.zona)}</td><td>${esc(e.nombre)}</td></tr>`).join('')}</table></div>` : ''}
        ${extras.length ? `<div class="tabla-scroll" style="margin-top:8px"><table class="tabla"><tr><th>Campo</th><th>Columna</th><th>Lo completa</th><th>Valores</th></tr>
        ${extras.map(d => `<tr><td>${esc(d.etiqueta)}</td><td>${esc(d.columna)}</td><td>${ETIQUETA_QUIEN[d.quien]}</td>
          <td>${d.quien === QUIEN.AUTO ? `${Object.keys(d.mapa || {}).length} valores según ${esc(extras.find(x => x.campo === d.segun)?.etiqueta || '')}` : esc((d.opciones || []).join(', '))}</td></tr>`).join('')}</table></div>` : ''}`;
    };
    pintarCatalogo();

    // Campos adicionales: leer lo que está en pantalla (las opciones se completan al leer el catálogo)
    const leerExtras = () => $$('#extras .extra', sec).map(div => {
      const v = k => $(`[data-k="${k}"]`, div);
      const etiqueta = v('etiqueta').value.trim();
      return {
        campo: claveDe(etiqueta), etiqueta, columna: v('columna').value.trim(), quien: v('quien').value,
        origen: v('origen').value.trim(), obligatorio: v('obligatorio').checked,
      };
    }).filter(d => d.etiqueta && d.columna);
    $('#btn-extra', sec).onclick = () => {
      $('#extras', sec).insertAdjacentHTML('beforeend', filaExtra({ quien: QUIEN.TECNICO }));
      $('#btn-guardar', sec).disabled = true; // hay que volver a leer el catálogo
    };
    $('#extras', sec).addEventListener('click', e => {
      if (!e.target.closest('[data-quitar-extra]')) return;
      e.target.closest('.extra').remove();
      $('#btn-guardar', sec).disabled = true;
    });
    $('#extras', sec).addEventListener('input', () => { $('#btn-guardar', sec).disabled = true; });

    const lectura = () => ({
      tablaTarifas: $('#c-tarifas', sec).value.trim(),
      hojaEstab: $('#c-hoja', sec).value.trim(),
      rangoEstab: $('#c-rango', sec).value.trim(),
    });

    $('#c-elegir', sec).onchange = e => pintarCliente(e.target.value);

    $('#btn-leer', sec).onclick = async e => {
      e.target.disabled = true;
      // Lo leído antes no vale para el Excel nuevo: se limpia hasta que la lectura termine bien
      catalogo = null;
      $('#catalogo', sec).innerHTML = '<p class="ayuda">Leyendo el Excel…</p>';
      $('#btn-guardar', sec).disabled = true;
      try {
        const link = $('#c-link', sec).value.trim();
        if (link) excel = await estado.api.resolverExcel(link);
        if (!excel && estado.api.modo !== 'demo') throw new Error('Pegá el vínculo del Excel.');
        $('#c-excel', sec).innerHTML = excel ? 'Vinculado: <b>' + esc(excel.nombre) + '</b>' : '';
        catalogo = await estado.api.leerCatalogo(excel, lectura());
        if (!catalogo.items.length) throw new Error('No se encontraron ítems en la tabla de tarifas.');
        // Kilómetros: si el cliente los factura como ítem (ej. "KM RECORRIDO"), se usa ese y va a la planilla;
        // si no, se agrega uno propio que solo queda registrado en el remito
        prepararItems(catalogo.items);
        // El vínculo de cada ítem con su servicio del sistema se conserva al volver a leer el Excel
        for (const it of catalogo.items) it.servicioId = (actual.items || []).find(x => String(x.cod) === String(it.cod))?.servicioId || '';
        // Campos adicionales: opciones y valores automáticos desde las tablas del Excel
        const defs = leerExtras();
        if (defs.length) {
          const tablas = {};
          for (const t of tablasDeExtras(defs)) tablas[t] = await estado.api.leerTabla(excel, t);
          const r = resolverExtras(defs, tablas);
          if (r.error) throw new Error(r.error);
          extras = r.extras;
        } else extras = [];
        pintarCatalogo();
        $('#btn-guardar', sec).disabled = false;
      } catch (err) {
        catalogo = null;
        $('#catalogo', sec).innerHTML = `<div class="mensaje error">${esc(err.message)}</div>`;
      }
      finally { e.target.disabled = false; }
    };

    $('#btn-guardar', sec).onclick = async () => {
      const nombre = $('#c-nombre', sec).value.trim();
      if (!nombre) { aviso('Poné el nombre del cliente.', 'error'); return; }
      const columnas = Object.fromEntries(Object.keys(CLIENTE_POR_DEFECTO.columnas).map(k => [k, $('#col-' + k, sec).value.trim()]));
      const faltan = COLUMNAS_OBLIGATORIAS.filter(k => !columnas[k]).map(k => ETIQUETAS_COLUMNAS[k]);
      if (faltan.length) { aviso('Faltan columnas obligatorias: ' + faltan.join(', '), 'error'); return; }
      // Un cliente nuevo toma una clave del nombre, sin pisar otro existente
      const k = clave || claveLibre(nombre, clientes);
      // Servicio del sistema elegido para cada ítem (GUID)
      const items = catalogo.items.map(i => {
        const sel = $(`[data-servicio="${CSS.escape(String(i.cod))}"]`, sec);
        return sel ? { ...i, servicioId: sel.value } : i;
      });
      const nuevos = {
        ...clientes,
        [k]: {
          nombre,
          items,
          empresaId: $('#c-empresa', sec)?.value ?? actual.empresaId ?? '',
          establecimientos: catalogo.establecimientos,
          lectura: lectura(),
          excel: { ...(excel || {}), tabla: $('#c-tabla', sec).value.trim(), columnas },
          extras,
          responsable: $('#c-resp', sec).value,
        },
      };
      try {
        await estado.api.guardarClientes(nuevos);
        Object.assign(clientes, nuevos);
        estado.clientes = recordar('clientes', nuevos);
        estado.errorClientes = null;
        aviso(`Cliente "${nombre}" guardado.`, 'ok');
        pintarCliente(k);
      } catch (err) { aviso(err.message, 'error'); }
    };

    $('#btn-quitar', sec)?.addEventListener('click', async () => {
      if (!confirm(`¿Quitar el cliente "${actual.nombre}" de la app? No borra su Excel ni sus remitos.`)) return;
      const nuevos = { ...clientes };
      delete nuevos[clave];
      try {
        await estado.api.guardarClientes(nuevos);
        delete clientes[clave];
        estado.clientes = recordar('clientes', nuevos);
        aviso('Cliente quitado.', 'ok');
        pintarCliente(Object.keys(clientes)[0] || '');
      } catch (err) { aviso(err.message, 'error'); }
    });
  }
}
