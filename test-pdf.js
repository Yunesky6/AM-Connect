// Smoke test for public/pdf.js — runs generatePDF() in a jsdom environment
// (no real browser available in this sandbox) to catch runtime errors that
// a plain syntax check (`node --check`) wouldn't catch.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/node_modules/jsdom');

const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
  const { window } = dom;

  const jspdfSrc = fs.readFileSync(path.join(__dirname, 'public/vendor/jspdf.umd.min.js'), 'utf8');
  const formsSrc = fs.readFileSync(path.join(__dirname, 'public/forms.js'), 'utf8');
  const pdfSrc = fs.readFileSync(path.join(__dirname, 'public/pdf.js'), 'utf8');

  try {
    dom.window.eval(`${jspdfSrc}\n${formsSrc}\n${pdfSrc}\nwindow.FORMS = FORMS; window.generatePDF = generatePDF;`);

    // jsdom has no browser blob-download machinery, and that's not what this
    // test is checking. Swap in a wrapper around the jsPDF constructor so
    // instance.save() just records the filename instead of trying to
    // trigger a real download — everything up to that call (all the content
    // layout logic in pdf.js) still runs for real.
    let savedFilename = null;
    const OrigJsPDF = window.jspdf.jsPDF;
    function WrappedJsPDF(...args) {
      const instance = new OrigJsPDF(...args);
      instance.save = (filename) => { savedFilename = filename; };
      return instance;
    }
    WrappedJsPDF.prototype = OrigJsPDF.prototype;
    window.jspdf.jsPDF = WrappedJsPDF;

    // Build a fake "everything answered" dataset for any form, generically,
    // so this test automatically covers new forms added to forms.js later.
    function fakeDataFor(formDef) {
      const data = { formId: formDef.id, formTitle: formDef.title, submittedAt: new Date().toISOString() };
      let toggle = 0;
      const vals = ['pass', 'fail', 'na'];
      function walk(fields) {
        fields.forEach((f) => {
          if (f.type === 'row') return walk(f.fields);
          if (f.type === 'checkgroup') {
            const group = {};
            f.items.forEach((_, i) => { group[`${f.name}_${i}`] = vals[toggle++ % 3]; });
            data[f.name] = group;
          } else if (f.type === 'signature') {
            data[f.name] = TINY_PNG;
          } else if (f.type === 'date') {
            data[f.name] = '2026-08-13';
          } else if (f.type === 'select') {
            data[f.name] = f.options[0];
          } else if (f.type === 'number') {
            data[f.name] = '42';
          } else if (f.name) {
            data[f.name] = `Test value for ${f.name}`;
          }
        });
      }
      formDef.sections.forEach((s) => walk(s.fields));
      return data;
    }

    let allPassed = true;
    window.FORMS.forEach((formDef) => {
      savedFilename = null;
      const data = fakeDataFor(formDef);
      try {
        window.generatePDF(formDef, data);
        console.log(`[${formDef.id}] generatePDF() OK -> ${savedFilename}`);
        if (!savedFilename || !savedFilename.endsWith('.pdf')) throw new Error('no .pdf filename produced');
      } catch (e) {
        allPassed = false;
        console.error(`[${formDef.id}] FAILED:`, e.message);
      }
    });

    if (!allPassed) throw new Error('one or more forms failed PDF generation');
    console.log('RESULT: PASS');
  } catch (e) {
    console.error('ERROR:', e.stack || e.message);
    console.log('RESULT: FAIL');
    process.exitCode = 1;
  }
})();
