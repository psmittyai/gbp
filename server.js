'use strict';
// server.js — GetBotPacks (GBP) standalone server
// Serves getbotpacks.com landing page, blog, get-started, affiliate
// Proxies /api/boards/* and /api/auth/* to Pal Railway app
// Completely separate from mich-live (RAAI/Zigueme)

const express = require('express');
const path    = require('path');
const fetch   = require('node-fetch');

const app  = express();
const PORT = process.env.PORT || 3200;

// Pal Railway app — handles all board/auth/chat APIs
const PAL_URL = process.env.PAL_RAILWAY_URL || 'https://wonderful-spontaneity-production-2f1f.up.railway.app';

app.set('trust proxy', 1);
app.use(express.json({ limit: '8mb' }));

// ── Security headers ───────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── Health check ───────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, service: 'gbp' }));

// ── Proxy all /api/* to Pal Railway ───────────────────────────
// Pal Railway handles: /api/boards/provision, /api/auth/*, /api/slug-check, etc.
app.all('/api/*', async (req, res) => {
  try {
    const targetUrl = `${PAL_URL}${req.url}`;
    const headers = {
      'content-type': req.headers['content-type'] || 'application/json',
      'x-forwarded-for': req.ip,
      'x-forwarded-host': 'getbotpacks.com',
    };
    if (req.headers.cookie) headers.cookie = req.headers.cookie;

    const proxyRes = await fetch(targetUrl, {
      method:  req.method,
      headers,
      body:    ['GET','HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
    });

    // Forward status + headers
    const setCookie = proxyRes.headers.get('set-cookie');
    if (setCookie) res.setHeader('set-cookie', setCookie);

    const contentType = proxyRes.headers.get('content-type') || 'application/json';
    res.setHeader('content-type', contentType);
    res.status(proxyRes.status);

    // SSE / streaming response — pipe directly, never buffer
    if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
      res.setHeader('cache-control', 'no-cache');
      res.setHeader('x-accel-buffering', 'no'); // disable nginx buffering
      res.flushHeaders();
      const reader = proxyRes.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { res.end(); break; }
          res.write(Buffer.from(value));
        }
      };
      await pump();
    } else if (contentType.includes('application/json')) {
      const data = await proxyRes.json();
      res.json(data);
    } else {
      const buf = await proxyRes.arrayBuffer();
      res.send(Buffer.from(buf));
    }
  } catch (err) {
    console.error('Pal proxy error:', err.message);
    res.status(502).json({ error: 'Service unavailable' });
  }
});

// ── Static assets (css, images, fonts) ────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Static pages ───────────────────────────────────────────────
const pub = path.join(__dirname, 'public');

app.get('/',            (req, res) => res.sendFile(path.join(pub, 'index.html')));
app.get('/affiliate',   (req, res) => res.sendFile(path.join(pub, 'affiliate.html')));
app.get('/get-started', (req, res) => res.sendFile(path.join(pub, 'get-started', 'index.html')));
app.get('/signin',      (req, res) => res.sendFile(path.join(pub, 'signin',      'index.html')));
app.get('/blog',        (req, res) => res.sendFile(path.join(pub, 'blog', 'index.html')));
app.get('/blog/:slug',  (req, res) => {
  const file = path.join(pub, 'blog', req.params.slug);
  res.sendFile(file, err => {
    if (err) res.status(404).send('Not found');
  });
});
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(pub, 'sitemap.xml')));

// ── Fallback ───────────────────────────────────────────────────
app.use((req, res) => res.redirect('/'));

app.listen(PORT, () => {
  console.log(JSON.stringify({ msg: 'GBP server started', port: PORT, ts: new Date().toISOString() }));
});
