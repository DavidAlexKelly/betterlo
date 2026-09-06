#!/usr/bin/env node
// src/data/ValidateTraitors.js
//
// Validates the hand-authored Word Traitors! pack. Plain Node.js, no deps.
//
//   node src/data/ValidateTraitors.js
//
// Exits 1 on errors. Sibling of ValidateCards.js / ValidateTrivia.js.

const fs = require('fs');
const path = require('path');

const WORDS_PATH = path.join(__dirname, 'traitors', 'words.json');

/** Below this a group will see repeats within a single session. */
const MIN_WORDS = 40;

let errors = 0;
let warnings = 0;

function err(index, msg) {
  console.error(`  ✗ #${index}: ${msg}`);
  errors++;
}
function warn(index, msg) {
  console.warn(`  ⚠  #${index}: ${msg}`);
  warnings++;
}

console.log('\nChecking traitors/words.json...');

// nosemgrep -- path.join(__dirname, ...), dev-only CLI, no user input
if (!fs.existsSync(WORDS_PATH)) {
  console.error(`  ✗ file not found: ${WORDS_PATH}`);
  process.exit(1);
}

let data;
try {
  // nosemgrep -- path.join(__dirname, ...), dev-only CLI, no user input
  data = JSON.parse(fs.readFileSync(WORDS_PATH, 'utf8'));
} catch (e) {
  console.error(`  ✗ JSON parse error — ${e.message}`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error('  ✗ root value must be a JSON array');
  process.exit(1);
}

const seenWords = new Map();

data.forEach((entry, i) => {
  if (!entry || typeof entry !== 'object') {
    err(i, 'entry is not an object');
    return;
  }

  const { word, hint } = entry;

  if (typeof word !== 'string' || !word.trim()) {
    err(i, 'missing or empty "word"');
  } else {
    const key = word.trim().toLowerCase();
    if (seenWords.has(key)) {
      err(i, `duplicate word "${word}" — already at #${seenWords.get(key)}`);
    } else {
      seenWords.set(key, i);
    }
    if (word.trim() !== word) warn(i, `"${word}" has surrounding whitespace`);
  }

  if (typeof hint !== 'string' || !hint.trim()) {
    err(i, `"${word}" is missing or has an empty "hint"`);
    return;
  }

  // A hint that contains the answer defeats the entire game.
  const w = String(word).trim().toLowerCase();
  const h = hint.trim().toLowerCase();
  if (h === w) {
    err(i, `hint for "${word}" is the word itself`);
  } else if (w.length > 3 && h.includes(w)) {
    err(i, `hint "${hint}" contains the word "${word}"`);
  }

  // Hints are meant to be a vague nudge, not a description.
  if (hint.trim().split(/\s+/).length > 2) {
    warn(i, `hint "${hint}" for "${word}" is longer than two words`);
  }

  const extraKeys = Object.keys(entry).filter(k => k !== 'word' && k !== 'hint');
  if (extraKeys.length > 0) {
    warn(i, `"${word}" has unexpected key(s): ${extraKeys.join(', ')}`);
  }
});

console.log(`  → ${data.length} word(s)`);

if (data.length < MIN_WORDS) {
  console.warn(
    `  ⚠  only ${data.length} words — target is ${MIN_WORDS}+ so a session doesn't repeat`,
  );
  warnings++;
}

console.log('\n────────────────────────────────────────');
if (errors === 0 && warnings === 0) {
  console.log('✅  Word pack valid. No issues found.\n');
} else {
  if (warnings > 0) console.warn(`⚠   ${warnings} warning(s)`);
  if (errors > 0) console.error(`✗   ${errors} error(s) — fix before shipping`);
}
console.log('────────────────────────────────────────\n');

process.exit(errors > 0 ? 1 : 0);
