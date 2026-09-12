import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../design-system/', import.meta.url);
const files = {
  '/': ['index.html', 'text/html'], '/index.html': ['index.html', 'text/html'],
  '/styles.css': ['styles.css', 'text/css'], '/app.js': ['app.js', 'text/javascript'],
  '/tokens.js': ['tokens.js', 'text/javascript'],
};
const server = createServer(async (req, res) => {
  const entry = files[new URL(req.url || '/', 'http://localhost').pathname];
  if (!entry) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const body = await readFile(fileURLToPath(new URL(entry[0], root)));
    res.writeHead(200, { 'Content-Type': `${entry[1]}; charset=utf-8`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(body);
  } catch { res.writeHead(500); res.end('Unable to load application'); }
});
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => console.log('Accessible Design System: http://127.0.0.1:' + server.address().port));
