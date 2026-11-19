import type { IncomingMessage, ServerResponse } from 'http';
import { createApiApp } from '../lib/api-app.ts';

let cachedApp: ReturnType<typeof createApiApp> | null = null;

function getApp() {
  if (!cachedApp) {
    cachedApp = createApiApp();
  }
  return cachedApp;
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    const parsed = new URL(req.url || '/', 'http://localhost');
    const rewrittenPath = parsed.searchParams.get('__path');

    if (rewrittenPath !== null) {
      parsed.searchParams.delete('__path');
      if (parsed.pathname === '/api' || parsed.pathname === '/api/index') {
        const normalized = rewrittenPath.replace(/^\/+/, '');
        parsed.pathname = normalized ? `/api/${normalized}` : '/api';
      }
      req.url = `${parsed.pathname}${parsed.search}`;
    }

    const app = getApp();
    return app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
  } catch (error) {
    console.error('Vercel API handler error:', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}
