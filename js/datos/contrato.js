// Contrato de una fuente de datos: lo que tienen que tener datos/sharepoint/api.js y datos/demo.js.
// Se verifica al arrancar, así una función faltante se nota enseguida y no en medio de un remito.

export const METODOS = [
  // Usuario y clientes
  'usuario', 'leerClientes', 'guardarClientes',
  // Remitos
  'buscarRemito', 'enviarRemito', 'misRemitos', 'pendientes', 'pdf', 'actualizar',
  // Excel del cliente
  'escribirExcel', 'archivarPdf',
  // Configuración
  'crearEstructura', 'agregarUsuario', 'urlLista', 'resolverExcel', 'leerTabla', 'leerCatalogo',
];

export function verificarApi(api) {
  const faltan = METODOS.filter(m => typeof api?.[m] !== 'function');
  if (faltan.length) throw new Error(`La fuente de datos "${api?.modo}" no tiene: ${faltan.join(', ')}.`);
  return api;
}
