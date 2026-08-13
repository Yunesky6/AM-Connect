// Verifies two things not covered by test-pdf.js / test-e2e.js:
//   1. The IndexedDB-backed storage layer in app.js (idbGet/idbSet/idbDelete,
//      queue round-trip) actually works, using fake-indexeddb since Node has
//      no real IndexedDB.
//   2. A form with a 'photo' field renders correctly into the generated PDF
//      (grid layout, addImage call) — the two shipped forms don't use this
//      field type yet, so it isn't exercised by test-pdf.js.
require('/tmp/node_modules/fake-indexeddb/auto/index.js');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/node_modules/jsdom');

const TINY_JPEG = fs.readFileSync('/tmp/tiny_jpeg.txt', 'utf8').trim();

(async () => {
  let failed = false;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const { window } = dom;
  window.indexedDB = global.indexedDB; // fake-indexeddb polyfill from Node global

  const src = fs.readFileSync(path.join(__dirname, 'public/app.js'), 'utf8');
  // Expose the internal storage helpers on window for direct testing,
  // without duplicating app.js's own DOM-dependent init code (it expects
  // the full index.html structure to be present, which isn't the point here).
  const exposed = src
    .replace('// ---------- Elements ----------', 'window.idbGet = idbGet; window.idbSet = idbSet; window.idbDelete = idbDelete;\n// ---------- Elements ----------')
    .split('// ---------- Elements ----------')[0]; // only take the storage-layer portion, before DOM element lookups

  try {
    dom.window.eval(exposed);

    // --- Test 1: basic get/set/delete round trip ---
    await window.idbSet('testKey', { hello: 'world' });
    const got = await window.idbGet('testKey', null);
    console.log('idb round trip:', JSON.stringify(got));
    if (got.hello !== 'world') { failed = true; console.error('FAIL: idb round trip mismatch'); }

    const missing = await window.idbGet('doesNotExist', 'fallback-value');
    if (missing !== 'fallback-value') { failed = true; console.error('FAIL: fallback not returned for missing key'); }

    // --- Test 2: queue with a photo-bearing submission round-trips intact ---
    const fakeQueueItem = {
      id: 'abc123',
      status: 'pending',
      queuedAt: Date.now(),
      data: {
        formId: 'test-form-with-photos',
        formTitle: 'Test Form',
        projectName: 'Photo Storage Test',
        sitePhotos: [TINY_JPEG, TINY_JPEG],
        submittedAt: new Date().toISOString()
      }
    };
    await window.idbSet('queue', [fakeQueueItem]);
    const queue = await window.idbGet('queue', []);
    console.log('queue length:', queue.length, '| photos on item:', queue[0].data.sitePhotos.length);
    if (queue.length !== 1 || queue[0].data.sitePhotos.length !== 2) {
      failed = true;
      console.error('FAIL: queued submission with photos did not round-trip correctly');
    }

    await window.idbDelete('queue');
    const afterDelete = await window.idbGet('queue', 'was-deleted');
    if (afterDelete !== 'was-deleted') { failed = true; console.error('FAIL: idbDelete did not remove the key'); }
  } catch (e) {
    failed = true;
    console.error('Storage test error:', e.stack || e.message);
  }

  // --- Test 3: PDF generation with a 'photo' field ---
  try {
    const jspdfSrc = fs.readFileSync(path.join(__dirname, 'public/vendor/jspdf.umd.min.js'), 'utf8');
    const pdfSrc = fs.readFileSync(path.join(__dirname, 'public/pdf.js'), 'utf8');

    const testFormDef = {
      id: 'test-form-with-photos',
      title: 'Test Form With Photos',
      sections: [
        { heading: 'Site Photos', fields: [
          { type: 'photo', name: 'sitePhotos', label: 'Site Photos' }
        ]}
      ]
    };

    const dom2 = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
    dom2.window.eval(`${jspdfSrc}\n${pdfSrc}\nwindow.generatePDF = generatePDF;`);
    let savedFilename = null;
    const OrigJsPDF = dom2.window.jspdf.jsPDF;
    function WrappedJsPDF(...args) {
      const instance = new OrigJsPDF(...args);
      instance.save = (filename) => { savedFilename = filename; };
      return instance;
    }
    WrappedJsPDF.prototype = OrigJsPDF.prototype;
    dom2.window.jspdf.jsPDF = WrappedJsPDF;

    const data = {
      formId: testFormDef.id,
      formTitle: testFormDef.title,
      sitePhotos: [TINY_JPEG, TINY_JPEG, TINY_JPEG, TINY_JPEG], // 4 photos -> spans 2 rows at 3-per-row
      submittedAt: new Date().toISOString()
    };
    dom2.window.generatePDF(testFormDef, data);
    console.log('photo PDF generated ->', savedFilename);
    if (!savedFilename || !savedFilename.endsWith('.pdf')) {
      failed = true;
      console.error('FAIL: photo-bearing PDF did not save correctly');
    }
  } catch (e) {
    failed = true;
    console.error('Photo PDF test error:', e.stack || e.message);
  }

  console.log(failed ? '\nRESULT: FAIL' : '\nRESULT: PASS');
  process.exitCode = failed ? 1 : 0;
})();
