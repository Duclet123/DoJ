import { deleteApp, initializeApp } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js';
import { createUserWithEmailAndPassword, getAuth, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, getFirestore, query, runTransaction, updateDoc, where, writeBatch
} from 'https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js';

const roles = ['lawyer', 'prosecutor', 'judge'];
const statusByKind = { hearing: 'scheduled', decision: 'decided', publish: 'published' };
const denied = (message, status) => Object.assign(new Error(message), { status });

export function connect(config) {
  const app = initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const cases = collection(db, 'cases');
  const profiles = collection(db, 'staff');
  const docket = collection(db, 'docket');

  async function profile(account) {
    if (!account) throw denied('Χρειάζεται σύνδεση.', 401);
    const ref = await getDoc(doc(profiles, account.uid));
    if (!ref.exists() || !roles.includes(ref.data().role) || ref.data().disabled === true) throw denied('Ο λογαριασμός δεν έχει πρόσβαση στο προσωπικό.', 403);
    return { id: account.uid, ...ref.data() };
  }

  async function publicDocket() {
    const [hearings, decisions] = await Promise.all([
      getDocs(query(docket, where('kind', '==', 'hearing'))),
      getDocs(query(docket, where('kind', '==', 'publish')))
    ]);
    return {
      hearings: hearings.docs.map((item) => ({ case_id: item.id, ...item.data() }))
        .filter((item) => item.hearing_at > new Date().toISOString()).sort((a, b) => a.hearing_at.localeCompare(b.hearing_at)),
      decisions: decisions.docs.map((item) => ({ case_id: item.id, ...item.data() }))
        .sort((a, b) => b.created.localeCompare(a.created))
    };
  }

  const summarize = ({ id, title, defendant, status }) => ({ id, title, defendant, status });

  async function createStaff(payload) {
    const username = payload.username.trim();
    const email = payload.email.trim();
    const { password, role } = payload;
    if (!username || username.length > 100 || !roles.includes(role) || password.length < 8) {
      throw new Error('Συμπλήρωσε όνομα έως 100 χαρακτήρες, έγκυρο ρόλο και κωδικό τουλάχιστον 8 χαρακτήρων.');
    }
    const secondary = initializeApp(config, 'doj-provision-' + crypto.randomUUID());
    try {
      const secondaryAuth = initializeAuth(secondary, { persistence: inMemoryPersistence });
      let credential;
      try {
        credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      } catch (error) {
        if (error.code !== 'auth/email-already-in-use') throw error;
        try {
          credential = await signInWithEmailAndPassword(secondaryAuth, email, password);
        } catch {
          throw new Error('Το email υπάρχει ήδη στο Firebase Authentication.');
        }
      }
      await runTransaction(db, async (transaction) => {
        const target = doc(profiles, credential.user.uid);
        const current = await transaction.get(target);
        if (current.exists()) throw new Error('Ο λογαριασμός υπάρχει ήδη στο προσωπικό.');
        transaction.set(target, { username, role, disabled: false });
      });
    } finally {
      await deleteApp(secondary);
    }
    return {};
  }

  return async function request(path, payload) {
    if (path === 'public') return publicDocket();
    if (path === 'penal') return (await getDocs(collection(db, 'penal'))).docs.map((item) => item.data());
    if (path === 'login') {
      let credential;
      try {
        credential = await signInWithEmailAndPassword(auth, payload.username.trim(), payload.password);
      } catch (error) {
        if (error.code === 'auth/network-request-failed') throw new Error('Η υπηρεσία σύνδεσης δεν είναι διαθέσιμη.');
        throw new Error('Ελέγξτε το email και τον κωδικό σας και δοκιμάστε ξανά.');
      }
      try { return await profile(credential.user); }
      catch (error) { await signOut(auth); throw error; }
    }
    await auth.authStateReady();
    if (path === 'logout') { await signOut(auth); return {}; }
    const user = await profile(auth.currentUser);
    if (path === 'me') return user;
    if (path.startsWith('staff')) {
      if (user.admin !== true) throw denied('Απαιτείται πρόσβαση διαχειριστή.', 403);
      if (path === 'staff' && !payload) {
        return (await getDocs(profiles)).docs.map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => a.username.localeCompare(b.username, 'el'));
      }
      if (path === 'staff') return createStaff(payload);
      const id = path.slice('staff/'.length);
      if (!roles.includes(payload.role) || typeof payload.disabled !== 'boolean') throw new Error('Μη έγκυρες ρυθμίσεις προσωπικού.');
      await updateDoc(doc(profiles, id), { role: payload.role, disabled: payload.disabled });
      return {};
    }
    if (path === 'assignable') {
      const staff = await getDocs(query(profiles, where('role', 'in', ['lawyer', 'judge'])));
      return staff.docs.map((item) => ({ id: item.id, ...item.data() })).filter((account) => !account.disabled);
    }
    if (path === 'cases' && !payload) {
      const result = await getDocs(query(cases, where(user.role, '==', user.id)));
      return result.docs.map((item) => summarize({ id: item.id, ...item.data() }))
        .sort((a, b) => a.title.localeCompare(b.title, 'el'));
    }
    if (path === 'cases') {
      const ref = doc(cases);
      const entry = doc(collection(ref, 'entries'));
      const time = new Date().toISOString();
      const batch = writeBatch(db);
      batch.set(ref, {
        title: payload.title.trim(), defendant: payload.defendant.trim(),
        prosecutor: user.id, lawyer: payload.lawyer, judge: payload.judge,
        status: 'filed', lastEntry: entry.id
      });
      batch.set(entry, { kind: 'indictment', author: user.id, body: payload.body.trim(), created: time });
      await batch.commit();
      return { id: ref.id };
    }

    const match = path.match(/^cases\/([A-Za-z0-9]{20})$/);
    if (!match) throw denied('Η υπόθεση δεν βρέθηκε.', 404);
    const ref = doc(cases, match[1]);
    if (!payload) {
      const snap = await getDoc(ref);
      if (!snap.exists()) throw denied('Η υπόθεση δεν βρέθηκε.', 404);
      const data = snap.data();
      const [entries, notes, ...people] = await Promise.all([
        getDocs(collection(ref, 'entries')),
        user.role === 'lawyer' ? getDocs(collection(ref, 'privateNotes', user.id, 'items')) : [],
        ...roles.map((role) => getDoc(doc(profiles, data[role])))
      ]);
      const names = Object.fromEntries(people.map((person) => [person.id, person.data()?.username || person.id]));
      return {
        ...summarize({ id: ref.id, ...data }),
        ...Object.fromEntries(roles.map((role) => [role, names[data[role]]])),
        entries: [...entries.docs, ...(notes.docs || [])].map((item) => {
          const value = item.data();
          return { ...value, author: names[value.author] || user.username };
        }).sort((a, b) => a.created.localeCompare(b.created))
      };
    }

    const kind = payload.kind;
    const body = payload.body.trim();
    const created = new Date().toISOString();
    const data = { kind, author: user.id, body, created };
    if (kind === 'hearing') {
      if (!(new Date(payload.hearingAt) > new Date())) throw new Error('Όρισε μελλοντική ημερομηνία ακρόασης.');
      data.hearing_at = payload.hearingAt;
    }
    const parent = kind === 'note' ? collection(ref, 'privateNotes', user.id, 'items') : collection(ref, 'entries');
    const event = doc(parent);
    const publicRef = doc(docket, ref.id);
    await runTransaction(db, async (transaction) => {
      const record = await transaction.get(ref);
      if (!record.exists()) throw denied('Η υπόθεση δεν βρέθηκε.', 404);
      const status = record.data().status;
      if (kind === 'publish' ? status !== 'decided' : !['filed', 'scheduled'].includes(status)) {
        throw denied('Η κατάσταση της υπόθεσης δεν επιτρέπει αυτή την ενέργεια.', 409);
      }
      transaction.set(event, data);
      if (!Object.hasOwn(statusByKind, kind)) return;
      transaction.update(ref, { status: statusByKind[kind], lastEntry: event.id });
      if (kind === 'hearing') transaction.set(publicRef, { kind, hearing_at: data.hearing_at, created });
      if (kind === 'decision' && status === 'scheduled') transaction.delete(publicRef);
      if (kind === 'publish') transaction.set(publicRef, { kind, body, created });
    });
    return {};
  };
}
