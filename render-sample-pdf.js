// One-off helper: renders an actual PDF file to disk so it can be visually
// inspected, instead of just checking that generatePDF() doesn't throw.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/node_modules/jsdom');

const TINY_JPEG = fs.readFileSync('/tmp/tiny_jpeg.txt', 'utf8').trim();

const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'outside-only' });
const { window } = dom;

const jspdfSrc = fs.readFileSync(path.join(__dirname, 'public/vendor/jspdf.umd.min.js'), 'utf8');
const formsSrc = fs.readFileSync(path.join(__dirname, 'public/forms.js'), 'utf8');
const logoSrc = fs.readFileSync(path.join(__dirname, 'public/logo.js'), 'utf8');
const pdfSrc = fs.readFileSync(path.join(__dirname, 'public/pdf.js'), 'utf8');

dom.window.eval(`${jspdfSrc}\n${formsSrc}\n${logoSrc}\n${pdfSrc}\nwindow.FORMS = FORMS; window.generatePDF = generatePDF;`);

let savedBlob = null;
const OrigJsPDF = window.jspdf.jsPDF;
function WrappedJsPDF(...args) {
  const instance = new OrigJsPDF(...args);
  const origSave = instance.save.bind(instance);
  instance.save = () => { savedBlob = instance.output('arraybuffer'); };
  return instance;
}
WrappedJsPDF.prototype = OrigJsPDF.prototype;
window.jspdf.jsPDF = WrappedJsPDF;

const formDef = window.FORMS.find((f) => f.id === 'wshp-startup');
const data = {
  formId: formDef.id,
  formTitle: formDef.title,
  projectName: 'Riverside Apartments — Bldg 4',
  unitTag: 'WSHP-412',
  thermostatTTO: 'TTO-412',
  model: 'WGZ036',
  serial: 'SN-88213',
  submittedAt: new Date().toISOString()
};
let toggle = 0;
const vals = ['pass', 'fail', 'na'];
function walk(fields) {
  fields.forEach((f) => {
    if (f.type === 'row') return walk(f.fields);
    if (f.type === 'checkgroup') {
      const group = {};
      f.items.forEach((_, i) => { group[`${f.name}_${i}`] = vals[toggle++ % 3]; });
      data[f.name] = group;
    }
  });
}
formDef.sections.forEach((s) => walk(s.fields));
data.notes = 'Sample rendering for logo placement check.';
data.completedBy = 'J. Rivera';
data.date = '2026-08-13';

window.generatePDF(formDef, data);

const buf = Buffer.from(savedBlob);
fs.writeFileSync(path.join(__dirname, 'sample-output.pdf'), buf);
console.log('wrote sample-output.pdf,', buf.length, 'bytes');
