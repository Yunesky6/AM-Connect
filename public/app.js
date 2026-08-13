// ---------- Config ----------
const API_BASE = ''; // same-origin; change if backend is hosted separately
const QUEUE_KEY = 'queue';
const draftKey = (formId) => `draft_${formId}`;
const PHOTO_MAX_DIMENSION = 1440; // resized longest edge, keeps file size reasonable
const PHOTO_JPEG_QUALITY = 0.7;

// ---------- Storage (IndexedDB) ----------
// Offline submissions can include photos, which are far bigger than
// localStorage's ~5-10MB quota comfortably allows. IndexedDB has a much
// larger practical limit, so the queue and drafts live there instead.
const IDB_NAME = 'am_connect_db';
const IDB_VERSION = 1;
const IDB_STORE = 'kv';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key, fallback) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : fallback);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- Elements ----------
const homeView = document.getElementById('homeView');
const formView = document.getElementById('formView');
const formList = document.getElementById('formList');
const activeFormEl = document.getElementById('activeForm');
const headerTitle = document.getElementById('headerTitle');
const backBtn = document.getElementById('backBtn');
const formFooter = document.getElementById('formFooter');

let currentForm = null;   // the form definition currently open
let currentCanvas = null; // signature canvas element, if the open form has one
let currentCtx = null;
let hasSignature = false;
let drawing = false;
let currentPhotos = {};   // { [fieldName]: [dataURL, dataURL, ...] } for the open form

// ---------- Home screen ----------
function renderHome() {
  formList.innerHTML = FORMS.map((f) => `
    <div class="form-card" data-id="${f.id}">
      <div class="icon">${f.icon || '📋'}</div>
      <div class="info">
        <h3>${f.title}</h3>
        <p>${f.subtitle || ''}</p>
      </div>
      <div class="chev">&rsaquo;</div>
    </div>
  `).join('');
  formList.querySelectorAll('.form-card').forEach((card) => {
    card.addEventListener('click', () => openForm(card.dataset.id));
  });
}

function goHome() {
  currentForm = null;
  formView.style.display = 'none';
  homeView.style.display = 'block';
  backBtn.classList.remove('show');
  formFooter.classList.remove('show');
  headerTitle.textContent = 'AM Connect';
  renderQueue();
}
backBtn.addEventListener('click', goHome);

// ---------- Field rendering ----------
function fieldHtml(field) {
  const req = field.required ? 'required' : '';
  switch (field.type) {
    case 'text':
      return `<label>${field.label}${field.required ? ' *' : ''}</label>
        <input type="text" name="${field.name}" placeholder="${field.placeholder || ''}" ${req}>`;
    case 'number':
      return `<label>${field.label}${field.required ? ' *' : ''}</label>
        <input type="number" name="${field.name}" step="${field.step || 'any'}" ${req}>`;
    case 'date':
      return `<label>${field.label}${field.required ? ' *' : ''}</label>
        <input type="date" name="${field.name}" ${req}>`;
    case 'textarea':
      return `${field.label ? `<label>${field.label}</label>` : ''}
        <textarea name="${field.name}" placeholder="${field.placeholder || ''}"></textarea>`;
    case 'select':
      return `<label>${field.label}</label>
        <select name="${field.name}">${field.options.map((o) => `<option>${o}</option>`).join('')}</select>`;
    case 'row':
      return `<div class="row">${field.fields.map((f) => `<div>${fieldHtml(f)}</div>`).join('')}</div>`;
    case 'checkgroup':
      return `<div data-checkgroup="${field.name}">${field.items.map((label, i) => `
        <div class="check-row">
          <span>${label}</span>
          <div class="seg" data-name="${field.name}_${i}">
            <button type="button" data-val="pass">Pass</button>
            <button type="button" data-val="fail">Fail</button>
            <button type="button" data-val="na">N/A</button>
          </div>
        </div>`).join('')}</div>`;
    case 'signature':
      return `${field.label ? `<label>${field.label}</label>` : ''}
        <canvas id="sigPad" class="sig-pad" data-name="${field.name}"></canvas>
        <div class="sig-actions"><button type="button" id="clearSig">Clear</button></div>`;
    case 'photo':
      return `<label>${field.label || 'Photos'}</label>
        <div class="photo-field" data-photo="${field.name}">
          <div class="photo-grid"></div>
          <button type="button" class="photo-add-btn">📷 Add Photo</button>
          <input type="file" accept="image/*" capture="environment" multiple class="photo-input" style="display:none">
        </div>`;
    default:
      return '';
  }
}

function renderForm(formDef) {
  const html = formDef.sections.map((section) => `
    <div class="section">
      <h2>${section.heading}</h2>
      ${section.fields.map(fieldHtml).join('')}
    </div>
  `).join('');
  activeFormEl.innerHTML = html;
  currentPhotos = {};

  // Wire up checkgroup buttons
  activeFormEl.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') return;
      seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
      e.target.classList.add('active');
      updateProgress();
    });
  });

  // Wire up signature pad, if this form has one
  const canvas = activeFormEl.querySelector('#sigPad');
  if (canvas) {
    currentCanvas = canvas;
    currentCtx = canvas.getContext('2d');
    hasSignature = false;
    setupSignaturePad(canvas, currentCtx);
    const clearBtn = activeFormEl.querySelector('#clearSig');
    clearBtn.addEventListener('click', () => {
      currentCtx.clearRect(0, 0, canvas.width, canvas.height);
      hasSignature = false;
    });
  } else {
    currentCanvas = null;
    currentCtx = null;
  }

  // Wire up photo fields, if this form has any
  activeFormEl.querySelectorAll('.photo-field').forEach((container) => {
    const fieldName = container.dataset.photo;
    currentPhotos[fieldName] = currentPhotos[fieldName] || [];
    const input = container.querySelector('.photo-input');
    const addBtn = container.querySelector('.photo-add-btn');
    addBtn.addEventListener('click', () => input.click());
    input.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        try {
          const dataUrl = await compressImage(file);
          currentPhotos[fieldName].push(dataUrl);
          renderPhotoGrid(container, fieldName);
        } catch (err) { console.error('Photo compression failed', err); }
      }
      input.value = ''; // allow re-selecting the same file later
    });
  });
}

function renderPhotoGrid(container, fieldName) {
  const grid = container.querySelector('.photo-grid');
  grid.innerHTML = currentPhotos[fieldName].map((src, i) => `
    <div class="photo-thumb">
      <img src="${src}" alt="Photo ${i + 1}">
      <button type="button" class="photo-remove" data-index="${i}">&times;</button>
    </div>
  `).join('');
  grid.querySelectorAll('.photo-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentPhotos[fieldName].splice(Number(btn.dataset.index), 1);
      renderPhotoGrid(container, fieldName);
    });
  });
}

// Resizes + re-encodes a captured photo client-side so the offline queue and
// generated PDF stay a reasonable size (raw camera photos can be several MB each).
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > PHOTO_MAX_DIMENSION) {
        height = Math.round((height * PHOTO_MAX_DIMENSION) / width);
        width = PHOTO_MAX_DIMENSION;
      } else if (height > PHOTO_MAX_DIMENSION) {
        width = Math.round((width * PHOTO_MAX_DIMENSION) / height);
        height = PHOTO_MAX_DIMENSION;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setupSignaturePad(canvas, ctx) {
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  }
  resize();
  function pos(e) {
    const rect = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - rect.left, y: t.clientY - rect.top };
  }
  function start(e) { drawing = true; hasSignature = true; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); }
  function move(e) { if (!drawing) return; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); }
  function end() { drawing = false; }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
}

// ---------- Progress tracking (checklist completion) ----------
const progressCard = document.getElementById('progressCard');
const progressPct = document.getElementById('progressPct');
const progressSub = document.getElementById('progressSub');
const progressFill = document.getElementById('progressFill');

function getProgress() {
  const segs = activeFormEl.querySelectorAll('[data-checkgroup] .seg');
  const total = segs.length;
  let answered = 0;
  segs.forEach((seg) => { if (seg.querySelector('button.active')) answered += 1; });
  return { total, answered };
}

function updateProgress() {
  const { total, answered } = getProgress();
  if (total === 0) {
    progressCard.style.display = 'none';
    return;
  }
  progressCard.style.display = 'block';
  const pct = Math.round((answered / total) * 100);
  progressPct.textContent = `${pct}%`;
  progressSub.textContent = `${answered} of ${total} checks`;
  progressFill.style.width = `${pct}%`;
}

// ---------- Open a form ----------
async function openForm(id) {
  const formDef = FORMS.find((f) => f.id === id);
  if (!formDef) return;
  currentForm = formDef;
  renderForm(formDef);
  await loadDraft(formDef);
  updateProgress();

  homeView.style.display = 'none';
  formView.style.display = 'block';
  backBtn.classList.add('show');
  formFooter.classList.add('show');
  headerTitle.textContent = formDef.title;
  window.scrollTo(0, 0);
}

// ---------- Data collection ----------
function collectFormData(formDef) {
  const fd = new FormData(activeFormEl);
  const data = {};
  for (const [k, v] of fd.entries()) data[k] = v;

  activeFormEl.querySelectorAll('[data-checkgroup]').forEach((group) => {
    const result = {};
    group.querySelectorAll('.seg').forEach((seg) => {
      const active = seg.querySelector('button.active');
      result[seg.dataset.name] = active ? active.dataset.val : null;
    });
    data[group.dataset.checkgroup] = result;
  });

  if (currentCanvas) {
    data[currentCanvas.dataset.name] = hasSignature ? currentCanvas.toDataURL('image/png') : null;
  }

  Object.keys(currentPhotos).forEach((fieldName) => {
    data[fieldName] = currentPhotos[fieldName];
  });

  data.formId = formDef.id;
  data.formTitle = formDef.title;
  data.submittedAt = new Date().toISOString();
  return data;
}

async function resetForm(formDef) {
  activeFormEl.reset();
  activeFormEl.querySelectorAll('.seg').forEach((seg) => {
    seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
  });
  if (currentCanvas) {
    currentCtx.clearRect(0, 0, currentCanvas.width, currentCanvas.height);
    hasSignature = false;
  }
  currentPhotos = {};
  activeFormEl.querySelectorAll('.photo-field').forEach((container) => {
    renderPhotoGrid(container, container.dataset.photo);
  });
  await idbDelete(draftKey(formDef.id));
  updateProgress();
}

// ---------- Draft save/load ----------
document.getElementById('saveDraftBtn').addEventListener('click', async () => {
  if (!currentForm) return;
  await idbSet(draftKey(currentForm.id), collectFormData(currentForm));
  toast('Draft saved on this device');
});

async function loadDraft(formDef) {
  const data = await idbGet(draftKey(formDef.id), null);
  if (!data) return;
  try {
    // Plain inputs/selects/textareas
    Object.keys(data).forEach((k) => {
      if (activeFormEl.elements[k]) activeFormEl.elements[k].value = data[k];
    });

    // Checkgroups: data[groupName] = { "groupName_0": "pass", ... }
    activeFormEl.querySelectorAll('[data-checkgroup]').forEach((group) => {
      const groupName = group.dataset.checkgroup;
      const values = data[groupName];
      if (!values) return;
      group.querySelectorAll('.seg').forEach((seg) => {
        const val = values[seg.dataset.name];
        if (!val) return;
        seg.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
        const btn = seg.querySelector(`button[data-val="${val}"]`);
        if (btn) btn.classList.add('active');
      });
    });

    // Signature
    if (currentCanvas) {
      const sigData = data[currentCanvas.dataset.name];
      if (sigData) {
        const img = new Image();
        img.onload = () => {
          currentCtx.drawImage(img, 0, 0, currentCanvas.width / (window.devicePixelRatio || 1), currentCanvas.height / (window.devicePixelRatio || 1));
          hasSignature = true;
        };
        img.src = sigData;
      }
    }

    // Photos
    activeFormEl.querySelectorAll('.photo-field').forEach((container) => {
      const fieldName = container.dataset.photo;
      if (Array.isArray(data[fieldName])) {
        currentPhotos[fieldName] = data[fieldName];
        renderPhotoGrid(container, fieldName);
      }
    });
  } catch (e) { /* ignore corrupt draft */ }
}

// ---------- Online status ----------
const statusEl = document.getElementById('status');
function updateStatus() {
  if (navigator.onLine) {
    statusEl.textContent = 'Online';
    statusEl.className = 'status-online';
  } else {
    statusEl.textContent = 'Offline — saved locally';
    statusEl.className = 'status-offline';
  }
}
window.addEventListener('online', () => { updateStatus(); flushQueue(); });
window.addEventListener('offline', updateStatus);
updateStatus();

// ---------- Toast ----------
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------- Queue (offline submissions, shared across all forms) ----------
async function getQueue() {
  return idbGet(QUEUE_KEY, []);
}
async function setQueue(q) {
  await idbSet(QUEUE_KEY, q);
  renderQueue();
}

async function renderQueue() {
  const q = await getQueue();
  const panel = document.getElementById('queuePanel');
  if (q.length === 0) { panel.innerHTML = ''; return; }
  panel.innerHTML = q.map((item) => `
    <div class="q-item">
      <span>${item.data.formTitle || 'Form'} — ${item.data.projectName || item.data.title || '(untitled)'} — ${new Date(item.data.submittedAt).toLocaleString()}</span>
      <span class="q-badge ${item.status === 'synced' ? 'q-synced' : 'q-pending'}">${item.status}</span>
    </div>
  `).join('');
}

async function flushQueue() {
  const q = await getQueue();
  let changed = false;
  for (const item of q) {
    if (item.status === 'synced') continue;
    try {
      const res = await fetch(`${API_BASE}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.data)
      });
      if (res.ok) { item.status = 'synced'; changed = true; }
    } catch (e) { /* still offline, leave pending */ }
  }
  if (changed) {
    const remaining = q.filter((i) => i.status !== 'synced' || Date.now() - i.queuedAt < 5 * 60 * 1000);
    await setQueue(remaining);
    toast('Synced pending submissions');
  }
}

// ---------- Submit ----------
document.getElementById('submitBtn').addEventListener('click', async () => {
  if (!currentForm) return;
  if (!activeFormEl.reportValidity()) return;

  const { total, answered } = getProgress();
  if (total > 0 && answered < total) {
    toast(`Answer all checklist items first (${answered} of ${total} complete)`);
    progressCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const data = collectFormData(currentForm);

  // Always generate a local PDF copy — this is the fallback for techs with
  // no connectivity at all, who can save it and email it manually later.
  try {
    generatePDF(currentForm, data);
  } catch (e) {
    console.error('PDF generation failed', e);
  }

  const entry = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), data, status: 'pending', queuedAt: Date.now() };

  if (navigator.onLine) {
    try {
      const res = await fetch(`${API_BASE}/api/submissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        toast('Submitted');
        await resetForm(currentForm);
        goHome();
        return;
      }
      throw new Error('bad response');
    } catch (e) {
      // fall through to queue it
    }
  }
  const q = await getQueue();
  q.push(entry);
  await setQueue(q);
  toast('Offline — saved and will sync automatically');
  await resetForm(currentForm);
  goHome();
});

// ---------- Init ----------
renderHome();
renderQueue();
if (navigator.onLine) flushQueue();

// ---------- Service worker ----------
// New versions activate immediately (service-worker.js calls skipWaiting() +
// clients.claim()) rather than waiting for every tab to close. When that
// happens mid-session, auto-reload once so the page catches up to the new
// cached files instead of silently running stale code until someone
// remembers to hard-refresh.
if ('serviceWorker' in navigator) {
  let refreshedOnce = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshedOnce) return;
    refreshedOnce = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

// Retry sync periodically in case 'online' event doesn't fire reliably (iOS Safari)
setInterval(() => { if (navigator.onLine) flushQueue(); }, 30000);
