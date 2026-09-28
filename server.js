const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3344;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

const SEARCH_DIRS = [
  process.cwd(),
  __dirname,
  path.join(process.cwd(), 'public'),
  path.join(__dirname, 'public'),
  path.join(process.cwd(), 'advts'),
  path.join(__dirname, 'advts')
];

function resolveFile(pathname) {
  // Normalize pathname
  if (pathname.startsWith('/advts/')) {
    pathname = pathname.substring(6);
  } else if (pathname === '/advts') {
    pathname = '/';
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const safeRel = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '').replace(/^[\/\\]+/, '');

  const candidates = [
    safeRel,
    safeRel + '.html',
    path.join(safeRel, 'index.html')
  ];

  for (const baseDir of SEARCH_DIRS) {
    for (const rel of candidates) {
      try {
        const fullPath = path.join(baseDir, rel);
        if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
          return fullPath;
        }
      } catch (e) {}
    }
  }
  return null;
}

const handler = (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost:3344'}`);
    const filePath = resolveFile(parsedUrl.pathname);

    if (!filePath) {
      // Fallback: If not found, try serving index.html (SPA fallback)
      const fallback = resolveFile('/index.html');
      if (fallback) {
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=0, must-revalidate'
        });
        fs.createReadStream(fallback).pipe(res);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.html' ? 'public, max-age=0, must-revalidate' : 'public, max-age=31536000, immutable'
    });

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server Error: ' + err.message);
  }
};

const server = http.createServer(handler);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
  });
}

module.exports = handler;
