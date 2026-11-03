// Estado compartido de la sesión y lo que se recuerda en el navegador.

// api: SharePoint o demo · usuario: { email, displayName, nombre, rol } · clientes: { clave: cliente }
// sistema: datos del sistema principal (Dataverse) { usuario, sector, electrico, catalogos } o null si no se usa
export const estado = { api: null, usuario: null, clientes: null, sistema: null };

// recordar(clave) lee; recordar(clave, valor) guarda y devuelve el valor. Sin almacenamiento, no falla.
export function recordar(clave, valor) {
  try {
    if (valor === undefined) return JSON.parse(localStorage.getItem('rc-' + clave));
    localStorage.setItem('rc-' + clave, JSON.stringify(valor));
  } catch { return null; }
  return valor;
}
