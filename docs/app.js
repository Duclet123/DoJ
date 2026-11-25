const penalCodeUrl = new URL('penal-code.json', document.currentScript.src);
const firebaseConfigUrl = new URL('firebase-config.json', document.currentScript.src);
const firebaseModuleUrl = new URL('firebase-workspace.js', document.currentScript.src);
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
  for (const [name, label, type, options] of fields) {
    const wrapper = node('label', label);
    const tag = type === 'textarea' || type === 'select' ? type : 'input';
    const input = node(tag, null, { name, required: '' });
    if (tag === 'input') input.type = type;
    if (tag === 'select') {
      input.append(node('option', 'Επιλογή…', { value: '' }));
      for (const option of options) input.append(node('option', option.username, { value: option.id }));
    }
    if (tag === 'textarea') input.maxLength = 12000;
    if (type === 'password') input.autocomplete = 'current-password';
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

async function workspace(id, loginRoute) {
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

  const bar = node('div', null, { class: 'toolbar' });
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
  shell.append(bar);

  if (id) {
    let record;
    try {
      record = await api('cases/' + id);
    } catch (error) {
      shell.append(node('p', error.message, { role: 'alert' }));
      return { shell };
    }
    const details = section(shell, number(record.id) + ' · ' + record.title);
    details.append(node('p', 'Κατηγορούμενος: ' + record.defendant + ' · ' + statuses[record.status]));
    details.append(node('p', 'Εισαγγελέας: ' + record.prosecutor + ' · Δικηγόρος: ' + record.lawyer + ' · Δικαστής: ' + record.judge));
    const print = node('button', 'Εκτύπωση φακέλου', { class: 'secondary' });
    print.classList.add('toolbar');
    print.addEventListener('click', () => window.print());
    details.append(print);
    const history = section(shell, 'Χρονολόγιο υπόθεσης');
    const grid = node('div', null, { class: 'cards' });
    for (const entry of record.entries) {
      const meta = entry.author + ' · ' + date(entry.created) + (entry.hearing_at ? ' · Ακρόαση ' + date(entry.hearing_at) : '');
      const item = card(kinds[entry.kind], meta, entry.body);
      if (entry.kind === 'note') item.classList.add('private');
      grid.append(item);
    }
    history.append(grid);

    const available = record.status === 'published' ? [] :
      record.status === 'decided' ? (user.role === 'judge' ? ['publish'] : []) :
      { lawyer: ['motion', 'note'], prosecutor: ['evidence'], judge: ['hearing', 'decision'] }[user.role];
    if (available.length) {
      const actions = section(shell, 'Ενέργειες');
      for (const kind of available) {
        const fields = [['body', kind === 'publish' ? 'Κείμενο για το δημόσιο site' : kinds[kind], 'textarea']];
        if (kind === 'hearing') fields.unshift(['hearingAt', 'Ημερομηνία και ώρα στη ζώνη της συσκευής σου', 'datetime-local']);
        form(actions, kinds[kind], fields, async (data) => {
          if (data.hearingAt) data.hearingAt = new Date(data.hearingAt).toISOString();
          await api('cases/' + id, { kind, ...data });
          await render();
        });
      }
    }
    return { shell };
  }

  shell.append(node('h1', 'Workspace · ' + roleNames[user.role]));
  const overview = section(shell, 'Οι υποθέσεις μου');
  const cases = await api('cases');
  const grid = node('div', null, { class: 'cards' });
  const search = node('input', null, { type: 'search', placeholder: 'Αριθμός υπόθεσης, τίτλος ή κατηγορούμενος', 'aria-label': 'Αναζήτηση υποθέσεων' });
  const updateCases = () => {
    const query = search.value.trim().toLocaleLowerCase('el');
    const matches = cases.filter((item) => [number(item.id), item.title, item.defendant].join(' ').toLocaleLowerCase('el').includes(query));
    grid.replaceChildren(...matches.map((item) => {
      const itemLink = link('', '#workspace/' + item.id, 'card-link');
      itemLink.append(card(number(item.id) + ' · ' + item.title, statuses[item.status]));
      return itemLink;
    }));
    if (!matches.length) grid.append(node('p', cases.length ? 'Δεν βρέθηκαν υποθέσεις.' : 'Δεν σου έχουν ανατεθεί υποθέσεις.'));
  };
  search.addEventListener('input', updateCases);
  if (cases.length) overview.append(search);
  overview.append(grid);
  updateCases();

  if (user.role === 'prosecutor') {
    const create = section(shell, 'Κατάθεση κατηγορητηρίου');
    const assignable = await api('assignable');
    const names = (role) => assignable.filter((account) => account.role === role).sort((a, b) => a.username.localeCompare(b.username, 'el'));
    if (!names('lawyer').length || !names('judge').length) {
      create.append(node('p', 'Για νέα υπόθεση χρειάζεται τουλάχιστον ένας λογαριασμός δικηγόρου και ένας δικαστή.'));
    } else {
      form(create, 'Κατάθεση και δημιουργία υπόθεσης', [
        ['title', 'Τίτλος', 'text'], ['defendant', 'Κατηγορούμενος', 'text'],
        ['lawyer', 'Δικηγόρος', 'select', names('lawyer')], ['judge', 'Δικαστής', 'select', names('judge')],
        ['body', 'Κατηγορητήριο', 'textarea']
      ], async (data) => {
        const created = await api('cases', data);
        location.hash = '#workspace/' + created.id;
      });
    }
  }
  return { shell };
}

let renderId = 0;
async function render() {
  const current = ++renderId;
  const fragment = location.hash.slice(1);
  const match = fragment.match(/^workspace(?:\/([A-Za-z0-9]{20}))?$/);
  view.replaceChildren(node('p', 'Φόρτωση…', { class: 'wrap content', role: 'status' }));
  try {
    const loginRoute = fragment === 'login';
    const page = loginRoute || match ? workspace(match?.[1], loginRoute) :
      fragment === 'penal-code' ? penalCode() : publicSite(fragment);
    const { shell, anchor } = await page;
    if (current !== renderId) return;
    view.replaceChildren(shell);
    if (anchor) anchor.scrollIntoView();
    else window.scrollTo(0, 0);
  } catch (error) {
    if (current === renderId) view.replaceChildren(node('p', error.message, { class: 'wrap content', role: 'alert' }));
  }
}

window.addEventListener('hashchange', render);
render();
