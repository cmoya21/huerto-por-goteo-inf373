import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

const assets = new Set(['index.html', 'styles.css', 'app.mjs', 'math.mjs']);
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8'
};
const port = Number(process.env.PORT ?? 8774);
createServer(async (req, res) => {
  const route = new URL(req.url, 'http://127.0.0.1').pathname;
  const file = route === '/' ? 'index.html' : route.slice(1);
  if (!assets.has(file)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(new URL('./' + file, import.meta.url));
    res.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-store' });
    res.end(content);
  } catch {
    res.writeHead(500).end('No se pudo leer el archivo.');
  }
}).listen(port, '127.0.0.1', () => console.log('Huerto por goteo · http://127.0.0.1:' + port + '/'));
