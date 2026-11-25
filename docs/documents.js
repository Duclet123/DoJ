const office = {
  lawyer: 'Law Office',
  judge: 'Court of San Andreas',
  prosecutor: 'District Attorney’s Office'
};

const templates = {
  blank: ['Κενό έγγραφο', ''],
  motion: ['Αίτηση προς το δικαστήριο', 'Προς το Δικαστήριο\n\nΥπόθεση: \n\nΑίτημα\n\nΠραγματικά περιστατικά\n\nΑιτιολογία\n\nΗμερομηνία: '],
  appearance: ['Δήλωση παράστασης', 'Προς τη γραμματεία του δικαστηρίου\n\nΥπόθεση: \n\nΔηλώνω ότι εκπροσωπώ: \n\nΣτοιχεία επικοινωνίας: \n\nΗμερομηνία: '],
  letter: ['Επιστολή δικηγόρου', 'Προς: \n\nΘέμα: \n\nΚείμενο επιστολής\n\nΜε εκτίμηση,']
};

const roleTemplates = {
  lawyer: {
    suppress: ['Αίτημα αποκλεισμού αποδεικτικού', 'Υπόθεση: \nExhibit: \n\nΑίτημα\n\nΓεγονότα\n\nΣκεπτικό\n\nΗμερομηνία: '],
    disclosure: ['Αίτημα γνωστοποίησης υλικού', 'Υπόθεση: \n\nΥλικό που ζητείται\n\nΛόγος και συνάφεια\n\nΗμερομηνία: ']
  },
  prosecutor: {
    indictment: ['Κατηγορητήριο', 'Υπόθεση: \nΚατηγορούμενος: \n\nΚατηγορίες ανά άρθρο\n\nΠραγματικά περιστατικά\n\nExhibits και μάρτυρες\n\nΗμερομηνία: '],
    exhibitList: ['Κατάλογος exhibits', 'Υπόθεση: \n\nExhibit / περιγραφή / σχετική κατηγορία\n\nΚαταχωρίσεις\n\nΗμερομηνία: '],
    disclosureNotice: ['Γνωστοποίηση αποδεικτικού υλικού', 'Υπόθεση: \nΠρος: \n\nΥλικό που διαβιβάζεται\n\nΤρόπος πρόσβασης\n\nΗμερομηνία: ']
  },
  judge: {
    hearing: ['Ορισμός ακρόασης', 'Υπόθεση: \nΗμερομηνία και ώρα: \nΑίθουσα: \n\nΑντικείμενο ακρόασης\n\nΟδηγίες προς τα μέρη'],
    order: ['Δικαστική διάταξη', 'Υπόθεση: \n\nΑίτημα προς κρίση\n\nΣκεπτικό\n\nΔιατακτικό\n\nΗμερομηνία: '],
    judgment: ['Δικαστική απόφαση', 'Υπόθεση: \nΚατηγορούμενος: \n\nΙστορικό\n\nΚρίση ανά κατηγορία\n\nΣκεπτικό\n\nΔιατακτικό\n\nΗμερομηνία: ']
  }
};

const width = 1240;
const height = 1754;
const margin = 108;
const lineHeight = 39;
const bodyTop = 395;
const linesPerPage = 31;

function logo(ctx) {
  ctx.save();
  ctx.translate(width / 2, 128);
  ctx.strokeStyle = '#ad8545';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 49, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = '#183149';
  ctx.textAlign = 'center';
  ctx.font = 'bold 29px Georgia';
  ctx.fillText('SA', 0, 10);
  ctx.restore();
}

function wrap(ctx, text, limit) {
  const lines = [];
  for (const paragraph of text.replaceAll('\r', '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? line + ' ' + word : word;
      if (ctx.measureText(next).width <= limit) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = '';
      for (const char of word) {
        if (ctx.measureText(line + char).width > limit && line) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}

function pages(document, author) {
  const canvas = () => Object.assign(window.document.createElement('canvas'), { width, height });
  const first = canvas();
  const measure = first.getContext('2d');
  measure.font = '29px Georgia';
  const lines = wrap(measure, document.body, width - margin * 2);
  measure.font = 'bold 45px Georgia';
  const headingSize = Math.min(45, 45 * (width - margin * 2) / Math.max(1, measure.measureText(document.title).width));
  const count = Math.max(1, Math.ceil(lines.length / linesPerPage));
  return { count, sheet(index) {
    const sheet = index ? canvas() : first;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    logo(ctx);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#183149';
    ctx.font = 'bold 42px Georgia';
    ctx.fillText(office[author.role] || 'Department of Justice', width / 2, 237);
    ctx.font = '23px Georgia';
    ctx.fillText(author.username, width / 2, 276, width - margin * 2);
    ctx.fillStyle = '#ad8545';
    ctx.fillRect(margin, 301, width - margin * 2, 2);
    ctx.fillStyle = '#172435';
    ctx.font = 'bold ' + headingSize + 'px Georgia';
    ctx.fillText(document.title, width / 2, 356);
    ctx.textAlign = 'left';
    ctx.font = '29px Georgia';
    lines.slice(index * linesPerPage, (index + 1) * linesPerPage)
      .forEach((line, row) => ctx.fillText(line, margin, bodyTop + row * lineHeight));
    ctx.textAlign = 'center';
    ctx.font = '20px Georgia';
    ctx.fillText((index + 1) + ' / ' + count, width / 2, height - 65);
    return sheet;
  } };
}

function download(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function print(sheets) {
  const view = document.createElement('div');
  view.className = 'document-print';
  const images = Array.from({ length: sheets.count }, (_, index) => {
    const img = new Image();
    img.src = sheets.sheet(index).toDataURL('image/png');
    view.append(img);
    return img;
  });
  document.body.append(view);
  document.body.classList.add('printing-document');
  const done = () => {
    view.remove();
    document.body.classList.remove('printing-document');
  };
  window.addEventListener('afterprint', done, { once: true });
  Promise.all(images.map((image) => image.decode())).then(() => window.print()).catch(done);
}

function outputs(parent, getPages, getName, node) {
  const bar = node('div', null, { class: 'document-tools' });
  const printButton = node('button', 'Εκτύπωση', { type: 'button' });
  const exportButton = node('button', 'Λήψη PNG', { type: 'button', class: 'secondary' });
  const downloads = node('div', null, { class: 'document-tools' });
  printButton.addEventListener('click', () => print(getPages()));
  exportButton.addEventListener('click', () => {
    const sheets = getPages();
    const name = getName().replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 70) || 'document';
    downloads.replaceChildren();
    if (sheets.count === 1) {
      download(sheets.sheet(0), name + '.png');
      return;
    }
    for (let index = 0; index < sheets.count; index++) {
      const button = node('button', 'Σελίδα ' + (index + 1) + ' PNG', { type: 'button', class: 'secondary' });
      button.addEventListener('click', () => download(sheets.sheet(index), name + '-' + (index + 1) + '.png'));
      downloads.append(button);
    }
  });
  bar.append(printButton, exportButton);
  parent.append(bar, downloads);
}

export async function documentsPanel(parent, user, api, node, selectedId) {
  const records = await api('documents');
  const selected = records.find((item) => item.id === selectedId);
  const root = node('div', null, { class: 'documents-grid' });
  const list = node('aside', null, { class: 'document-box' });
  list.append(node('h1', 'Τα έγγραφά μου'));
  const newLink = node('a', 'Νέο έγγραφο', { href: '#workspace/documents', class: 'button' });
  list.append(newLink);
  if (!records.length) list.append(node('p', 'Δεν έχεις αποθηκευμένα έγγραφα.'));
  for (const item of records) {
    const link = node('a', item.title, { href: '#workspace/documents/' + item.id });
    if (selected?.id === item.id) link.setAttribute('aria-current', 'page');
    list.append(link);
  }

  const editor = node('section', null, { class: 'document-box' });
  editor.append(node('h2', selected ? 'Επεξεργασία εγγράφου' : 'Δημιουργία εγγράφου'));
  const form = node('form');
  const template = node('select', null, { 'aria-label': 'Πρότυπο' });
  const availableTemplates = user.role === 'lawyer'
    ? { ...templates, ...roleTemplates.lawyer }
    : { blank: templates.blank, ...roleTemplates[user.role] };
  for (const [id, [label]] of Object.entries(availableTemplates)) template.append(node('option', label, { value: id }));
  const title = node('input', null, { maxlength: '150', required: '' });
  const body = node('textarea', null, { maxlength: '12000', rows: '13', required: '' });
  const fields = [['Τίτλος', title], ['Κείμενο', body]];
  if (!selected) {
    fields.unshift(['Πρότυπο', template]);
    template.addEventListener('change', () => {
      const [name, text] = availableTemplates[template.value];
      if ((title.value || body.value) && !window.confirm('Να αντικατασταστεί το κείμενο με το επιλεγμένο πρότυπο;')) {
        template.value = template.dataset.previous || 'blank';
        return;
      }
      template.dataset.previous = template.value;
      title.value = template.value === 'blank' ? '' : name;
      body.value = text;
    });
  }
  title.value = selected?.title || '';
  body.value = selected?.body || '';
  for (const [name, input] of fields) {
    const label = node('label', name);
    label.append(input);
    form.append(label);
  }
  const status = node('p', '', { role: 'status' });
  const save = node('button', 'Αποθήκευση', { type: 'submit' });
  form.append(save, status);
  const snapshot = () => ({ title: title.value.trim(), body: body.value.trim() });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      const data = snapshot();
      if (!data.title || !data.body) throw new Error('Συμπλήρωσε τίτλο και κείμενο.');
      const { id } = await api(selected ? 'documents/' + selected.id : 'documents', data);
      if (selected) {
        const current = list.querySelector('[aria-current="page"]');
        if (current) current.textContent = data.title;
        status.textContent = 'Το έγγραφο αποθηκεύτηκε.';
      } else window.location.hash = '#workspace/documents/' + id;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
  const sample = node('details', null, { class: 'document-preview' });
  sample.append(node('summary', 'Προεπισκόπηση'));
  const preview = node('div');
  const controls = node('div', null, { class: 'document-tools', hidden: '' });
  const previous = node('button', 'Προηγούμενη', { type: 'button', class: 'secondary' });
  const next = node('button', 'Επόμενη', { type: 'button', class: 'secondary' });
  const pageLabel = node('span', '', { role: 'status' });
  controls.append(previous, pageLabel, next);
  let activePage = 0;
  const drawPreview = () => {
    if (!sample.open) return;
    const data = snapshot();
    const sheets = pages({ title: data.title || 'Τίτλος εγγράφου', body: data.body }, user);
    activePage = Math.max(0, Math.min(activePage, sheets.count - 1));
    preview.replaceChildren(sheets.sheet(activePage));
    controls.hidden = sheets.count <= 1;
    pageLabel.textContent = 'Σελίδα ' + (activePage + 1) + ' από ' + sheets.count;
    previous.disabled = activePage === 0;
    next.disabled = activePage === sheets.count - 1;
  };
  previous.addEventListener('click', () => { activePage--; drawPreview(); });
  next.addEventListener('click', () => { activePage++; drawPreview(); });
  sample.addEventListener('toggle', drawPreview);
  form.addEventListener('input', drawPreview);
  template.addEventListener('change', () => { activePage = 0; drawPreview(); });
  sample.append(controls, preview);
  editor.append(form, sample);
  outputs(editor, () => pages(snapshot(), user), () => title.value, node);
  root.append(list, editor);
  parent.append(root);
}

export function signaturePanel(parent, node) {
  const box = node('section', null, { class: 'document-box signature-box' });
  box.append(node('h1', 'Υπογραφή εγγράφου'),
    node('p', 'Άνοιξε PDF, PNG ή JPG, ζωγράφισε την υπογραφή και τοποθέτησέ τη πάνω στη σελίδα. Η επιλεγμένη σελίδα εξάγεται ως PNG. Το αρχείο επεξεργάζεται στη συσκευή σου.'));
  const upload = node('input', null, { type: 'file', accept: 'application/pdf,image/png,image/jpeg' });
  const label = node('label', 'Αρχείο PDF, PNG ή JPG');
  label.append(upload);
  const status = node('p', '', { role: 'status' });
  const signature = node('canvas', null, { width: '600', height: '180', 'aria-label': 'Πεδίο σχεδίασης υπογραφής' });
  signature.className = 'signature-pad';
  const output = node('canvas', null, { 'aria-label': 'Προεπισκόπηση εγγράφου. Πάτησε για να τοποθετήσεις την υπογραφή.' });
  output.className = 'signature-page';
  const controls = node('div', null, { hidden: '' });
  const clear = node('button', 'Καθαρισμός υπογραφής', { type: 'button', class: 'secondary' });
  const ctx = signature.getContext('2d');
  const page = output.getContext('2d');
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#183149';
  let original;
  let fileName;
  let placement;
  let pointer;
  let loadId = 0;
  let pdfTask;
  let pdf;
  const pagePicker = node('input', null, { type: 'number', min: '1', value: '1' });
  const pageLabel = node('label', 'Σελίδα PDF', { hidden: '' });
  pageLabel.append(pagePicker);

  function setPage(source, naturalWidth, naturalHeight) {
    const scale = Math.min(1, 3000 / Math.max(naturalWidth, naturalHeight));
    output.width = Math.max(1, Math.round(naturalWidth * scale));
    output.height = Math.max(1, Math.round(naturalHeight * scale));
    original = source;
    placement = [output.width * 0.8, output.height * 0.87];
    controls.hidden = false;
    paint();
  }

  async function renderPdfPage(id, number) {
    const source = await pdf.getPage(number);
    const basic = source.getViewport({ scale: 1 });
    const viewport = source.getViewport({ scale: Math.min(2, 2400 / Math.max(basic.width, basic.height)) });
    const canvas = node('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await source.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise;
    if (id === loadId) {
      fileName = upload.files[0].name.replace(/\.[^.]+$/, '') + '-p' + number + '-signed';
      setPage(canvas, canvas.width, canvas.height);
    }
  }
  pagePicker.addEventListener('change', async () => {
    const number = Number(pagePicker.value);
    if (!pdf || !Number.isInteger(number) || number < 1 || number > pdf.numPages) return;
    const id = ++loadId;
    try {
      status.textContent = 'Φόρτωση σελίδας…';
      await renderPdfPage(id, number);
      if (id === loadId) status.textContent = '';
    } catch {
      if (id === loadId) status.textContent = 'Η σελίδα δεν μπόρεσε να ανοίξει.';
    }
  });

  const point = (event, canvas) => {
    const rect = canvas.getBoundingClientRect();
    return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height];
  };
  const paint = () => {
    if (!original) return;
    page.clearRect(0, 0, output.width, output.height);
    page.drawImage(original, 0, 0, output.width, output.height);
    if (placement) {
      const stampWidth = Math.min(output.width * 0.35, output.height * 0.7);
      const stampHeight = stampWidth * signature.height / signature.width;
      const x = Math.max(0, Math.min(placement[0] - stampWidth / 2, output.width - stampWidth));
      const y = Math.max(0, Math.min(placement[1] - stampHeight / 2, output.height - stampHeight));
      page.drawImage(signature, x, y, stampWidth, stampHeight);
    }
  };
  signature.addEventListener('pointerdown', (event) => {
    if (pointer !== undefined) return;
    pointer = event.pointerId;
    signature.setPointerCapture(pointer);
    ctx.beginPath();
    ctx.moveTo(...point(event, signature));
  });
  signature.addEventListener('pointermove', (event) => {
    if (pointer !== event.pointerId) return;
    ctx.lineTo(...point(event, signature));
    ctx.stroke();
    paint();
  });
  signature.addEventListener('lostpointercapture', () => { pointer = undefined; });
  clear.addEventListener('click', () => {
    ctx.clearRect(0, 0, signature.width, signature.height);
    paint();
  });
  output.addEventListener('click', (event) => {
    placement = point(event, output);
    paint();
  });
  upload.addEventListener('change', async () => {
    const id = ++loadId;
    const [file] = upload.files;
    controls.hidden = true;
    pageLabel.hidden = true;
    const previousTask = pdfTask;
    pdfTask = undefined;
    pdf = undefined;
    if (previousTask) void previousTask.destroy().catch(() => {});
    original = undefined;
    placement = undefined;
    status.textContent = '';
    if (!file) return;
    if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type) || file.size > 20 * 1024 * 1024) {
      status.textContent = 'Επίλεξε PDF, PNG ή JPG έως 20 MB.';
      return;
    }
    if (file.type === 'application/pdf') {
      status.textContent = 'Φόρτωση PDF…';
      try {
        const cdn = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/';
        const lib = await import(cdn + 'pdf.mjs');
        lib.GlobalWorkerOptions.workerSrc = cdn + 'pdf.worker.mjs';
        const data = await file.arrayBuffer();
        if (id !== loadId) return;
        pdfTask = lib.getDocument({ data, isEvalSupported: false });
        const loaded = await pdfTask.promise;
        if (id !== loadId) return;
        pdf = loaded;
        pagePicker.max = String(pdf.numPages);
        pagePicker.value = '1';
        pageLabel.hidden = pdf.numPages <= 1;
        await renderPdfPage(id, 1);
        if (id === loadId) status.textContent = '';
      } catch {
        if (id === loadId) status.textContent = 'Το PDF δεν μπόρεσε να ανοίξει. Δοκίμασε ένα PDF χωρίς κωδικό.';
      }
      return;
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      if (id !== loadId) return;
      fileName = file.name.replace(/\.[^.]+$/, '') + '-signed';
      setPage(image, image.naturalWidth, image.naturalHeight);
    } catch {
      if (id === loadId) status.textContent = 'Η εικόνα δεν μπόρεσε να ανοίξει.';
    } finally {
      URL.revokeObjectURL(url);
    }
  });
  controls.append(node('h2', 'Σχεδίασε την υπογραφή'), signature, clear,
    node('h2', 'Τοποθέτηση στη σελίδα'), output);
  outputs(controls, () => ({ count: 1, sheet: () => output }), () => fileName, node);
  window.addEventListener('hashchange', () => {
    loadId++;
    if (pdfTask) void pdfTask.destroy().catch(() => {});
  }, { once: true });
  box.append(label, pageLabel, status, controls);
  parent.append(box);
}
