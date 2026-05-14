import http from 'http';
import { URL } from 'url';

import indexHandler from './api/index.js';
import healthHandler from './api/health.js';
import mealsHandler from './api/meals.js';
import mealsRealtimeHandler from './api/meals-realtime.js';
import mealsByCityHandler from './api/meals-by-city.js';

const PORT = Number(process.env.PORT) || 3000;

/** Mimic Vercel-style `res.status().json()` / `.end()` on Node's ServerResponse */
function vercelizeRes(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify(body));
  };
  const origEnd = res.end.bind(res);
  res.end = (...args) => {
    if (args.length === 0 || args[0] === undefined) {
      return origEnd();
    }
    return origEnd(...args);
  };
}

const routes = new Map([
  ['/api', indexHandler],
  ['/api/', indexHandler],
  ['/api/index', indexHandler],
  ['/api/health', healthHandler],
  ['/api/meals', mealsHandler],
  ['/api/meals-realtime', mealsRealtimeHandler],
  ['/api/meals-by-city', mealsByCityHandler],
]);

const server = http.createServer(async (req, res) => {
  vercelizeRes(res);

  const host = req.headers.host || `localhost:${PORT}`;
  const url = new URL(req.url || '/', `http://${host}`);
  let pathname = url.pathname.replace(/\/$/, '') || '/';
  if (pathname !== '/' && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  const handler =
    pathname === '/' ? healthHandler : routes.get(pathname);
  if (!handler) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found', path: pathname }));
    return;
  }

  const query = Object.fromEntries(url.searchParams.entries());
  const vercelReq = {
    method: req.method || 'GET',
    query,
    headers: req.headers,
  };

  try {
    await handler(vercelReq, res);
  } catch (e) {
    console.error(e);
    if (!res.writableEnded) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: String(e?.message || e) }));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Pluxee API (local): http://localhost:${PORT}/api/health`);
});
