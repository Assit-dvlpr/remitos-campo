# Remitos de Campo — Alonger SRL

**Versión 1.0.0** · Desarrollado por Ignacio Burd

App web para que el técnico cargue el remito en campo (servicios y foto del remito firmado) y la oficina solo lo revise.
Al aprobarlo se escriben las filas en el Excel del cliente. Piloto: **Oldelval**.

```
Técnico (celular) → carga ítems + foto → SharePoint (lista + PDF) → Revisor (PC) compara con la foto
→ Aprobar → filas nuevas en "Planilla Carga" (sin tocar fórmulas) → OC y facturación como siempre
```

- La app es solo código (HTML/JS) publicado en GitHub Pages. **Los datos nunca van a GitHub**: remitos, fotos,
  clientes, establecimientos y usuarios quedan en SharePoint, detrás del login de Microsoft 365 de Alonger.
- Sin servidor y sin servicios pagos. Login con MSAL (PKCE) directo desde el navegador.
- Funciona sin señal: el remito queda guardado en el celular y se envía solo al volver la conexión.

## Puesta en marcha (una sola vez)

### 1. Registrar la app en Microsoft Entra
1. <https://entra.microsoft.com> → **Aplicaciones → Registros de aplicaciones → Nuevo registro**.
2. Nombre: `Remitos de Campo`. Cuentas: **solo este directorio (Alonger)**.
3. URI de redirección: plataforma **Aplicación de página única (SPA)**:
   - `https://iburd84.github.io/remitos-campo/`
   - `http://localhost:8080/` (para pruebas)
4. **Permisos de API → Microsoft Graph → Delegados**: `User.Read`, `Sites.ReadWrite.All`, `Files.ReadWrite.All`.
   Si el tenant no deja que los usuarios consientan, tocar **Conceder consentimiento de administrador**.
5. Copiar **Id. de directorio (inquilino)** y **Id. de aplicación (cliente)**.

### 2. Completar `js/config.js`
`tenantId`, `clientId` y el sitio de SharePoint (`host` y `ruta`, por ejemplo `alongersrl.sharepoint.com` y `/sites/RemitosCampo`).
Mientras `clientId` diga `COMPLETAR…`, la app corre en **modo demostración** (datos en el navegador, planilla simulada).

### 3. Configuración dentro de la app (usuario administrador)
Pestaña **Configuración**:
1. **Crear o verificar**: crea la lista *Remitos Campo*, la lista *Usuarios Remitos* y la biblioteca *Remitos Escaneados*.
   Quien lo hace queda como Admin.
2. **Usuarios**: email, nombre como figura en la planilla (Mendoza, Valverdi…) y rol (Tecnico / Revisor / Admin).
3. **Cliente y su Excel**: pegar el vínculo del Excel de Oldelval (Compartir → Copiar vínculo) y tocar
   **Vincular y leer catálogo**: toma los ítems de la tabla de tarifas y los establecimientos de "Control Campaña".
   Revisar la vista previa y **Guardar cliente**.
   > Las primeras pruebas, con una **copia** de la planilla. Recién después vincular la real.

### 4. Publicar
```bash
git init && git add . && git commit -m "Remitos de Campo 1.0.0"
gh repo create iburd84/remitos-campo --public --source . --push
gh api -X POST repos/iburd84/remitos-campo/pages -f "source[branch]=main" -f "source[path]=/"
```
Queda en `https://iburd84.github.io/remitos-campo/`. En el celular: abrir en Chrome → menú → **Agregar a pantalla principal**.

## Uso

**Técnico**: Nuevo remito → número, fecha, establecimiento (la zona sale sola) → servicios con +/− (kilómetros aparte)
→ **Sacar foto** (recortar/girar tocando la foto) → **Enviar remito**. En *Mis remitos* ve el estado; si se lo rechazan,
ve el motivo y toca **Corregir**.

**Revisor**: Revisión → abre un remito → foto a la izquierda, datos a la derecha → corrige lo que haga falta,
completa fecha de solicitud y período → **Aprobar y pasar al Excel** (o **Rechazar** con comentario).
Lo que corrige el revisor tiene prioridad sobre lo que cargó el técnico.

## Cómo escribe en el Excel
- Una fila por servicio, en la primera fila libre de la tabla de carga (`Tabla1` de *Planilla Carga*). Los kilómetros no van.
- Solo escribe las columnas mapeadas (fecha solicitud, remito, fecha remito, ítem, cantidad, establecimiento, período,
  zona, responsable), buscándolas por el **nombre del encabezado**. Las demás no se tocan.
- Copia el formato de la última fila cargada. Si en la fila destino faltan fórmulas que la fila de arriba tiene
  (precio y costo), las completa solo en celdas vacías.
- Si el remito ya está en la planilla, no escribe y avisa. Si el Excel falla, el remito queda *Pendiente Excel* para reintentar.
- Si la tabla se llena, agrega filas al final copiando las fórmulas.

## Archivos
| Archivo | Qué hace |
|---|---|
| `index.html`, `styles.css` | Interfaz (logo y colores de Alonger) |
| `js/config.js` | IDs de Entra y sitio de SharePoint |
| `js/auth.js` | Login Microsoft (MSAL, `vendor/msal-browser-4.30.0.min.js`) |
| `js/graph.js` | SharePoint y Excel por Microsoft Graph |
| `js/excel.js` | Cálculo de qué celdas escribir (lógica pura) |
| `js/demo.js` | Modo demostración |
| `js/pdf.js`, `js/fotos.js` | Foto → recorte/mejora → PDF |
| `js/cola.js` | Guardado en el celular y envío al volver la señal |
| `js/tecnico.js`, `js/revisor.js`, `js/setup.js` | Pantallas |
| `sw.js`, `manifest.webmanifest` | Instalable y uso sin señal |

## Actualizar
Cambiar el código, subir `version` en `js/config.js` y `VERSION` en `sw.js` (así los celulares toman la nueva), y:
```bash
git commit -am "x.y.z: qué cambió" && git push
```

## Límites conocidos (piloto)
- Un solo cliente configurado (Oldelval). Otro cliente = otro bloque en la configuración con su Excel y columnas.
- OC, HES y factura no entran todavía.
- Los roles se controlan en la app; el acceso real a los datos lo dan los permisos del sitio de SharePoint.
- El papel firmado sigue siendo el original.
