// Valores fijos que se repiten en toda la app. Si cambia uno, cambia acá y en la lista de SharePoint.

export const ESTADOS = Object.freeze({
  PENDIENTE: 'Pendiente',
  PENDIENTE_EXCEL: 'Pendiente Excel',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
});
// Estados que esperan acción de la oficina
export const ESTADOS_EN_REVISION = [ESTADOS.PENDIENTE, ESTADOS.PENDIENTE_EXCEL];

export const ROLES = Object.freeze({ TECNICO: 'Tecnico', REVISOR: 'Revisor', ADMIN: 'Admin' });
export const LISTA_ROLES = [ROLES.TECNICO, ROLES.REVISOR, ROLES.ADMIN];

// Quién completa un campo adicional del cliente
export const QUIEN = Object.freeze({ TECNICO: 'tecnico', REVISOR: 'revisor', AUTO: 'auto' });
export const ETIQUETA_QUIEN = { tecnico: 'Técnico', revisor: 'Revisor', auto: 'Automático' };

// Errores con código que la interfaz trata distinto
export const CODIGOS = Object.freeze({ DUPLICADO: 'duplicado', SIN_CONFIGURAR: 'sinConfigurar', PLANILLA: 'planilla' });

// Crea un Error con código (y otros datos) para que la interfaz pueda reconocerlo
export const errorCon = (mensaje, datos) => Object.assign(new Error(mensaje), datos);
