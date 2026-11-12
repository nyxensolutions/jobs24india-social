// Tiny JSON ledger of what the bot has already posted.
// One entry per successful publish — prevents accidental duplicates if a
// workflow gets retried, and gives you an audit trail in git history.

const fs = require("fs");
const path = require("path");

const STATE_PATH = path.resolve(__dirname, "..", "..", "state", "posted.json");

function load() {
  if (!fs.existsSync(STATE_PATH)) return [];
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); }
  catch { return []; }
}

function save(rows) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(rows, null, 2) + "\n", "utf8");
}

function alreadyPosted(slotKey) {
  // slotKey is e.g. "2026-06-04-morning"
  return load().some(r => r.slotKey === slotKey);
}

function record(entry) {
  const rows = load();
  rows.push({ ...entry, at: new Date().toISOString() });
  save(rows);
}

module.exports = { load, save, alreadyPosted, record };
