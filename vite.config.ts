import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, type Plugin } from 'vite';

/**
  Solo en desarrollo: guarda en public/ la imagen que genera el propio juego.
  Desde la consola del navegador:  await __slime.saveShareImage()
  (el juego pinta la escena del menú con el título y aquí se escribe el fichero)
*/
function saveShareImage(): Plugin {
  return {
    name: 'slime-save-share-image',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__share-image', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end('solo POST'); }
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const data = body.replace(/^data:image\/\w+;base64,/, '');
          const out = join(server.config.root, 'public', 'og-image.jpg');
          writeFileSync(out, Buffer.from(data, 'base64'));
          res.end(out);
        });
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [saveShareImage()],
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
