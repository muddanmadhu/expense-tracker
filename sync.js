// Cross-device sync via Firebase (Google Sign-In + Firestore).
//
// This module is optional: if firebase-config.js still has placeholder
// values, PocketTrack keeps working exactly as before, storing data only
// in this browser's localStorage. Once a real Firebase project config is
// supplied, signing in with Google will:
//   1. Pull any previously synced data for that account into localStorage
//      (merging with what's already on this device, keeping the newest
//      version of anything that overlaps).
//   2. Push local changes to Firestore any time an expense, custom type,
//      or budget setting is added/edited/removed.
//   3. Keep every signed-in device up to date via a live Firestore listener.
import {
  initializeApp,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const STORAGE_KEY = "pockettrack-expenses";
const CUSTOM_TYPES_KEY = "pockettrack-custom-types";
const BUDGET_KEY = "pockettrack-daily-budget";
const SYNC_META_KEY = "pockettrack-sync-meta";

// Only these Google accounts are allowed to sign in and sync data.
// Add/remove emails here to control who can use cloud sync.
const ALLOWED_EMAILS = [
  "muddanmadhu@gmail.com",
  "krupamuddanmadhu@gmail.com",
  "botuserm@gmail.com",
];

const isConfigured =
  window.FIREBASE_CONFIG &&
  window.FIREBASE_CONFIG.apiKey &&
  !window.FIREBASE_CONFIG.apiKey.startsWith("YOUR_");

const syncBadge = document.querySelector("#sync-status");
const signInButton = document.querySelector("#sync-signin");
const signOutButton = document.querySelector("#sync-signout");
const syncUserLabel = document.querySelector("#sync-user");

let app;
let auth;
let db;
let currentUser = null;
let remoteUnsubscribe = null;
let applyingRemoteUpdate = false;

function isAllowed(user) {
  const email = (user?.email || "").toLowerCase();
  return ALLOWED_EMAILS.some((allowed) => allowed.toLowerCase() === email);
}

function setBadge(text, className) {
  if (!syncBadge) return;
  syncBadge.textContent = text;
  syncBadge.className = `sync-badge ${className}`;
}

function readLocalSnapshot() {
  return {
    expenses: JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"),
    customTypes: JSON.parse(localStorage.getItem(CUSTOM_TYPES_KEY) || "[]"),
    dailyBudget: JSON.parse(localStorage.getItem(BUDGET_KEY) || "null"),
    updatedAt: Date.now(),
  };
}

function writeLocalSnapshot(snapshot) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.expenses || []));
  localStorage.setItem(
    CUSTOM_TYPES_KEY,
    JSON.stringify(snapshot.customTypes || []),
  );
  if (snapshot.dailyBudget) {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(snapshot.dailyBudget));
  } else {
    localStorage.removeItem(BUDGET_KEY);
  }
}

// Merge two expense arrays by id, preferring the entry with the newer
// createdAt/updatedAt timestamp when the same id exists on both sides.
function mergeExpenses(localList, remoteList) {
  const byId = new Map();
  for (const expense of remoteList || []) byId.set(expense.id, expense);
  for (const expense of localList || []) {
    const existing = byId.get(expense.id);
    if (!existing || (expense.createdAt || 0) >= (existing.createdAt || 0)) {
      byId.set(expense.id, expense);
    }
  }
  return [...byId.values()];
}

function mergeSnapshots(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const expenses = mergeExpenses(local.expenses, remote.expenses);
  const customTypes = [
    ...new Set([...(local.customTypes || []), ...(remote.customTypes || [])]),
  ];
  const dailyBudget =
    (local.updatedAt || 0) >= (remote.updatedAt || 0)
      ? local.dailyBudget
      : remote.dailyBudget;
  return {
    expenses,
    customTypes,
    dailyBudget,
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
  };
}

function userDocRef(user) {
  return doc(db, "pockettrack-users", user.uid);
}

async function pushLocalData() {
  if (!isConfigured || !currentUser || !isAllowed(currentUser) || applyingRemoteUpdate) return;
  const snapshot = readLocalSnapshot();
  localStorage.setItem(SYNC_META_KEY, String(snapshot.updatedAt));
  try {
    await setDoc(userDocRef(currentUser), snapshot);
    setBadge(`Synced as ${currentUser.displayName || currentUser.email}`, "is-synced");
  } catch (error) {
    console.error("PocketTrack sync: failed to push data", error);
    setBadge("Sync error - changes saved on this device only", "is-error");
  }
}

function listenForRemoteChanges(user) {
  remoteUnsubscribe?.();
  remoteUnsubscribe = onSnapshot(
    userDocRef(user),
    (snap) => {
      if (!snap.exists()) {
        // First sign-in on this account: seed the cloud with local data.
        pushLocalData();
        return;
      }
      const remote = snap.data();
      const localUpdatedAt = Number(localStorage.getItem(SYNC_META_KEY) || 0);
      // Skip re-applying the write we just made ourselves, but still confirm
      // the sync succeeded so the badge doesn't stay stuck on "Syncing…".
      if (remote.updatedAt && remote.updatedAt <= localUpdatedAt) {
        setBadge(`Synced as ${user.displayName || user.email}`, "is-synced");
        return;
      }

      const local = readLocalSnapshot();
      const merged = mergeSnapshots(local, remote);
      applyingRemoteUpdate = true;
      writeLocalSnapshot(merged);
      localStorage.setItem(SYNC_META_KEY, String(merged.updatedAt));
      window.PocketApp?.reloadFromStorage();
      applyingRemoteUpdate = false;

      // If the merge produced anything new relative to what's stored
      // remotely, push the merged result back up.
      if (
        merged.expenses.length !== (remote.expenses || []).length ||
        merged.customTypes.length !== (remote.customTypes || []).length
      ) {
        pushLocalData();
      } else {
        setBadge(`Synced as ${user.displayName || user.email}`, "is-synced");
      }
    },
    (error) => {
      console.error("PocketTrack sync: listener error", error);
      setBadge(`Sync error: ${error.code || error.message}`, "is-error");
    },
  );
}

async function handleSignIn() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    console.error("PocketTrack sync: sign-in failed", error);
    setBadge(`Sign-in failed: ${error.code || error.message}`, "is-error");
  }
}

async function handleSignOut() {
  remoteUnsubscribe?.();
  remoteUnsubscribe = null;
  await signOut(auth);
}

function initUI() {
  if (!isConfigured) {
    setBadge("Local only (cloud sync not set up)", "is-local");
    if (signInButton) signInButton.hidden = true;
    return;
  }

  app = initializeApp(window.FIREBASE_CONFIG);
  auth = getAuth(app);
  db = getFirestore(app);

  signInButton?.addEventListener("click", handleSignIn);
  signOutButton?.addEventListener("click", handleSignOut);

  onAuthStateChanged(auth, (user) => {
    if (user && !isAllowed(user)) {
      // This Google account isn't on the allow-list: sign them back out
      // immediately and show an explanatory message instead of syncing.
      currentUser = null;
      signOut(auth);
      signInButton.hidden = false;
      signOutButton.hidden = true;
      syncUserLabel.hidden = true;
      setBadge("This Google account isn't authorized to sync", "is-error");
      return;
    }

    currentUser = user;
    if (user) {
      signInButton.hidden = true;
      signOutButton.hidden = false;
      syncUserLabel.hidden = false;
      syncUserLabel.textContent = user.displayName || user.email;
      setBadge("Syncing…", "is-syncing");
      listenForRemoteChanges(user);
    } else {
      signInButton.hidden = false;
      signOutButton.hidden = true;
      syncUserLabel.hidden = true;
      setBadge("Local only - sign in to sync across devices", "is-local");
    }
  });
}

initUI();

window.PocketSync = { pushLocalData };
