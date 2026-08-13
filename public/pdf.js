// Builds a PDF of a filled-out form so a technician can save it to their
// device and email it manually — this works with zero connectivity, which
// matters since the automatic server sync needs at least one moment online.
//
// Walks the same form definition (public/forms.js) used to render the form,
// so any new form added there gets a matching PDF automatically.

function checkColor(val) {
  if (val === 'pass') return [22, 163, 74];   // green
  if (val === 'fail') return [220, 38, 38];   // red
  return [100, 116, 139];                     // gray (n/a or unanswered)
}
function checkLabel(val) {
  if (val === 'pass') return 'PASS';
  if (val === 'fail') return 'FAIL';
  if (val === 'na') return 'N/A';
  return '—';
}

function fieldLabelFor(field) {
  return field.label || field.name;
}

// Flattens a form's sections/fields into a simple list of {label, value} rows,
// plus separately-collected checkgroups and the signature, using the same
// `data` object collectFormData() produces.
function generatePDF(formDef, data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 40;
  let y = 50;

  function ensureSpace(needed) {
    if (y + needed > doc.internal.pageSize.getHeight() - margin) {
      doc.addPage();
      y = 50;
    }
  }

  // Header — company logo top-left, form title top-right
  let headerBottom = y;
  if (typeof AURORA_LOGO_DATA_URI !== 'undefined') {
    const logoW = 110;
    const logoH = logoW / AURORA_LOGO_ASPECT;
    try {
      doc.addImage(AURORA_LOGO_DATA_URI, 'PNG', margin, y - 14, logoW, logoH);
      headerBottom = Math.max(headerBottom, y - 14 + logoH);
    } catch (e) { /* fall back silently if the logo fails to embed */ }
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(80, 80, 80);
  doc.text(formDef.title, pageWidth - margin, y, { align: 'right' });
  y = headerBottom + 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(120, 120, 120);
  doc.text(`Submitted: ${new Date(data.submittedAt || Date.now()).toLocaleString()}`, margin, y);
  y += 22;

  // Walk sections
  formDef.sections.forEach((section) => {
    ensureSpace(40);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(26, 58, 94);
    doc.text(section.heading, margin, y);
    y += 16;

    section.fields.forEach((field) => renderField(doc, field, data, margin, () => y, (v) => (y = v), ensureSpace, pageWidth));
    y += 8;
  });

  const safeTitle = (formDef.title || 'form').replace(/[^a-z0-9]+/gi, '_');
  const safeProject = (data.projectName || data.title || data.site || 'submission').replace(/[^a-z0-9]+/gi, '_');
  const dateStr = new Date(data.submittedAt || Date.now()).toISOString().slice(0, 10);
  const filename = `${safeTitle}_${safeProject}_${dateStr}.pdf`;

  doc.save(filename);
}

function renderField(doc, field, data, margin, getY, setY, ensureSpace, pageWidth) {
  let y = getY();

  if (field.type === 'row') {
    field.fields.forEach((f) => {
      renderField(doc, f, data, margin, getY, setY, ensureSpace, pageWidth);
      y = getY();
    });
    return;
  }

  if (field.type === 'checkgroup') {
    const values = data[field.name] || {};
    field.items.forEach((label, i) => {
      ensureSpace(16);
      y = getY();
      const val = values[`${field.name}_${i}`];
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text(label, margin + 6, y);
      const color = checkColor(val);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(color[0], color[1], color[2]);
      doc.text(checkLabel(val), pageWidth - margin, y, { align: 'right' });
      setY(y + 15);
    });
    return;
  }

  if (field.type === 'photo') {
    const photos = data[field.name];
    if (!photos || photos.length === 0) return;
    ensureSpace(20);
    y = getY();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`${field.label || 'Photos'} (${photos.length}):`, margin + 6, y);
    y += 10;

    const perRow = 3;
    const gap = 8;
    const cellW = (pageWidth - margin * 2 - gap * (perRow - 1)) / perRow;
    const cellH = cellW * 0.75;
    photos.forEach((src, i) => {
      const col = i % perRow;
      if (col === 0) {
        ensureSpace(cellH + gap);
        y = getY();
      }
      const x = margin + col * (cellW + gap);
      try {
        doc.addImage(src, 'JPEG', x, y, cellW, cellH);
      } catch (e) { /* skip if a photo fails to embed */ }
      if (col === perRow - 1 || i === photos.length - 1) {
        setY(y + cellH + gap);
      }
    });
    return;
  }

  if (field.type === 'signature') {
    ensureSpace(90);
    y = getY();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text('Signature:', margin + 6, y);
    y += 8;
    const sig = data[field.name];
    if (sig) {
      try {
        doc.addImage(sig, 'PNG', margin + 6, y, 200, 70);
      } catch (e) { /* skip if image fails to embed */ }
    }
    setY(y + 80);
    return;
  }

  // text / number / date / select / textarea
  const label = fieldLabelFor(field);
  if (!label && !data[field.name]) { return; }
  const value = data[field.name] || '—';
  ensureSpace(16);
  y = getY();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  if (label) doc.text(`${label}:`, margin + 6, y);
  doc.setTextColor(30, 30, 30);
  const valueX = label ? margin + 6 + doc.getTextWidth(`${label}: `) : margin + 6;
  const maxWidth = pageWidth - margin - valueX;
  const lines = doc.splitTextToSize(String(value), maxWidth);
  doc.text(lines, valueX, y);
  setY(y + 14 * lines.length);
}
