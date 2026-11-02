// Utilidades de interfaz: buscar elementos y avisos.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Aviso flotante que se va solo
export function aviso(msg, tipo = '') {
  const el = document.createElement('div');
  el.className = 'aviso ' + tipo;
  el.textContent = msg;
  $('#avisos').append(el);
  setTimeout(() => el.remove(), tipo === 'error' ? 7000 : 4000);
}

// Caja de mensaje: tipo = 'error' | 'alerta' | 'ok'
export const mensaje = (html, tipo) => (html ? `<div class="mensaje ${tipo}">${html}</div>` : '');
