// Configuration for the World Cup 2026 knockout prediction pool.
// Everything here is public — Firestore access is governed by security rules,
// not by hiding this config. See CLAUDE.md for the rules.

// Firebase web config (from the Firebase console). This is public by design.
// While apiKey is empty the app runs in LOCAL-ONLY mode (localStorage, no shared
// leaderboard) — only useful for local testing.
export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDQMXtkAAk1IEXWXDZifCh2wgVziJp9tWg",
    authDomain: "world-cup-predictions-33009.firebaseapp.com",
    projectId: "world-cup-predictions-33009",
    storageBucket: "world-cup-predictions-33009.firebasestorage.app",
    messagingSenderId: "9685397106",
    appId: "1:9685397106:web:eaa93099ad18bdbb9c5ceb",
    measurementId: "G-7PV4FSETPL"
};

// True when no Firebase project is configured yet.
export const LOCAL_ONLY = !FIREBASE_CONFIG.apiKey;

// Firestore collections.
export const ENTRIES_COLLECTION = "entries";
export const PREDICTIONS_COLLECTION = "predictions";

// Prediction schema version (bump if the picks shape ever changes).
export const SCHEMA_VERSION = 1;

// localStorage keys.
export const LS_MY_PREDICTION = "wc2026.myPrediction";   // this device's own entry
export const LS_LOCAL_STORE = "wc2026.localStore";       // LOCAL-ONLY shared-store stand-in

// Firebase JS SDK version loaded from the CDN.
export const FIREBASE_SDK_VERSION = "10.12.2";
