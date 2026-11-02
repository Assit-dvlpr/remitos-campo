// Fuente de datos real: SharePoint y el Excel del cliente por Microsoft Graph, con la sesión del usuario.
// Cumple el mismo contrato que datos/demo.js (ver datos/contrato.js).
import { CONFIG } from '../../nucleo/config.js';
import { CODIGOS, ESTADOS, ROLES, LISTA_ROLES, errorCon } from '../../nucleo/constantes.js';
import { planificarEscritura, filasDeRemito, columnasCliente } from '../../dominio/planilla.js';
import { itemsDeTarifas, establecimientosDeRango } from '../../dominio/catalogo.js';
import { g, todasLasPaginas } from './http.js';
import { sitioId, listaId, buscarLista, driveId, olvidarListas } from './sitio.js';
import { rutaArchivo, nombreSeguro, carpetaMes, nombrePdf, subirArchivo, descargar } from './archivos.js';
import { aCampos, remitosDonde, rutaRemitos } from './listas.js';
import { wb, comillas, conSesion, leerRango, leerTablaEntera } from './excel.js';

export const api = {
  modo: 'sharepoint',

  // ---------- Usuario y clientes ----------

  async usuario() {
    const yo = await g('/me?$select=displayName,givenName,surname,mail,userPrincipalName');
    const email = (yo.mail || yo.userPrincipalName || '').toLowerCase();
    let fila = null;
    try {
      const sid = await sitioId();
      const lid = await listaId(CONFIG.listaUsuarios);
      const items = await todasLasPaginas(`/sites/${sid}/lists/${lid}/items?$expand=fields&$top=500`);
      fila = items.map(i => i.fields).find(f => (f.Title || '').toLowerCase() === email);
    } catch (e) {
      if (e.status === 403 || e.status === 404) {
        throw new Error(`Tu cuenta (${email}) no tiene acceso al sitio de SharePoint "${CONFIG.sitio.ruta.split('/').pop()}". ` +
          'Pedile al propietario del sitio que te agregue como miembro y volvé a entrar.');
      }
      if (e.codigo !== CODIGOS.SIN_CONFIGURAR) throw e;
      return { email, displayName: yo.displayName, nombre: yo.surname || yo.displayName, rol: ROLES.ADMIN, sinConfigurar: true };
    }
    return {
      email,
      displayName: yo.displayName,
      nombre: fila?.NombrePlanilla || yo.surname || yo.displayName,
      rol: fila?.Rol || ROLES.TECNICO,
    };
  },

  async leerClientes() {
    const did = await driveId();
    try {
      const it = await g(`/drives/${did}/root:/${rutaArchivo(CONFIG.archivoConfig)}`);
      const j = JSON.parse(await (await descargar(did, it.id)).text()); // descargar devuelve un Blob
      return j.clientes;
    } catch (e) {
      if (e.status === 404) throw errorCon('Falta la configuración de clientes. Un administrador debe correr la Configuración.', { codigo: CODIGOS.SIN_CONFIGURAR });
      throw e;
    }
  },

  async guardarClientes(clientes) {
    const blob = new Blob([JSON.stringify({ clientes }, null, 2)], { type: 'application/json' });
    await subirArchivo(CONFIG.archivoConfig, blob);
  },

  // ---------- Remitos ----------

  async buscarRemito(nro) {
    return (await remitosDonde('Remito', nro))[0] || null;
  },

  // e = { idLocal, itemId?, datos, pdf? }
  async enviarRemito(e) {
    const d = e.datos;
    const existente = await this.buscarRemito(d.remito);
    if (existente && existente.idLocal !== e.idLocal && existente.id !== e.itemId) {
      throw errorCon(`El remito ${d.remito} ya fue cargado por ${existente.tecnico}.`, { codigo: CODIGOS.DUPLICADO });
    }
    const id = e.itemId || existente?.id;
    const datos = { ...d, idLocal: e.idLocal, estado: ESTADOS.PENDIENTE, comentario: '' };
    if (e.pdf) {
      const ruta = `${nombreSeguro(d.clienteNombre || d.cliente)}/${carpetaMes(d.fechaRemito)}/${nombrePdf(d, d.clienteNombre || d.cliente)}`;
      const arch = await subirArchivo(ruta, e.pdf);
      datos.archivoId = arch.id;
      datos.archivoUrl = arch.webUrl;
    }
    const lista = await rutaRemitos();
    if (id) {
      const campos = aCampos(datos);
      if (!e.pdf) { delete campos.ArchivoId; delete campos.ArchivoUrl; }
      await g(`${lista}/items/${id}/fields`, { method: 'PATCH', body: campos });
    } else {
      await g(`${lista}/items`, { method: 'POST', body: { fields: aCampos(datos) } });
    }
  },

  async misRemitos(email) {
    return (await remitosDonde('TecnicoEmail', email))
      .sort((a, b) => (b.creado || '').localeCompare(a.creado || ''));
  },

  async pendientes() {
    const [a, b] = await Promise.all([remitosDonde('Estado', ESTADOS.PENDIENTE), remitosDonde('Estado', ESTADOS.PENDIENTE_EXCEL)]);
    return [...a, ...b].sort((x, y) => (x.creado || '').localeCompare(y.creado || ''));
  },

  async pdf(remito) {
    if (!remito.archivoId) return null;
    return descargar(await driveId(), remito.archivoId);
  },

  async actualizar(remito) {
    const campos = aCampos(remito);
    delete campos.IdLocal;
    await g(`${await rutaRemitos()}/items/${remito.id}/fields`, { method: 'PATCH', body: campos });
  },

  // ---------- Excel del cliente ----------

  // Escribe el remito en la planilla del cliente. Devuelve "desde-hasta".
  async escribirExcel(cliente, remito) {
    const ex = cliente.excel;
    const filas = filasDeRemito(remito, cliente.items);
    return conSesion(ex, async h => {
      const t = `${wb(ex)}/tables('${comillas(ex.tabla)}')`;
      const [enc, cuerpo] = await Promise.all([
        g(`${t}/headerRowRange?$select=values`, { headers: h }),
        g(`${t}/dataBodyRange?$select=address,formulas,numberFormat`, { headers: h }),
      ]);
      const plan = planificarEscritura({
        encabezados: enc.values[0], cuerpo: cuerpo.formulas, formatos: cuerpo.numberFormat,
        direccion: cuerpo.address, columnas: columnasCliente(cliente), filas,
      });
      if (plan.error) throw errorCon(plan.error, { codigo: plan.duplicado ? CODIGOS.DUPLICADO : CODIGOS.PLANILLA });
      for (const { address, ...cambios } of plan.escrituras) {
        await g(`${wb(ex)}/worksheets('${comillas(plan.hoja)}')/range(address='${address}')`, {
          method: 'PATCH', body: cambios, headers: h,
        });
      }
      if (plan.agregar.length) {
        await g(`${t}/rows/add`, { method: 'POST', body: { values: plan.agregar }, headers: h });
      }
      return `${plan.desde}-${plan.hasta}`;
    });
  },

  // Copia el PDF aprobado al lado del Excel del cliente, con los datos ya revisados en el nombre.
  // Devuelve el link del archivo copiado.
  async archivarPdf(cliente, remito) {
    if (!remito.archivoId) throw new Error('El remito no tiene foto.');
    const ex = cliente.excel;
    const blob = await descargar(await driveId(), remito.archivoId);
    const padre = (await g(`/drives/${ex.driveId}/items/${ex.itemId}?$select=parentReference`)).parentReference.id;
    const ruta = `Remitos ${nombreSeguro(cliente.nombre)}/${carpetaMes(remito.fechaRemito)}/${nombrePdf(remito, cliente.nombre)}`;
    const it = await subirArchivo(ruta, new Blob([blob], { type: 'application/pdf' }), { drive: ex.driveId, carpeta: padre });
    return it.webUrl;
  },

  // ---------- Configuración inicial ----------

  async crearEstructura(alAvanzar) {
    const sid = await sitioId();
    const texto = (name, extra = {}) => ({ name, text: {}, ...extra });
    const fecha = name => ({ name, dateTime: { format: 'dateOnly' } });
    const largo = name => ({ name, text: { allowMultipleLines: true } });
    const definiciones = [
      {
        displayName: CONFIG.listaRemitos, list: { template: 'genericList' },
        columns: [
          texto('Remito', { indexed: true }), texto('Cliente'), texto('Establecimiento'), texto('Zona'),
          fecha('FechaRemito'), fecha('FechaSolicitud'), texto('Periodo'),
          texto('Tecnico'), texto('TecnicoEmail', { indexed: true }), largo('Items'),
          { name: 'Kilometros', number: {} }, largo('Observaciones'),
          { name: 'Estado', indexed: true, choice: { choices: Object.values(ESTADOS) } },
          largo('ComentarioRevision'), texto('Revisor'), { name: 'FechaRevision', dateTime: {} },
          texto('ArchivoId'), texto('ArchivoUrl'), texto('FilasExcel'), texto('IdLocal'),
        ],
      },
      {
        displayName: CONFIG.listaUsuarios, list: { template: 'genericList' },
        columns: [texto('NombrePlanilla'), { name: 'Rol', choice: { choices: LISTA_ROLES } }],
      },
      { displayName: CONFIG.biblioteca, list: { template: 'documentLibrary' } },
    ];
    for (const def of definiciones) {
      if (await buscarLista(def.displayName)) { alAvanzar?.(`"${def.displayName}" ya existía.`); continue; }
      // Crear listas requiere Sites.Manage.All (Sites.ReadWrite.All solo trabaja dentro de ellas)
      await g(`/sites/${sid}/lists`, { method: 'POST', body: def, scopes: CONFIG.scopesConfiguracion });
      alAvanzar?.(`Creada "${def.displayName}".`);
    }
    olvidarListas();
  },

  async agregarUsuario(email, nombrePlanilla, rol) {
    const sid = await sitioId();
    const lid = await listaId(CONFIG.listaUsuarios);
    await g(`/sites/${sid}/lists/${lid}/items`, {
      method: 'POST', body: { fields: { Title: email.toLowerCase(), NombrePlanilla: nombrePlanilla, Rol: rol } },
    });
  },

  async urlLista(nombre) { return (await buscarLista(nombre))?.webUrl; },

  // Resuelve el link "Compartir/Copiar vínculo" del Excel
  async resolverExcel(link) {
    const b64 = btoa(unescape(encodeURIComponent(link.trim()))).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
    const it = await g(`/shares/u!${b64}/driveItem?$select=id,name,webUrl,parentReference`)
      .catch(e => { throw new Error('No se pudo abrir el vínculo del Excel. Copialo de nuevo desde SharePoint (··· → Copiar vínculo). ' + e.message); });
    return { driveId: it.parentReference.driveId, itemId: it.id, nombre: it.name, webUrl: it.webUrl };
  },

  // Lee una tabla auxiliar completa (para las opciones de los campos adicionales)
  async leerTabla(excel, tabla) {
    return conSesion(excel, async h => {
      const v = await leerTablaEntera(excel, tabla, h)
        .catch(e => { throw new Error(`No se encontró la tabla "${tabla}" de un campo adicional en "${excel.nombre}". ${e.status === 404 ? '' : e.message}`); });
      return { encabezados: v[0], filas: v.slice(1) };
    });
  },

  // Lee ítems (tabla de tarifas) y establecimientos (hoja y rango) desde el mismo Excel
  async leerCatalogo(excel, { tablaTarifas, hojaEstab, rangoEstab }) {
    return conSesion(excel, async h => {
      const enExcel = `en "${excel.nombre}"`;
      const tar = await leerTablaEntera(excel, tablaTarifas, h)
        .catch(e => { throw new Error(`No se encontró la tabla de ítems "${tablaTarifas}" ${enExcel}. ${e.status === 404 ? '' : e.message}`); });
      // Establecimientos opcionales: sin hoja o rango, el técnico escribe el lugar a mano
      const est = hojaEstab && rangoEstab
        ? await leerRango(excel, hojaEstab, rangoEstab, h).catch(e => {
          throw new Error(`No se encontró la hoja "${hojaEstab}" ${enExcel}. Si este cliente no tiene lista de establecimientos, dejá la hoja vacía. ${e.status === 404 ? '' : e.message}`);
        })
        : [];
      return { items: itemsDeTarifas(tar), establecimientos: establecimientosDeRango(est) };
    });
  },
};
