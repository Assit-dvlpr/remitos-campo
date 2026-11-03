// Configuración de la app. Lo único que hay que completar al instalar.
// Estos datos NO son secretos (el tenant y el client ID de una app SPA son públicos).
// Los datos de remitos, fotos, clientes y usuarios viven en SharePoint, nunca en este repo.

export const CONFIG = {
  version: '1.5.3',

  // Microsoft Entra (registro de la app, tipo SPA)
  tenantId: 'ad9b3575-dfa1-4374-83ee-797ea46ee8da',
  clientId: '6accec4b-39ef-40c6-9bd8-f861b007bb38',
  scopes: ['User.Read', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'],
  // Solo para la pantalla de Configuración: crear listas, columnas y biblioteca
  scopesConfiguracion: ['Sites.Manage.All'],

  // Sitio de SharePoint del piloto, ej. host 'alongersrl.sharepoint.com', ruta '/sites/RemitosCampo'
  sitio: {
    host: 'alongercomar.sharepoint.com',
    ruta: '/sites/RemitosCampo',
  },

  // Dataverse del sistema principal (ALO Manager). Las tablas del sistema solo se leen.
  // El permiso real lo da el rol de seguridad de Dataverse de cada usuario.
  // activo: leer catálogos (false hasta que en Entra esté el permiso de Dynamics CRM y el rol de lectura).
  // escribir: al aprobar, pasar el remito a la tabla intermedia "Remito de campo" (única tabla que se escribe),
  //   de donde lo importa ALO Manager. false hasta que la tabla exista y los revisores tengan el rol.
  // En modo demostración siempre se usa, con datos inventados.
  dataverse: {
    activo: false,
    escribir: false,
    url: 'https://orgb73a9f30.crm2.dynamics.com',
    // Las decisiones se toman por GUID o por el valor numérico de cada opción, nunca por el texto.
    // Se completan una vez, leyendo el entorno (ver la especificación). Vacío = la app no arranca con Dataverse.
    referencias: {
      sectorElectricoId: '',             // GUID del sector Seguridad eléctrica (cr1d0_generalsectores)
      internaEstadosCerrados: [],        // valores de cr1d0_estadooperativo que no admiten remitos (Finalizada, Cancelada…)
      usuarioEstadosHabilitados: [],     // valores de cr1d0_estado del usuario que dejan entrar (Activo)
    },
    // Carpeta común de remitos de ALO Manager: ahí va la foto del remito aprobado, con el mismo formato de nombre
    carpetaRemitos: { host: 'alongercomar.sharepoint.com', sitio: '/sites/ALOManager', biblioteca: '/sites/ALOManager/Documentos compartidos', carpeta: 'Remitos' },
    // Valores de las opciones de la tabla intermedia (se ven al crear la columna en Power Apps)
    intermedia: {
      estado: { pendiente: 159370000, aprobado: 159370003 }, // Rechazado 159370001 y Revisado 159370002 los usa ALO Manager
      tipo: { servicio: 159370000, stock: 159370001, reutilizado: 159370002, recuperado: 159370003 },
    },
  },

  // Nombres de listas y biblioteca que crea la pantalla de Configuración
  listaRemitos: 'Remitos Campo',
  listaUsuarios: 'Usuarios Remitos',
  biblioteca: 'Remitos Escaneados',
  archivoConfig: '_config/clientes.json',
};

// Sin Entra configurado (o con ?demo=1) la app corre en modo demostración:
// guarda en el navegador y simula la planilla, para probar la interfaz.
export const MODO_DEMO =
  CONFIG.clientId.startsWith('COMPLETAR') || CONFIG.sitio.host.startsWith('COMPLETAR') ||
  new URLSearchParams(location.search).has('demo');

// Prueba de Dataverse (?prueba): login real y Dataverse real, pero SharePoint y los Excel simulados en el navegador.
// Sirve para probar catálogos, internas, materiales y la tabla intermedia sin tocar las listas ni las planillas.
export const MODO_PRUEBA_DV = !MODO_DEMO && new URLSearchParams(location.search).has('prueba');
