// Controles de seguridad de index.html: el hash de la librería de login coincide y la política de contenido está.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('el integrity de MSAL coincide con el archivo de vendor', () => {
  const [, archivo, hash] = html.match(/<script src="(vendor\/[^"]+)" integrity="sha384-([^"]+)"/);
  const real = createHash('sha384').update(readFileSync(new URL('../' + archivo, import.meta.url))).digest('base64');
  assert.equal(hash, real, `Actualizá el integrity de ${archivo} en index.html`);
});

test('la política de contenido no permite scripts de afuera ni inline', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1] || '';
  const script = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src'));
  // 'wasm-unsafe-eval' solo habilita WebAssembly (lector del N° de remito); no permite eval de JavaScript
  assert.equal(script, "script-src 'self' 'wasm-unsafe-eval'");
  assert.match(csp, /object-src 'none'/);
});
