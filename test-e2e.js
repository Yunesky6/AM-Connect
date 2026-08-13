// Quick self-contained smoke test: spawns the server, hits its endpoints, reports pass/fail, exits.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 3099;
const env = { ...process.env, PORT: String(PORT) };
const child = spawn('node', ['server.js'], { cwd: __dirname, env });

let out = '';
child.stdout.on('data', (d) => (out += d.toString()));
child.stderr.on('data', (d) => (out += d.toString()));
child.on('error', (e) => (out += `SPAWN ERROR: ${e.message}\n`));
child.on('exit', (code, sig) => (out += `CHILD EXITED code=${code} sig=${sig}\n`));

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(
      { host: '127.0.0.1', port: PORT, path: urlPath, method, headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => resolve({ status: res.statusCode, body: chunks }));
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  let failed = false;
  try {
    await wait(6000); // let server boot (cold require() resolution can be slow in sandbox)
    console.log('Boot log:', JSON.stringify(out));

    const root = await req('GET', '/');
    console.log('GET / ->', root.status);
    if (root.status !== 200) failed = true;

    const manifest = await req('GET', '/manifest.json');
    console.log('GET /manifest.json ->', manifest.status);
    if (manifest.status !== 200) failed = true;

    const sw = await req('GET', '/service-worker.js');
    console.log('GET /service-worker.js ->', sw.status);
    if (sw.status !== 200) failed = true;

    const formsJs = await req('GET', '/forms.js');
    console.log('GET /forms.js ->', formsJs.status);
    if (formsJs.status !== 200) failed = true;

    const pdfJs = await req('GET', '/pdf.js');
    console.log('GET /pdf.js ->', pdfJs.status);
    if (pdfJs.status !== 200) failed = true;

    const logoJs = await req('GET', '/logo.js');
    console.log('GET /logo.js ->', logoJs.status);
    if (logoJs.status !== 200) failed = true;

    const jspdfLib = await req('GET', '/vendor/jspdf.umd.min.js');
    console.log('GET /vendor/jspdf.umd.min.js ->', jspdfLib.status, `(${jspdfLib.body.length} bytes)`);
    if (jspdfLib.status !== 200 || jspdfLib.body.length < 1000) failed = true;

    const icon = await req('GET', '/icons/icon-192.png');
    console.log('GET /icons/icon-192.png ->', icon.status);
    if (icon.status !== 200) failed = true;

    const badPost = await req('POST', '/api/submissions', { notes: 'missing formId' });
    console.log('POST /api/submissions (invalid) ->', badPost.status, badPost.body);
    if (badPost.status !== 400) failed = true;

    const goodPost = await req('POST', '/api/submissions', {
      formId: 'hvac-checklist',
      formTitle: 'HVAC Inspection Checklist',
      projectName: 'Smoke Test Site',
      techName: 'Test Bot',
      unitId: 'RTU-TEST',
      visual: { visual_0: 'pass' },
      notes: 'automated e2e check'
    });
    console.log('POST /api/submissions (valid) ->', goodPost.status, goodPost.body);
    if (goodPost.status !== 201) failed = true;

    const list = await req('GET', '/api/submissions');
    const parsed = JSON.parse(list.body);
    console.log('GET /api/submissions -> count:', parsed.length);
    if (!parsed.some((r) => r.projectName === 'Smoke Test Site' && r.formId === 'hvac-checklist')) failed = true;

    const admin = await req('GET', '/admin');
    console.log('GET /admin ->', admin.status);
    if (admin.status !== 200) failed = true;

    console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  } catch (e) {
    console.error('ERROR:', e.message);
    failed = true;
    console.log('\nRESULT: FAIL');
  } finally {
    child.kill();
    process.exit(failed ? 1 : 0);
  }
})();
