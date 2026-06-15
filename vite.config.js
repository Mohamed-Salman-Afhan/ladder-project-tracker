import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  // Mirror server-only vars onto process.env so the shared api/_createUser.js
  // core (which reads process.env) works under the dev middleware too.
  process.env.VITE_SUPABASE_URL ||= env.VITE_SUPABASE_URL
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY
  process.env.ADMIN_EMAILS ||= env.ADMIN_EMAILS

  return {
    plugins: [
      react(),
      {
        name: 'api-dev',
        configureServer(server) {
          server.middlewares.use('/api/create-user', (req, res) => {
            if (req.method !== 'POST') {
              res.writeHead(405, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
              return;
            }
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const parsed = JSON.parse(body || '{}');
                const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
                const { createUserCore } = await import('./api/_createUser.js');
                const { status, body: out } = await createUserCore({ token, email: parsed.email, role: parsed.role });
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(out));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
              }
            });
          });
          server.middlewares.use('/api/sync-sheets', (req, res) => {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', async () => {
              try {
                const url = env.GOOGLE_SHEETS_URL;
                const secret = env.GOOGLE_SHEETS_SECRET;
                const parsed = JSON.parse(body);

                if (!url?.startsWith('https://script.google.com/')) {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: false, error: 'Sheets integration not configured.' }));
                  return;
                }
                if (!Array.isArray(parsed.projects) && !parsed.project && parsed.action !== 'delete') {
                  res.writeHead(400, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ ok: false, error: 'Invalid request.' }));
                  return;
                }

                const r = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ secret, ...parsed }),
                });
                const data = await r.json();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(data));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
              }
            });
          });
        },
      },
    ],
  }
})
