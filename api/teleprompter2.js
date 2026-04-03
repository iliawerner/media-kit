// Vercel Serverless Function: /api/teleprompter
// POST { text, size } → saves to GitHub Gist → returns { id }
// GET  ?id=xxx        → fetches Gist          → returns { text, size }

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GIST_DESCRIPTION = 'teleprompter-script';

export default async function handler(req, res) {
  // CORS headers — allow requests from design-lovers.com
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: missing GITHUB_TOKEN' });
  }

  // ── POST: save script ────────────────────────────────────
  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    const { text, size } = body || {};
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Missing text' });
    }

    const payload = JSON.stringify({ text: text.trim(), size: size || 72 });

    const gistRes = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'design-lovers-teleprompter',
      },
      body: JSON.stringify({
        description: GIST_DESCRIPTION,
        public: false,
        files: {
          'script.json': { content: payload },
        },
      }),
    });

    if (!gistRes.ok) {
      const err = await gistRes.text();
      console.error('GitHub Gist create error:', err);
      return res.status(502).json({ error: 'Failed to save script' });
    }

    const gist = await gistRes.json();
    return res.status(200).json({ id: gist.id });
  }

  // ── GET: load script ─────────────────────────────────────
  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id || !/^[a-f0-9]{20,40}$/.test(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const gistRes = await fetch(`https://api.github.com/gists/${id}`, {
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'User-Agent': 'design-lovers-teleprompter',
      },
    });

    if (!gistRes.ok) {
      return res.status(404).json({ error: 'Script not found' });
    }

    const gist = await gistRes.json();
    const file = gist.files?.['script.json'];
    if (!file) {
      return res.status(404).json({ error: 'Script file not found in gist' });
    }

    // If content is truncated, fetch raw
    let content = file.content;
    if (file.truncated) {
      const rawRes = await fetch(file.raw_url);
      content = await rawRes.text();
    }

    try {
      const data = JSON.parse(content);
      return res.status(200).json(data);
    } catch {
      return res.status(500).json({ error: 'Corrupted script data' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
