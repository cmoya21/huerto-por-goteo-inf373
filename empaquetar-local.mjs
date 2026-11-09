import { mkdir, readFile, writeFile } from 'node:fs/promises';
const root = new URL('./', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');
const [html, css, app, math] = await Promise.all(
  ['index.html', 'styles.css', 'app.mjs', 'math.mjs'].map(read)
);
const dataJs = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const inlineApp = app.replace(/(['"])\.\/math\.mjs\1/g, (_, quote) => quote + dataJs(math) + quote);
if (inlineApp === app) throw new Error('La aplicación no importa math.mjs.');
const local = html
  .replace('<link rel="stylesheet" href="./styles.css">', () => '<style>\n' + css + '\n</style>')
  .replace('<script type="module" src="./app.mjs"></script>', () => '<script type="module" src="' + dataJs(inlineApp) + '"></script>');
if (local.includes('href="./styles.css"') || local.includes('src="./app.mjs"')) {
  throw new Error('La copia local todavía depende de archivos externos.');
}
await mkdir(new URL('entrega/', root), { recursive: true });
await writeFile(new URL('entrega/Huerto_por_goteo_simulador.html', root), local, 'utf8');
