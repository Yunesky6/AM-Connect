const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'submissions.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]');

function readAll() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch (e) { return []; }
}
function writeAll(arr) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2));
}

app.use(express.json({ limit: '5mb' })); // signature images are base64, allow generous size
app.use(express.static(path.join(__dirname, 'public')));

// Receive a submission (called by the PWA, whether live or synced from the offline queue)
// Validation is intentionally generic here — each form defines its own required
// fields client-side (public/forms.js); the backend just requires that the
// submission is tagged with which form it came from.
app.post('/api/submissions', (req, res) => {
  const body = req.body || {};
  if (!body.formId) {
    return res.status(400).json({ error: 'formId is required' });
  }
  const record = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    ...body
  };
  const all = readAll();
  all.push(record);
  writeAll(all);
  res.status(201).json({ ok: true, id: record.id });
});

// List submissions (used by the admin view)
app.get('/api/submissions', (req, res) => {
  const all = readAll().sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt));
  res.json(all);
});

// Single submission
app.get('/api/submissions/:id', (req, res) => {
  const all = readAll();
  const rec = all.find((r) => r.id === req.params.id);
  if (!rec) return res.status(404).json({ error: 'not found' });
  res.json(rec);
});

// Simple admin page to browse submissions
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

app.listen(PORT, () => {
  console.log(`AM Connect server running on http://localhost:${PORT}`);
  console.log(`Field app:  http://localhost:${PORT}/`);
  console.log(`Admin view: http://localhost:${PORT}/admin`);
});
