const penalCodeUrl = new URL('penal-code.json', document.currentScript.src);
const firebaseConfigUrl = new URL('firebase-config.json', document.currentScript.src);
const firebaseModuleUrl = new URL('firebase-workspace.js?v=portal-services-1', document.currentScript.src);
const view = document.querySelector('#view');
const accountLink = document.querySelector('#account-link');
let connection;

const roleNames = { lawyer: 'Δικηγόρος', prosecutor: 'Εισαγγελέας', judge: 'Δικαστής' };
const statuses = { filed: 'Κατατέθηκε', scheduled: 'Ορίστηκε ακρόαση', decided: 'Εκδόθηκε απόφαση', published: 'Δημοσιεύτηκε' };
const kinds = {
  charge: 'Κατηγορία', verdict: 'Ετυμηγορία',
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
  intro.append(node('span', 'Court of San Andreas', { class: 'hero-kicker' }), node('h1', 'Department of Justice'), node('p', 'Δημόσια πύλη δικαιοσύνης του RP. Δες τις προγραμματισμένες ακροάσεις και τις δημοσιευμένες αποφάσεις.'), link('Αιτήσεις', '#applications', 'button'));
  hero.append(intro);
  const content = node('div', null, { class: 'wrap public-records' });
  const services = node('nav', null, { class: 'public-services', 'aria-label': 'Δημόσιες υπηρεσίες' });
  for (const [title, detail, href] of [
    ['Ποινικός Κώδικας', 'Δημοσιευμένα άρθρα', '#penal-code'],
    ['Ακροάσεις', 'Πρόγραμμα δικαστηρίου', '#hearings'],
    ['Αποφάσεις', 'Δημόσιες δικαστικές αποφάσεις', '#decisions'],
    ['Legal Framework', 'Κανόνες και διαδικασίες RP', '#legal-framework']
  ]) {
    const item = link('', href);
    item.append(node('strong', title), node('small', detail));
    services.append(item);
  }
  content.append(services);
  const introduction = section(content, 'Το Department of Justice');
  introduction.append(node('p', 'Η δημόσια πύλη του DoJ για το San Andreas RP. Εδώ βρίσκεις τη δικαστική ομάδα, το πρόγραμμα ακροάσεων και τα δημοσιευμένα κείμενα. Αν ενδιαφέρεσαι να ενταχθείς στο προσωπικό, μπορείς να υποβάλεις αίτηση.'));
  const roster = section(content, 'Roster', 'roster');
  const rosterGrid = node('div', null, { class: 'cards' });
  roster.append(rosterGrid);
  try {
    const members = await api('roster');
    for (const member of members.sort((a, b) => a.username.localeCompare(b.username, 'el'))) {
      rosterGrid.append(card(member.username, roleNames[member.role]));
    }
    if (!members.length) rosterGrid.append(node('p', 'Δεν έχουν δημοσιευτεί ακόμη μέλη προσωπικού.'));
  } catch {
    rosterGrid.append(node('p', 'Το Roster δεν είναι διαθέσιμο αυτή τη στιγμή.'));
  }
  const hearings = section(content, 'Προσεχείς ακροάσεις', 'hearings');
  const decisions = section(content, 'Δημοσιευμένες αποφάσεις', 'decisions');
  shell.append(hero, content);
  let records;
  try {
    records = await api('public');
  } catch {
    hearings.append(node('p', 'Το πρόγραμμα ακροάσεων δεν είναι διαθέσιμο αυτή τη στιγμή.'));
    decisions.append(node('p', 'Οι δημοσιευμένες αποφάσεις δεν είναι διαθέσιμες αυτή τη στιγμή.'));
    return { shell, anchor: fragment === 'hearings' ? hearings : fragment === 'decisions' ? decisions : fragment === 'roster' ? roster : null };
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
  return { shell, anchor: fragment === 'hearings' ? hearings : fragment === 'decisions' ? decisions : fragment === 'roster' ? roster : null };
}

function legalFramework() {
  const shell = node('div', null, { class: 'wrap content' });
  shell.append(node('h1', 'Legal Framework'),
    node('p', 'Πηγές και διαδικασίες του δικαστικού roleplay στο San Andreas. Οι τροπολογίες και οι αποφάσεις των ΗΠΑ χρησιμεύουν ως υλικό αναφοράς για το RP. Η εφαρμογή τους στο παιχνίδι καθορίζεται από τους κανόνες του server.'));
  const references = section(shell, 'Πηγές');
  references.append(link('Ποινικός Κώδικας', '#penal-code', 'button'));
  const procedures = section(shell, 'Δικαστική διαδικασία');
  procedures.append(node('p', 'Ο φάκελος υπόθεσης συγκεντρώνει κατηγορητήριο, κατηγορίες ανά άρθρο, exhibits, ενόρκους και αποφάσεις. Το δημόσιο πρόγραμμα εμφανίζει τις δημοσιευμένες ακροάσεις.'));
  procedures.append(link('Πρόγραμμα ακροάσεων', '#hearings'), node('br'), link('Δημοσιευμένες αποφάσεις', '#decisions'));
  const amendments = section(shell, 'Συνταγματικές τροπολογίες');
  const cases = section(shell, 'Βασική νομολογία');
  const bill = 'https://www.archives.gov/founding-docs/bill-of-rights-transcript';
  const opinion = (volume, page) => 'https://supreme.justia.com/cases/federal/us/' + volume + '/' + page + '/';
  const sources = [
    [amendments, [
      ['4η Τροπολογία', 'Έρευνες και κατασχέσεις', 'Προστατεύει από αδικαιολόγητες έρευνες και κατασχέσεις. Τα εντάλματα απαιτούν probable cause και συγκεκριμένη περιγραφή του τόπου και των προσώπων ή πραγμάτων που αφορά το ένταλμα.', bill],
      ['5η Τροπολογία', 'Αυτοενοχοποίηση και double jeopardy', 'Προστατεύει από εξαναγκασμό σε αυτοενοχοποίηση σε ποινική υπόθεση και από δεύτερη δίωξη για το ίδιο αδίκημα μετά την ενεργοποίηση της σχετικής προστασίας.', bill],
      ['6η Τροπολογία', 'Δικαιώματα στη δίκη', 'Προβλέπει, μεταξύ άλλων, ταχεία και δημόσια δίκη, ενημέρωση για την κατηγορία, συνδρομή δικηγόρου και δικαίωμα εξέτασης των μαρτύρων κατηγορίας.', bill],
      ['8η Τροπολογία', 'Εγγύηση και ποινές', 'Απαγορεύει την υπερβολική εγγύηση, τα υπερβολικά πρόστιμα και τις σκληρές και ασυνήθιστες ποινές.', bill],
      ['14η Τροπολογία', 'Due process και ίση προστασία', 'Δεσμεύει τις πολιτείες ως προς τη νόμιμη διαδικασία και την ίση προστασία των νόμων.', 'https://www.archives.gov/founding-docs/amendments-11-27#amendment-xiv']
    ]],
    [cases, [
      ['Terry v. Ohio', '392 U.S. 1 (1968) · Stop and frisk', 'Η προσωρινή στάση απαιτεί εύλογη υποψία εγκληματικής δραστηριότητας. Ο περιορισμένος εξωτερικός έλεγχος για όπλα απαιτεί επιπλέον εύλογη πεποίθηση ότι το άτομο είναι οπλισμένο και επικίνδυνο.', opinion(392, 1)],
      ['Miranda v. Arizona', '384 U.S. 436 (1966) · Ανάκριση υπό κράτηση', 'Πριν από ανάκριση υπό κράτηση, ο ύποπτος πρέπει κατά κανόνα να ενημερωθεί για το δικαίωμα σιωπής και συνδρομής δικηγόρου, ώστε οι δηλώσεις του να μπορούν να χρησιμοποιηθούν στην κύρια απόδειξη της κατηγορούσας αρχής.', opinion(384, 436)],
      ['Mapp v. Ohio', '367 U.S. 643 (1961) · Αποκλεισμός αποδεικτικών', 'Εφάρμοσε στις πολιτειακές ποινικές δίκες τον κανόνα αποκλεισμού αποδεικτικών που αποκτήθηκαν κατά παράβαση της 4ης Τροπολογίας, με τις εξαιρέσεις που αναγνωρίζει η μεταγενέστερη νομολογία.', opinion(367, 643)],
      ['Gideon v. Wainwright', '372 U.S. 335 (1963) · Διορισμός συνηγόρου', 'Οι πολιτείες οφείλουν να παρέχουν συνήγορο σε κατηγορούμενους για κακούργημα που αδυνατούν να πληρώσουν δικηγόρο.', opinion(372, 335)],
      ['Brady v. Maryland', '373 U.S. 83 (1963) · Ευνοϊκά αποδεικτικά', 'Η απόκρυψη από την κατηγορούσα αρχή ευνοϊκού αποδεικτικού υλικού για τον κατηγορούμενο παραβιάζει το due process όταν το υλικό είναι ουσιώδες ως προς την ενοχή ή την ποινή.', opinion(373, 83)],
      ['Crawford v. Washington', '541 U.S. 36 (2004) · Εξέταση μαρτύρων', 'Κατά κανόνα, μαρτυρικές δηλώσεις προσώπου που δεν καταθέτει στη δίκη μπορούν να χρησιμοποιηθούν σε βάρος του κατηγορουμένου μόνο εάν το πρόσωπο δεν είναι διαθέσιμο και είχε δοθεί προηγουμένως ευκαιρία αντεξέτασης.', opinion(541, 36)]
    ]]
  ];
  for (const [group, entries] of sources) {
    const grid = node('div', null, { class: 'cards' });
    for (const [title, category, summary, url] of entries) {
      const item = card(title, category, summary);
      item.append(node('a', 'Πλήρες κείμενο', { href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Πλήρες κείμενο ' + title }));
      grid.append(item);
    }
    group.append(grid);
  }
  return { shell };
}

function applicationsPage() {
  const shell = node('div', null, { class: 'wrap content' });
  shell.append(node('h1', 'Αίτηση ένταξης στο DoJ'),
    node('p', 'Χρησιμοποίησε το όνομα του χαρακτήρα σου και το Discord username με το οποίο μπορεί να σε βρει η ομάδα.'));
  const roles = Object.entries(roleNames).map(([id, username]) => ({ id, username }));
  const status = node('p', '', { role: 'status' });
  form(shell, 'Υποβολή αίτησης', [
    ['name', 'Όνομα χαρακτήρα', 'text'],
    ['contact', 'Discord username', 'text'],
    ['role', 'Θέση', 'select', roles],
    ['body', 'Γιατί θέλεις να ενταχθείς στο DoJ;', 'textarea']
  ], async (data) => {
    if (![data.name, data.contact, data.body].every((value) => value.trim())) throw new Error('Συμπλήρωσε όλα τα πεδία.');
    if (data.name.trim().length > 100 || data.contact.trim().length > 120 || data.body.trim().length > 3000) {
      throw new Error('Όρια: 100 χαρακτήρες στο όνομα, 120 στο Discord και 3000 στο κείμενο.');
    }
    await api('applications', data);
    shell.querySelector('form').hidden = true;
    status.textContent = 'Η αίτησή σου υποβλήθηκε.';
  });
  shell.append(status);
  return { shell };
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
  const featured = new Set((await api('roster').catch(() => [])).map((item) => item.id));
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
    if (!account.disabled) {
      const visible = featured.has(account.id);
      const toggle = node('button', visible ? 'Αφαίρεση από δημόσιο Roster' : 'Προσθήκη στο δημόσιο Roster', { type: 'button', class: 'secondary' });
      toggle.addEventListener('click', async () => {
        toggle.disabled = true;
        try {
          await api('roster-admin', { id: account.id, visible: !visible });
          await render('Το δημόσιο Roster ενημερώθηκε.');
        } catch (error) {
          message.textContent = error.message;
          toggle.disabled = false;
        }
      });
      item.append(toggle);
    }
    grid.append(item);
  }
  roster.append(grid);
  const intake = section(area, 'Αιτήσεις ένταξης');
  try {
    const applications = await api('applications');
    if (!applications.length) intake.append(node('p', 'Δεν υπάρχουν αιτήσεις.'));
    for (const item of applications) {
      intake.append(card(item.name, roleNames[item.role] + ' · Discord: ' + item.contact, item.body));
    }
  } catch (error) {
    intake.append(node('p', error.message, { role: 'alert' }));
  }
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
    const title = entry.kind === 'charge' ? entry.articleCode + ' · ' + entry.articleTitle :
      entry.kind === 'verdict' ? verdictNames[entry.verdict] : entry.label || kinds[entry.kind];
    const item = card(title, meta, entry.body);
    if (entry.kind === 'note') item.classList.add('private');
    if (entry.kind === 'exhibit' && entry.url?.startsWith('https://')) {
      item.append(node('a', 'Άνοιγμα exhibit', { href: entry.url, target: '_blank', rel: 'noopener noreferrer' }));
    }
    grid.append(item);
  }
  area.append(grid);
}

const accountMenu = accountLink.parentElement;
const sessionDetails = node('details', null, { class: 'account-details', hidden: '' });
const sessionSummary = node('summary', '', { class: 'button' });
const sessionContent = node('div', null, { class: 'account-popover' });
const sessionWorkspace = link('Workspace', '#workspace');
const sessionName = node('strong');
const sessionRole = node('small');
const sessionLogout = node('button', 'Αποσύνδεση', { type: 'button', class: 'secondary' });
const sessionError = node('small', '', { role: 'alert' });
sessionContent.append(sessionName, sessionRole, sessionWorkspace, sessionLogout, sessionError);
sessionDetails.append(sessionSummary, sessionContent);
sessionWorkspace.addEventListener('click', () => { sessionDetails.open = false; });
document.addEventListener('click', (event) => {
  if (sessionDetails.open && !accountMenu.contains(event.target)) sessionDetails.open = false;
});
sessionDetails.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && sessionDetails.open) {
    sessionDetails.open = false;
    sessionSummary.focus();
  }
});
accountMenu.append(sessionDetails);

function showAccount(user) {
  accountLink.hidden = Boolean(user);
  sessionDetails.hidden = !user;
  if (!user) sessionDetails.open = false;
  sessionSummary.textContent = user?.username || '';
  sessionName.textContent = user?.username || '';
  sessionRole.textContent = user ? [roleNames[user.role], user.email].filter(Boolean).join(' · ') : '';
  sessionError.textContent = '';
}

sessionLogout.addEventListener('click', async () => {
  sessionLogout.disabled = true;
  try {
    await api('logout', {});
    showAccount(null);
    if (location.hash === '#login') await render();
    else location.hash = '#login';
  } catch (error) {
    sessionError.textContent = error.message;
  } finally {
    sessionLogout.disabled = false;
  }
});

const verdictNames = { guilty: 'Ένοχος', 'not-guilty': 'Αθώος', dismissed: 'Απορρίφθηκε' };

async function chargePanel(parent, record, user) {
  const area = section(parent, 'Κατηγορίες ανά άρθρο');
  const charges = record.entries.filter((entry) => entry.kind === 'charge');
  const exhibits = record.entries.filter((entry) => ['exhibit', 'evidence'].includes(entry.kind));
  const verdicts = new Map(record.entries.filter((entry) => entry.kind === 'verdict').map((entry) => [entry.chargeId, entry]));
  const open = ['filed', 'scheduled'].includes(record.status);
  const submit = (kind, data) => api('cases/' + record.id, { kind, ...data }).then(() => render());
  if (!charges.length) area.append(node('p', 'Δεν έχουν καταχωριστεί κατηγορίες.'));
  for (const charge of charges) {
    const item = card(charge.articleCode + ' · ' + charge.articleTitle, charge.author + ' · ' + date(charge.created), charge.body);
    const exhibit = exhibits.find(({ id }) => id === charge.exhibitId);
    if (exhibit) {
      const description = 'Σχετικό exhibit: ' + (exhibit.label || exhibit.body);
      item.append(exhibit.url?.startsWith('https://') ? node('a', description, { href: exhibit.url, target: '_blank', rel: 'noopener noreferrer' }) : node('p', description));
    }
    const verdict = verdicts.get(charge.id);
    if (verdict) item.append(node('p', verdictNames[verdict.verdict] + ' · ' + verdict.body));
    if (open && user.role === 'judge') {
      const options = Object.entries(verdictNames).map(([id, username]) => ({ id, username }));
      const editing = node('details', null, { class: 'case-action' });
      editing.append(node('summary', 'Καταχώριση ετυμηγορίας'));
      form(editing, 'Αποθήκευση ετυμηγορίας', [['verdict', 'Αποτέλεσμα', 'select', options], ['body', 'Σκεπτικό', 'textarea']],
        (data) => submit('verdict', { ...data, chargeId: charge.id }));
      item.append(editing);
    }
    area.append(item);
  }
  if (open && user.role === 'prosecutor') {
    try {
      const articles = (await api('penal')).filter((item) => item.id && item.code && item.title);
      if (!articles.length) area.append(node('p', 'Χρειάζεται τουλάχιστον ένα δημοσιευμένο άρθρο στον Ποινικό Κώδικα.'));
      else form(area, 'Προσθήκη κατηγορίας', [
        ['articleId', 'Άρθρο', 'select', articles.map(({ id, code, title }) => ({ id, username: code + ' · ' + title }))],
        ['exhibitId', 'Exhibit (προαιρετικό)', 'select', exhibits.map(({ id, label, body }) => ({ id, username: label || body.slice(0, 90) })), true],
        ['body', 'Σκεπτικό της κατηγορίας', 'textarea']
      ], (data) => submit('charge', data));
    } catch (error) {
      area.append(node('p', error.message, { role: 'alert' }));
    }
  }
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

async function workspace(id, loginRoute, adminRoute, documentRoute, signatureRoute) {
  const shell = node('div', null, { class: 'wrap content' });
  let user;
  try {
    user = await api('me');
  } catch (error) {
    if (![401, 403, 503].includes(error.status)) throw error;
    showAccount(null);
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
  showAccount(user);
  shell.classList.add('workspace-editorial');

  const bar = node('nav', null, { class: 'toolbar workspace-bar', 'aria-label': 'Workspace' });
  bar.append(link('Οι υποθέσεις μου', '#workspace'));
  bar.append(link('Τα έγγραφά μου', '#workspace/documents'));
  bar.append(link('Υπογραφή εγγράφου', '#workspace/signature'));
  if (user.admin === true) bar.append(link('Διαχείριση προσωπικού', '#workspace/admin'));
  for (const item of bar.querySelectorAll('a')) {
    const target = item.getAttribute('href');
    if (target === location.hash || (documentRoute && target === '#workspace/documents') || (id && target === '#workspace')) {
      item.setAttribute('aria-current', 'page');
    }
  }
  shell.append(bar);
  if (documentRoute || signatureRoute) {
    const module = await import(new URL('documents.js?v=workspace-documents-2', firebaseModuleUrl).href);
    if (signatureRoute) module.signaturePanel(shell, node);
    else await module.documentsPanel(shell, user, api, node, documentRoute[1]);
    return { shell };
  }

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
    const charges = node('div');
    const jury = node('div');
    const history = node('div', null, { class: 'case-history' });
    const tabs = [['indictment', 'Κατηγορητήριο', indictment], ['charges', 'Κατηγορίες', charges], ['exhibits', 'Exhibits', exhibits],
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
    await chargePanel(charges, record, user);
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
    const documentRoute = fragment.match(/^workspace\/documents(?:\/([A-Za-z0-9]{20}))?$/);
    const signatureRoute = fragment === 'workspace/signature';
    const inWorkspace = loginRoute || adminRoute || match || documentRoute || signatureRoute;
    if (!inWorkspace) {
      api('me').then((user) => { if (renderId === current) showAccount(user); })
        .catch(() => { if (renderId === current) showAccount(null); });
    }
    const page = inWorkspace ? workspace(match?.[1], loginRoute, adminRoute, documentRoute, signatureRoute) :
      fragment === 'penal-code' ? penalCode() : fragment === 'legal-framework' ? legalFramework() :
        fragment === 'applications' ? applicationsPage() : publicSite(fragment);
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
