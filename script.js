// script.js (type="module")
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, getDocs,
  onSnapshot, updateDoc, increment, query
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

/*
  SOSTITUISCI QUI IL TUO firebaseConfig
*/
const firebaseConfig = {
  apiKey: "AIzaSyAqdGC5ACNqRhlBJeFp2ozq8TyLwJAaIEk",
  authDomain: "friends-rater-92639.firebaseapp.com",
  projectId: "friends-rater-92639",
  storageBucket: "friends-rater-92639.firebasestorage.app",
  messagingSenderId: "111773439164",
  appId: "1:111773439164:web:b87de3223f4115ae4fecb9"
};

if (!firebaseConfig || !firebaseConfig.projectId) {
  console.warn("Inserisci il tuo firebaseConfig prima di usare l'app.");
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ---------- UI references ---------- */
const usernameInput = document.getElementById('usernameInput');
const createGroupBtn = document.getElementById('createGroupBtn');
const joinGroupBtn = document.getElementById('joinGroupBtn');
const groupIdInput = document.getElementById('groupIdInput');
const currentInfo = document.getElementById('currentInfo');
const currentGroupIdEl = document.getElementById('currentGroupId');
const currentUsernameEl = document.getElementById('currentUsername');
const leaveBtn = document.getElementById('leaveBtn');

const membersList = document.getElementById('membersList');
const leaderboard = document.getElementById('leaderboard');

let currentGroupId = null;
let currentUsername = null;
let membersUnsub = null;

/* ---------- Helpers ---------- */
function makeId(len = 6) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i=0; i<len; i++) s += chars.charAt(Math.floor(Math.random()*chars.length));
  return s;
}

function showInfo(groupId, username){
  currentGroupIdEl.textContent = groupId;
  currentUsernameEl.textContent = username;
  currentInfo.classList.remove('hidden');
  document.getElementById('membersPanel').classList.remove('hidden');
}

function hideInfo(){
  currentInfo.classList.add('hidden');
  document.getElementById('membersPanel').classList.add('hidden');
  currentGroupIdEl.textContent = '';
  currentUsernameEl.textContent = '';
}

/* ---------- Save / Load group in localStorage ---------- */
function saveGroupLocally() {
  localStorage.setItem('groupId', currentGroupId);
  localStorage.setItem('username', currentUsername);
}

function clearLocalGroup() {
  localStorage.removeItem('groupId');
  localStorage.removeItem('username');
}

/* ---------- Auto-load group on refresh ---------- */
window.addEventListener("load", () => {
  const savedGroup = localStorage.getItem('groupId');
  const savedUser = localStorage.getItem('username');

  if (savedGroup && savedUser) {
    currentGroupId = savedGroup;
    currentUsername = savedUser;
    joinGroup(currentGroupId, currentUsername); // ricarica membri e listener
  }
});

/* ---------- Group actions ---------- */
createGroupBtn.addEventListener('click', async () => {
  const name = usernameInput.value.trim();
  if (!name) return alert('Inserisci un nome utente.');

  const id = makeId(6);
  const groupRef = doc(db, 'groups', id);
  await setDoc(groupRef, { createdAt: new Date().toISOString() });

  joinGroup(id, name);
});

joinGroupBtn.addEventListener('click', () => {
  const id = groupIdInput.value.trim();
  const name = usernameInput.value.trim();
  if (!id) return alert('Inserisci ID gruppo.');
  if (!name) return alert('Inserisci un nome utente.');
  joinGroup(id, name);
});

leaveBtn.addEventListener('click', async () => {
  if (!currentGroupId || !currentUsername) return;

  const memberRef = doc(db, 'groups', currentGroupId, 'members', currentUsername);
  try { await updateDoc(memberRef, { leftAt: new Date().toISOString() }); } catch(e){}

  if (membersUnsub) membersUnsub();
  currentGroupId = null;
  currentUsername = null;
  clearLocalGroup();
  hideInfo();
  membersList.innerHTML = '';
  leaderboard.innerHTML = '';
});

/* ---------- Join logic ---------- */
async function joinGroup(groupId, username){
  currentGroupId = groupId;
  currentUsername = username;
  saveGroupLocally();
  showInfo(groupId, username);

  const memberRef = doc(db, 'groups', groupId, 'members', username);
  const snap = await getDoc(memberRef);

  if (!snap.exists()) {
    // Se è un nuovo membro, aggiungilo
    await setDoc(memberRef, {
      name: username,
      score: 0,
      joinedAt: new Date().toISOString()
    });
  }

  // Listener realtime dei membri (sempre attivo)
  const membersCol = collection(db, 'groups', groupId, 'members');
  if (membersUnsub) membersUnsub();
  membersUnsub = onSnapshot(membersCol, (snapshot) => {
    const members = [];
    snapshot.forEach(docSnap => {
      members.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderMembers(members);
    renderLeaderboard(members);
  });
}

/* ---------- Render ---------- */
function renderMembers(members){
  membersList.innerHTML = '';
  members.sort((a,b) => a.name.localeCompare(b.name, 'it'));

  members.forEach(m => {
    const el = document.createElement('div');
    el.className = 'member';

    const left = document.createElement('div');
    left.className = 'left';

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = m.name.charAt(0).toUpperCase();

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = `
      <div class="name">${m.name}</div>
      <div class="score">Score: ${m.score ?? 0}</div>
    `;

    left.appendChild(avatar);
    left.appendChild(meta);

    const controls = document.createElement('div');
    controls.className = 'controls';

    if (currentUsername && m.id !== currentUsername) {
      const plus = document.createElement('button');
      plus.className = 'vote-btn';
      plus.textContent = '+1';
      plus.addEventListener('click', () => voteMember(m.id, +1));

      const minus = document.createElement('button');
      minus.className = 'vote-btn';
      minus.textContent = '-1';
      minus.addEventListener('click', () => voteMember(m.id, -1));

      controls.appendChild(plus);
      controls.appendChild(minus);
    } else {
      controls.textContent = "Tu";
    }

    el.appendChild(left);
    el.appendChild(controls);
    membersList.appendChild(el);
  });
}

function renderLeaderboard(members){
  leaderboard.innerHTML = '';
  members.sort((a,b) =>
    (a.score ?? 0) - (b.score ?? 0) ||
    a.name.localeCompare(b.name,'it')
  );
  members.forEach(m => {
    const li = document.createElement('li');
    li.textContent = `${m.name} — ${m.score ?? 0}`;
    leaderboard.appendChild(li);
  });
}

/* ---------- Helper: stesso giorno ---------- */
function isSameDay(d1, d2){
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/* ---------- Voting (max 1 vote per person per day) ---------- */
async function voteMember(targetId, delta){
  if (!currentGroupId || !currentUsername) return;
  if (targetId === currentUsername) return;

  const today = new Date();
  const eventsRef = collection(db, 'groups', currentGroupId, 'events');

  try {
    // prendo tutti gli eventi della giornata
    const qEvents = query(eventsRef);
    const eventsSnap = await getDocs(qEvents);

    let alreadyVotedToday = false;

    eventsSnap.forEach(docSnap => {
      const ev = docSnap.data();
      if (ev.by === currentUsername && ev.to === targetId) {
        const evDate = new Date(ev.at);
        if (isSameDay(evDate, today)) {
          alreadyVotedToday = true;
        }
      }
    });

    if (alreadyVotedToday) {
      return alert(`Hai già votato ${targetId} oggi. Ritenta domani 👀`);
    }

    // se non ho votato oggi → applica voto
    const targetRef = doc(db, 'groups', currentGroupId, 'members', targetId);
    await updateDoc(targetRef, { score: increment(delta) });

    // registra evento
    await setDoc(doc(eventsRef), {
      by: currentUsername,
      to: targetId,
      delta,
      at: today.toISOString()
    });

  } catch(err){
    console.error("Errore durante il voto:", err);
    alert("Errore nel registrare il voto.");
  }
}
