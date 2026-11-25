const penalCodeUrl = new URL('penal-code.json', document.currentScript.src);
const firebaseConfigUrl = new URL('firebase-config.json', document.currentScript.src);
const firebaseModuleUrl = new URL('firebase-workspace.js?v=case-access-2', document.currentScript.src);
const view = document.querySelector('#view');
const accountLink = document.querySelector('#account-link');
let connection;

const roleNames = { lawyer: 'Δικηγόρος', prosecutor: 'Εισαγγελέας', judge: 'Δικαστής' };
const statuses = { filed: 'Κατατέθηκε', scheduled: 'Ορίστηκε ακρόαση', decided: 'Εκδόθηκε απόφαση', published: 'Δημοσιεύτηκε' };
const kinds = {
  indictment: 'Κατηγορητήριο', motion: 'Αίτηση υπεράσπισης', note: 'Ιδιωτική σημείωση',
  evidence: 'Αποδεικτικό στοιχείο', hearing: 'Ορισμός ακρόασης', decision: 'Απόφαση', publish: 'Δημοσιευμένη απόφαση'
};

function node(tag, value, attributes = {}) {
  const element = document.createElement(tag);
  if (value != null) element.textContent = value;
  for (const [name, attribute] of Object.entries(attributes)) element.setAttribute(name, attribute);
  return element;
}

const link = (label, href, className) => node('a', label, { href, class: className || '' });
const date = (value) => new Date(value).toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'short' });
const number = (id) => 'DOJ-' + String(id).slice(0, 10);

async function connectFirebase() {
  const response = await fetch(firebaseConfigUrl, { cache: 'no-cache' });
  if (!response.ok) throw new Error('Η ρύθμιση του Firebase δεν φορτώθηκε.');
  const config = await response.json();
  if (!config.apiKey || !config.projectId || !config.appId) return null;
  const { connect } = await import(firebaseModuleUrl.href);
  return connect(config);
}

async function api(path, payload) {
  connection ??= connectFirebase().catch((error) => {
    connection = undefined;
    throw error;
  });
  const request = await connection;
  if (!request) {
    if (path === 'public') return { hearings: [], decisions: [] };
    if (path === 'penal') {
      const fallback = await fetch(penalCodeUrl);
      if (!fallback.ok) throw new Error('Ο ποινικός κώδικας δεν φορτώθηκε.');
      return fallback.json();
    }
    throw Object.assign(new Error('Η σύνδεση προσωπικού εκκρεμεί μέχρι να ενεργοποιηθεί το Firebase.'), { status: 503 });
  }
  try {
    return await request(path, payload);
  } catch (error) {
    if (error.code === 'permission-denied') throw Object.assign(new Error('Δεν έχεις πρόσβαση για αυτή την ενέργεια.'), { status: 403 });
    if (error.code === 'unavailable') throw new Error('Η υπηρεσία είναι προσωρινά μη διαθέσιμη.');
    throw error;
  }
}

function card(title, detail, body) {
  const item = node('article', null, { class: 'card' });
  item.append(node('h3', title), node('small', detail));
  if (body) item.append(node('p', body));
  return item;
}

function form(parent, submitLabel, fields, submit) {
  const element = node('form');
  for (const [name, label, type, options, optional] of fields) {
    const wrapper = node('label', label);
    const tag = type === 'textarea' || type === 'select' ? type : 'input';
    const input = node(tag, null, { name, required: '' });
    if (optional) input.removeAttribute('required');
    if (tag === 'input') input.type = type;
    if (tag === 'select') {
      input.append(node('option', 'Επιλογή…', { value: '' }));
      for (const option of options) input.append(node('option', option.username, { value: option.id }));
    }
    if (tag === 'textarea') input.maxLength = 12000;
    if (type === 'password') input.autocomplete = name === 'newPassword' ? 'new-password' : 'current-password';
    if (name === 'username') input.autocomplete = 'username';
    wrapper.append(input);
    element.append(wrapper);
  }
  const button = node('button', submitLabel, { type: 'submit' });
  const error = node('p', '', { class: 'error', role: 'alert', hidden: '' });
  element.append(button, error);
  element.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    error.hidden = true;
    try {
      await submit(Object.fromEntries(new FormData(element)));
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  parent.append(element);
}

function section(parent, title, id) {
  const area = node('section', null, { id });
  area.append(node('h2', title));
  parent.append(area);
  return area;
}

async function publicSite(fragment) {
  const shell = node('div');
  const hero = node('div', null, { class: 'hero' });
  const intro = node('div', null, { class: 'wrap' });
  intro.append(node('h1', 'Department of Justice'), node('p', 'Δημόσια πύλη δικαιοσύνης του RP. Δες τις προγραμματισμένες ακροάσεις και τις δημοσιευμένες αποφάσεις.'), link('Πρόγραμμα ακροάσεων', '#hearings', 'button'));
  hero.append(intro);
  const content = node('div', null, { class: 'wrap' });
  const hearings = section(content, 'Προσεχείς ακροάσεις', 'hearings');
  const decisions = section(content, 'Δημοσιευμένες αποφάσεις', 'decisions');
  shell.append(hero, content);
  let records;
  try {
    records = await api('public');
  } catch {
    hearings.append(node('p', 'Το πρόγραμμα ακροάσεων δεν είναι διαθέσιμο αυτή τη στιγμή.'));
    decisions.append(node('p', 'Οι δημοσιευμένες αποφάσεις δεν είναι διαθέσιμες αυτή τη στιγμή.'));
    return { shell, anchor: fragment === 'hearings' ? hearings : fragment === 'decisions' ? decisions : null };
  }
  for (const [area, list, empty, makeCard] of [
    [hearings, records.hearings, 'Δεν υπάρχουν προγραμματισμένες ακροάσεις.', (row) => card(number(row.case_id), date(row.hearing_at))],
    [decisions, records.decisions, 'Δεν έχουν δημοσιευτεί αποφάσεις.', (row) => card(number(row.case_id), date(row.created), row.body)]
  ]) {
    const grid = node('div', null, { class: 'cards' });
    if (list.length) grid.append(...list.map(makeCard));
    else grid.append(node('p', empty));
    area.append(grid);
  }
  return { shell, anchor: fragment === 'hearings' ? hearings : fragment === 'decisions' ? decisions : null };
}

async function penalCode() {
  const shell = node('div', null, { class: 'wrap content' });
  shell.append(node('h1', 'Ποινικός Κώδικας'));
  const articles = (await api('penal')).sort((a, b) => a.code.localeCompare(b.code, 'el', { numeric: true }));
  if (!articles.length) {
    shell.append(node('p', 'Δεν έχουν δημοσιευτεί ακόμα άρθρα του ποινικού κώδικα.'));
    return { shell };
  }

  const filters = node('div', null, { class: 'filters' });
  const search = node('input', null, { type: 'search', placeholder: 'Αριθμός άρθρου, τίτλος ή λέξη-κλειδί', 'aria-label': 'Αναζήτηση άρθρων' });
  const category = node('select', null, { 'aria-label': 'Κατηγορία άρθρου' });
  category.append(node('option', 'Όλες οι κατηγορίες', { value: '' }));
  for (const name of [...new Set(articles.map((article) => article.category))].sort()) {
    category.append(node('option', name, { value: name }));
  }
  filters.append(search, category);
  const results = node('div', null, { class: 'cards', 'aria-live': 'polite' });
  const normalize = (value) => value.toLocaleLowerCase('el').normalize('NFD').replace(/\p{M}/gu, '').replaceAll('ς', 'σ');
  function update() {
    const query = normalize(search.value.trim());
    const matches = articles.filter((article) =>
      (!category.value || category.value === article.category) &&
      normalize([article.code, article.title, article.description].join(' ')).includes(query)
    );
    results.replaceChildren(...matches.map((article) => {
      const item = card(article.code + ' · ' + article.title, article.category, article.description);
      if (article.penalty) item.append(node('p', 'Ποινή: ' + article.penalty));
      if (article.bail) item.append(node('p', 'Εγγύηση: ' + article.bail));
      return item;
    }));
    if (!matches.length) results.append(node('p', 'Δεν βρέθηκαν άρθρα.'));
  }
  search.addEventListener('input', update);
  category.addEventListener('change', update);
  shell.append(filters, results);
  update();
  return { shell };
}

async function staffPanel(shell) {
  const area = section(shell, 'Διαχείριση προσωπικού');
  const accounts = await api('staff');
  const roles = Object.entries(roleNames).map(([id, username]) => ({ id, username }));
  const message = node('p', '', { role: 'status' });
  const create = section(area, 'Νέος λογαριασμός');
  form(create, 'Δημιουργία λογαριασμού', [
    ['email', 'Email', 'email'],
    ['username', 'Όνομα εμφάνισης', 'text'],
    ['newPassword', 'Αρχικός κωδικός (τουλάχιστον 8 χαρακτήρες)', 'password'],
    ['role', 'Ρόλος', 'select', roles]
  ], async ({ newPassword, ...data }) => {
    await api('staff', { ...data, password: newPassword });
    await render('Ο λογαριασμός δημιουργήθηκε.');
  });
  const roster = section(area, 'Λογαριασμοί προσωπικού');
  const grid = node('div', null, { class: 'cards' });
  const states = [{ id: 'active', username: 'Ενεργός' }, { id: 'disabled', username: 'Ανενεργός' }];
  for (const account of accounts) {
    const item = card(account.username, roleNames[account.role] + (account.admin ? ' · Admin' : ''));
    if (!account.admin) {
      form(item, 'Αποθήκευση', [['role', 'Ρόλος', 'select', roles], ['state', 'Πρόσβαση', 'select', states]], async (data) => {
        await api('staff/' + account.id, { role: data.role, disabled: data.state === 'disabled' });
        await render('Οι ρυθμίσεις αποθηκεύτηκαν.');
      });
      item.querySelector('[name="role"]').value = account.role;
      item.querySelector('[name="state"]').value = account.disabled ? 'disabled' : 'active';
    }
    grid.append(item);
  }
  roster.append(grid);
  area.prepend(message);
  return message;
}

const juryStates = { candidate: 'Υποψήφιος', seated: 'Επιλεγμένος', alternate: 'Αναπληρωματικός', excused: 'Απαλλάχθηκε' };

async function caseAccess(parent, record) {
  const roster = await api('assignable');
  const area = section(parent, 'Πρόσβαση και αναθέσεις');
  area.append(node('p', 'Επίλεξε ποιος έχει πρόσβαση ανά ρόλο. Η κενή επιλογή αφαιρεί την ανάθεση.'));
  form(area, 'Αποθήκευση αναθέσεων', Object.entries(roleNames).map(([role, label]) => [
    role, label, 'select', roster.filter((account) => account.role === role), true
  ]), async (data) => {
    await api('cases/' + record.id, { kind: 'assignments', ...data });
    await render();
  });
  for (const [role, selected] of Object.entries(record.assignments)) area.querySelector('[name="' + role + '"]').value = selected;
}

function caseEntries(parent, label, entries) {
  const area = section(parent, label);
  const grid = node('div', null, { class: 'cards' });
  if (!entries.length) grid.append(node('p', 'Δεν υπάρχουν καταχωρίσεις.'));
  for (const entry of entries) {
    const meta = [entry.author, date(entry.created), entry.hearing_at && 'Ακρόαση ' + date(entry.hearing_at),
      juryStates[entry.juryStatus]].filter(Boolean).join(' · ');
    const item = card(entry.label || kinds[entry.kind], meta, entry.body);
    if (entry.kind === 'note') item.classList.add('private');
    if (entry.kind === 'exhibit' && entry.url?.startsWith('https://')) {
      item.append(node('a', 'Άνοιγμα exhibit', { href: entry.url, target: '_blank', rel: 'noopener noreferrer' }));
    }
    grid.append(item);
  }
  area.append(grid);
}

let activeCaseTab;

function caseTabs(parent, id, tabs) {
  const bar = node('div', null, { class: 'case-tabs', role: 'tablist', 'aria-label': 'Ενότητες υπόθεσης' });
  const rows = tabs.map(([key, label, panel]) => {
    const button = node('button', label, { type: 'button', role: 'tab', id: 'tab-' + key, 'aria-controls': 'panel-' + key });
    panel.id = 'panel-' + key;
    panel.classList.add('case-panel');
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    panel.tabIndex = 0;
    bar.append(button);
    return { key, button, panel };
  });
  const select = (chosen) => {
    activeCaseTab = { id, key: chosen.key };
    for (const row of rows) {
      const selected = row === chosen;
      row.button.setAttribute('aria-selected', String(selected));
      row.button.tabIndex = selected ? 0 : -1;
      row.panel.hidden = !selected;
    }
  };
  rows.forEach((row, index) => {
    row.button.addEventListener('click', () => select(row));
    row.button.addEventListener('keydown', (event) => {
      const indices = { ArrowLeft: (index - 1 + rows.length) % rows.length, ArrowRight: (index + 1) % rows.length, Home: 0, End: rows.length - 1 };
      if (!Object.hasOwn(indices, event.key)) return;
      event.preventDefault();
      const next = rows[indices[event.key]];
      select(next);
      next.button.focus();
      next.button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
  });
  const previous = activeCaseTab?.id === id && rows.find((row) => row.key === activeCaseTab.key);
  select(previous || rows[0]);
  parent.append(bar, ...rows.map((row) => row.panel));
}

async function workspace(id, loginRoute, adminRoute) {
  const shell = node('div', null, { class: 'wrap content' });
  let user;
  try {
    user = await api('me');
  } catch (error) {
    if (![401, 403, 503].includes(error.status)) throw error;
    shell.append(node('h1', 'Σύνδεση προσωπικού'));
    if (error.status !== 401) shell.append(node('p', error.message, { role: 'status' }));
    if (error.status === 403) {
      const reset = node('button', 'Αποσύνδεση', { class: 'secondary' });
      reset.addEventListener('click', async () => {
        await api('logout', {});
        await render();
      });
      shell.append(reset);
    }
    if (error.status === 401) {
      form(shell, 'Σύνδεση', [['username', 'Email', 'email'], ['password', 'Κωδικός', 'password']], async (data) => {
        await api('login', data);
        if (loginRoute) location.hash = '#workspace';
        else await render();
      });
    }
    return { shell };
  }

  if (loginRoute) {
    location.replace('#workspace');
    return { shell };
  }
  accountLink.textContent = 'Ο λογαριασμός μου';
  accountLink.href = '#workspace';

  const bar = node('div', null, { class: 'toolbar workspace-bar' });
  const logout = node('button', 'Αποσύνδεση', { class: 'secondary' });
  const logoutError = node('span', '', { class: 'error', role: 'alert' });
  logout.addEventListener('click', async () => {
    try {
      await api('logout', {});
      accountLink.textContent = 'Σύνδεση';
      accountLink.href = '#login';
      location.hash = '#login';
    } catch (error) {
      logoutError.textContent = error.message;
    }
  });
  bar.append(link('Οι υποθέσεις μου', '#workspace'), node('span', roleNames[user.role] + ' · ' + user.username), logout, logoutError);
  if (user.admin === true) bar.append(link('Διαχείριση προσωπικού', '#workspace/admin'));
  shell.append(bar);
  if (adminRoute) {
    if (user.admin !== true) {
      shell.append(node('p', 'Απαιτείται πρόσβαση διαχειριστή.', { role: 'alert' }));
      return { shell };
    }
    const status = await staffPanel(shell);
    return { shell, status };
  }

  if (id) {
    let record;
    try {
      record = await api('cases/' + id);
    } catch (error) {
      shell.append(node('p', error.message, { role: 'alert' }));
      return { shell };
    }
    const details = node('section', null, { class: 'case-summary' });
    const top = node('div', null, { class: 'case-summary-top' });
    const heading = node('div');
    heading.append(node('p', number(record.id), { class: 'case-reference' }), node('h1', record.title));
    const print = node('button', 'Εκτύπωση φακέλου', { type: 'button', class: 'case-print' });
    print.addEventListener('click', () => window.print());
    top.append(heading, print);
    const facts = node('dl', null, { class: 'case-facts' });
    for (const [label, value] of [
      ['Κατάσταση', statuses[record.status]], ['Κατηγορούμενος', record.defendant],
      ['Εισαγγελέας', record.prosecutor], ['Δικηγόρος', record.lawyer], ['Δικαστής', record.judge]
    ]) {
      const fact = node('div');
      fact.append(node('dt', label), node('dd', value));
      facts.append(fact);
    }
    details.append(top, facts);
    shell.append(details);

    const indictment = node('div');
    const exhibits = node('div');
    const jury = node('div');
    const history = node('div', null, { class: 'case-history' });
    const tabs = [['indictment', 'Κατηγορητήριο', indictment], ['exhibits', 'Exhibits', exhibits],
      ['jury', 'Ένορκοι', jury], ['history', 'Χρονολόγιο', history]];
    caseEntries(indictment, 'Κατηγορητήριο', record.entries.filter((entry) => entry.kind === 'indictment'));
    caseEntries(exhibits, 'Exhibits', record.entries.filter((entry) => ['exhibit', 'evidence'].includes(entry.kind)));
    const jurors = new Map();
    for (const entry of record.entries.filter((item) => item.kind === 'juror')) {
      jurors.set(entry.label.toLocaleLowerCase('el'), entry);
    }
    caseEntries(jury, 'Ένορκοι', [...jurors.values()]);
    caseEntries(history, 'Χρονολόγιο υπόθεσης', record.entries);

    const available = record.status === 'published' ? [] :
      record.status === 'decided' ? (user.role === 'judge' ? ['publish'] : []) :
      ['exhibit', ...{ lawyer: ['motion', 'note'], prosecutor: [], judge: ['juror', 'hearing', 'decision'] }[user.role]];
    if (available.length) {
      const actions = node('div', null, { class: 'case-actions' });
      if (available.some((kind) => kind !== 'exhibit' && kind !== 'juror')) tabs.push(['actions', 'Ενέργειες', actions]);
      for (const kind of available) {
        const fields = [['body', kind === 'publish' ? 'Κείμενο για το δημόσιο site' : kinds[kind], 'textarea']];
        const actionLabel = { exhibit: 'Καταχώριση exhibit', juror: 'Καταχώριση ενόρκου' }[kind] || kinds[kind];
        if (kind === 'exhibit') {
          fields[0][1] = 'Περιγραφή exhibit';
          fields.unshift(['label', 'Κωδικός ή τίτλος exhibit', 'text'], ['url', 'Σύνδεσμος HTTPS (προαιρετικός)', 'url', null, true]);
        }
        if (kind === 'juror') {
          fields[0][1] = 'Σημειώσεις επιλογής';
          fields.unshift(['label', 'Όνομα ή αριθμός ενόρκου', 'text'],
            ['juryStatus', 'Κατάσταση', 'select', Object.entries(juryStates).map(([id, username]) => ({ id, username }))]);
        }
        if (kind === 'hearing') fields.unshift(['hearingAt', 'Ημερομηνία και ώρα στη ζώνη της συσκευής σου', 'datetime-local']);
        const target = kind === 'exhibit' ? exhibits : kind === 'juror' ? jury : actions;
        const panel = node('details', null, { class: 'case-action' });
        panel.append(node('summary', actionLabel));
        target.append(panel);
        form(panel, actionLabel, fields, async (data) => {
          if (data.hearingAt) data.hearingAt = new Date(data.hearingAt).toISOString();
          await api('cases/' + id, { kind, ...data });
          await render();
        });
      }
    }
    if (record.creator === user.id) {
      const access = node('div', null, { class: 'case-actions' });
      tabs.push(['access', 'Πρόσβαση', access]);
      try {
        await caseAccess(access, record);
      } catch (error) {
        access.append(node('p', error.message, { role: 'alert' }));
      }
    }
    caseTabs(shell, id, tabs);
    return { shell };
  }

  shell.append(node('h1', 'Workspace · ' + roleNames[user.role]));
  const dashboard = node('div', null, { class: 'workspace-grid' });
  shell.append(dashboard);
  const overview = section(dashboard, 'Οι υποθέσεις μου');
  const create = section(dashboard, 'Νέα υπόθεση');
  create.classList.add('workspace-create');
  form(create, 'Δημιουργία υπόθεσης', [
    ['title', 'Τίτλος', 'text'], ['defendant', 'Κατηγορούμενος', 'text'],
    ['body', 'Κατηγορητήριο', 'textarea']
  ], async (data) => {
    let created;
    try {
      created = await api('cases', data);
    } catch (error) {
      if (error.status !== 403) throw error;
      throw new Error('Η δημιουργία υπόθεσης απορρίφθηκε. Ζήτησε από τον διαχειριστή να ελέγξει τους κανόνες Firestore του DoJ και την πρόσβαση του λογαριασμού.');
    }
    location.hash = '#workspace/' + created.id;
  });

  let cases;
  try {
    cases = await api('cases');
  } catch (error) {
    overview.append(node('p', 'Η λίστα υποθέσεων δεν φορτώθηκε. ' + error.message, { role: 'alert' }));
    return { shell };
  }
  const grid = node('div', null, { class: 'cards' });
  const search = node('input', null, { type: 'search', placeholder: 'Αριθμός υπόθεσης, τίτλος ή κατηγορούμενος', 'aria-label': 'Αναζήτηση υποθέσεων' });
  const updateCases = () => {
    const query = search.value.trim().toLocaleLowerCase('el');
    const matches = cases.filter((item) => [number(item.id), item.title, item.defendant].join(' ').toLocaleLowerCase('el').includes(query));
    grid.replaceChildren(...matches.map((item) => {
      const itemLink = link('', '#workspace/' + item.id, 'card-link');
      itemLink.append(card(item.title, number(item.id) + ' · ' + statuses[item.status], item.defendant));
      return itemLink;
    }));
    if (!matches.length) grid.append(node('p', cases.length ? 'Δεν βρέθηκαν υποθέσεις.' : 'Δεν σου έχουν ανατεθεί υποθέσεις.'));
  };
  search.addEventListener('input', updateCases);
  if (cases.length) overview.append(search);
  overview.append(grid);
  updateCases();

  return { shell };
}

let renderId = 0;
async function render(message) {
  const current = ++renderId;
  const fragment = location.hash.slice(1);
  const match = fragment.match(/^workspace(?:\/([A-Za-z0-9]{20}))?$/);
  view.replaceChildren(node('p', 'Φόρτωση…', { class: 'wrap content', role: 'status' }));
  try {
    const loginRoute = fragment === 'login';
    const adminRoute = fragment === 'workspace/admin';
    const page = loginRoute || adminRoute || match ? workspace(match?.[1], loginRoute, adminRoute) :
      fragment === 'penal-code' ? penalCode() : publicSite(fragment);
    const { shell, anchor, status } = await page;
    if (current !== renderId) return;
    if (status && typeof message === 'string') status.textContent = message;
    view.replaceChildren(shell);
    if (anchor) anchor.scrollIntoView();
    else window.scrollTo(0, 0);
  } catch (error) {
    if (current === renderId) view.replaceChildren(node('p', error.message, { class: 'wrap content', role: 'alert' }));
  }
}

window.addEventListener('hashchange', render);
render();
