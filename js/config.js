// Configuración de la app. Lo único que hay que completar al instalar.
// Estos datos NO son secretos (el tenant y el client ID de una app SPA son públicos).
// Los datos de remitos, fotos, clientes y usuarios viven en SharePoint, nunca en este repo.

export const CONFIG = {
  version: '1.0.0',

  // Microsoft Entra (registro de la app, tipo SPA)
  tenantId: 'COMPLETAR_TENANT_ID',
  clientId: 'COMPLETAR_CLIENT_ID',
  scopes: ['User.Read', 'Sites.ReadWrite.All', 'Files.ReadWrite.All'],

  // Sitio de SharePoint del piloto, ej. host 'alongersrl.sharepoint.com', ruta '/sites/RemitosCampo'
  sitio: {
    host: 'COMPLETAR.sharepoint.com',
    ruta: '/sites/COMPLETAR',
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
  CONFIG.clientId.startsWith('COMPLETAR') || new URLSearchParams(location.search).has('demo');
