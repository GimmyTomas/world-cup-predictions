// Storage facade. Talks to Firebase Firestore when a project is configured,
// otherwise falls back to a localStorage-backed stand-in for local testing.
//
// Two collections keep picks hidden until the lock (enforced by Firestore
// rules, see CLAUDE.md):
//   entries/{nameKey}      -> { name, nameKey, submittedAtMs }   public, write-before-lock
//   predictions/{nameKey}  -> full prediction                    read-after-lock, write-before-lock

import {
    FIREBASE_CONFIG, LOCAL_ONLY, FIREBASE_SDK_VERSION,
    ENTRIES_COLLECTION, PREDICTIONS_COLLECTION,
    LS_MY_PREDICTION, LS_LOCAL_STORE
} from './config.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

let db_ = null;
let fs_ = null; // firestore module namespace

async function ensureDb() {
    if (db_) return;
    const appMod = await import(`${CDN}/firebase-app.js`);
    fs_ = await import(`${CDN}/firebase-firestore.js`);
    const app = appMod.initializeApp(FIREBASE_CONFIG);
    db_ = fs_.getFirestore(app);
}

// --- local-only stand-in ---------------------------------------------------

function localStoreRead() {
    try {
        return JSON.parse(localStorage.getItem(LS_LOCAL_STORE)) || {};
    } catch (e) {
        return {};
    }
}

function localStoreWrite(obj) {
    localStorage.setItem(LS_LOCAL_STORE, JSON.stringify(obj));
}

// --- public API ------------------------------------------------------------

// Persist a prediction. Returns the stored doc.
export async function savePrediction(prediction) {
    cacheMyPrediction(prediction);

    if (LOCAL_ONLY) {
        const store = localStoreRead();
        store[prediction.nameKey] = prediction;
        localStoreWrite(store);
        return prediction;
    }

    await ensureDb();
    const entry = {
        name: prediction.name,
        nameKey: prediction.nameKey,
        submittedAtMs: prediction.submittedAtMs
    };
    await fs_.setDoc(fs_.doc(db_, ENTRIES_COLLECTION, prediction.nameKey), entry);
    await fs_.setDoc(fs_.doc(db_, PREDICTIONS_COLLECTION, prediction.nameKey), prediction);
    return prediction;
}

// Lightweight list of who has submitted (safe to read before the lock).
export async function loadEntries() {
    if (LOCAL_ONLY) {
        return Object.values(localStoreRead()).map((p) => ({
            name: p.name, nameKey: p.nameKey, submittedAtMs: p.submittedAtMs
        }));
    }
    await ensureDb();
    const snap = await fs_.getDocs(fs_.collection(db_, ENTRIES_COLLECTION));
    return snap.docs.map((d) => d.data());
}

// Full predictions (only readable after the lock when using Firebase).
export async function loadAllPredictions() {
    if (LOCAL_ONLY) {
        return Object.values(localStoreRead());
    }
    await ensureDb();
    const snap = await fs_.getDocs(fs_.collection(db_, PREDICTIONS_COLLECTION));
    return snap.docs.map((d) => d.data());
}

// Live updates for the full predictions collection. Returns an unsubscribe fn.
export async function subscribePredictions(callback) {
    if (LOCAL_ONLY) {
        callback(await loadAllPredictions());
        return () => {};
    }
    await ensureDb();
    return fs_.onSnapshot(fs_.collection(db_, PREDICTIONS_COLLECTION), (snap) => {
        callback(snap.docs.map((d) => d.data()));
    });
}

// Live updates for the entries (submitted names). Returns an unsubscribe fn.
export async function subscribeEntries(callback) {
    if (LOCAL_ONLY) {
        callback(await loadEntries());
        return () => {};
    }
    await ensureDb();
    return fs_.onSnapshot(fs_.collection(db_, ENTRIES_COLLECTION), (snap) => {
        callback(snap.docs.map((d) => d.data()));
    });
}

// --- this-device cache (so you can reopen/edit your own bracket) -----------

export function cacheMyPrediction(prediction) {
    try {
        localStorage.setItem(LS_MY_PREDICTION, JSON.stringify(prediction));
    } catch (e) { /* ignore quota/availability errors */ }
}

export function loadMyPrediction() {
    try {
        return JSON.parse(localStorage.getItem(LS_MY_PREDICTION));
    } catch (e) {
        return null;
    }
}
