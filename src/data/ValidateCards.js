#!/usr/bin/env node
// src/data/ValidateCards.js
//
// Validates all card JSON files. Plain Node.js — no TypeScript, no extra deps.
// Run from the project root:
//
//   node src/data/ValidateCards.js
//
// Exits with code 1 if any errors are found.
//
// What changed vs. the original version of this script:
//   • MODE_FILES now matches the files gameData.ts actually imports
//     (drink/dare/truth/chaos/spicy). It used to check social/truth/drink/wild,
//     two of which no longer exist and two of which were never imported.
//   • The valid-token list is DERIVED from word_banks.json rather than
//     hardcoded, so adding a bank can't desync the validator. It also knows
//     about the {take_or_give_*} family, which it previously rejected.
//   • Enforces that every word bank has a non-empty `default` list — without
//     one, an unmapped mode renders a literal "{topic}" onto the card.
//   • Validates the optional `tags` field (used by the "Raising the Bar" deck).
//   • Flags duplicate card text across all files, since the card engine
//     dedupes by id, not by text — two identical texts can both appear in a
//     single game.

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const CARDS_DIR = path.join(__dirname, 'cards');

/** Card files imported by src/data/gameData.ts, keyed by mechanic. */
const MODE_FILES = ['drink', 'dare', 'truth', 'chaos', 'spicy'];

/** Valid `Challenge.mode` values — also the valid word-bank sub-keys. */
const MECHANICS = new Set(MODE_FILES);

const PENALTY_KEYS = ['sip', 'small', 'medium', 'large', 'max'];

/** Tokens the renderer resolves directly (see gameData.ts substituteTokens). */
const CORE_TOKENS = new Set([
  '{player1}', '{player2}',
  ...PENALTY_KEYS.map(k => `{${k}}`),
  ...PENALTY_KEYS.map(k => `{take_or_give_${k}}`),
]);

const VALID_ICONS = new Set([
  'beer', 'wine', 'camera', 'chatbubble', 'chatbubble-ellipses', 'eye', 'eye-off',
  'flash', 'flame', 'happy', 'heart', 'heart-half', 'hand-left', 'hand-right',
  'body', 'mic', 'musical-notes', 'notifications', 'people', 'person', 'podium',
  'shield', 'shirt', 'trophy', 'warning', 'airplane', 'boat', 'call', 'car',
  'cash', 'checkmark-circle', 'color-palette', 'cut', 'film', 'finger-print',
  'game-controller', 'gift', 'globe', 'help-circle', 'link', 'logo-instagram',
  'logo-twitter', 'medkit', 'moon', 'phone-portrait', 'pizza', 'planet', 'radio',
  'ribbon', 'rose', 'search', 'timer', 'volume-mute', 'calculator', 'sparkles',
]);

const VALID_INTENSITY = new Set([1, 2, 3]);

// ─────────────────────────────────────────────
// State
// ─────────────────────────────────────────────

let errors   = 0;
let warnings = 0;

/** normalised card text → first "file #index" that used it */
const seenText = new Map();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function err(file, index, msg) {
  console.error(`  \u2717 [${file}] #${index}: ${msg}`);
  errors++;
}

function warn(file, index, msg) {
  console.warn(`  \u26a0  [${file}] #${index}: ${msg}`);
  warnings++;
}

// nosemgrep justification (non-literal-fs-filename): every path passed in here
// is built from path.join(__dirname, ...) with hardcoded filenames. This is a
// dev-only CLI with no argument parsing and no user input of any kind — it
// cannot be reached from the shipped app.
function loadJson(filePath) {
  // nosemgrep
  if (!fs.existsSync(filePath)) return null;
  try {
    // nosemgrep
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return e;
  }
}

// ─────────────────────────────────────────────
// Word banks — load first, they define valid tokens
// ─────────────────────────────────────────────

const banksPath = path.join(CARDS_DIR, 'word_banks.json');
let banks = {};

console.log('\nChecking word_banks.json...');

// nosemgrep -- dev-only CLI; path is path.join(__dirname, ...), never user input
if (!fs.existsSync(banksPath)) {
  err('word_banks', 'root', `file not found: ${banksPath}`);
} else {
  const data = loadJson(banksPath);
  if (data instanceof Error) {
    err('word_banks', 'root', `JSON parse error — ${data.message}`);
  } else if (!data || typeof data !== 'object' || Array.isArray(data)) {
    err('word_banks', 'root', 'root value must be a JSON object');
  } else {
    banks = data;
    for (const [bankName, bank] of Object.entries(banks)) {
      if (!bank || typeof bank !== 'object' || Array.isArray(bank)) {
        err('word_banks', bankName, 'bank must be an object of mode → string[]');
        continue;
      }

      // A missing/empty `default` means an unmapped mode leaks raw braces
      // onto the card, which is exactly the bug this check exists to prevent.
      const fallback = bank['default'];
      if (!Array.isArray(fallback) || fallback.length === 0) {
        err('word_banks', bankName, 'missing a non-empty "default" list — an unmapped mode would render a literal "{' + bankName + '}"');
      }

      for (const [mode, list] of Object.entries(bank)) {
        if (!Array.isArray(list)) {
          err('word_banks', `${bankName}.${mode}`, 'value must be an array of strings');
          continue;
        }
        if (list.length === 0) {
          warn('word_banks', `${bankName}.${mode}`, 'empty list — will fall through to "default"');
        }
        if (list.some(v => typeof v !== 'string' || !v.trim())) {
          err('word_banks', `${bankName}.${mode}`, 'contains a non-string or empty entry');
        }
        if (mode !== 'default' && !MECHANICS.has(mode)) {
          warn('word_banks', `${bankName}.${mode}`, `"${mode}" is not a known mechanic (${MODE_FILES.join(', ')}) — it will never be selected`);
        }
      }
    }
    console.log(`  \u2192 ${Object.keys(banks).length} bank(s)`);
  }
}

/** Every token the renderer can resolve: core tokens + one per word bank. */
const VALID_TOKENS = new Set([
  ...CORE_TOKENS,
  ...Object.keys(banks).map(b => `{${b}}`),
]);

// ─────────────────────────────────────────────
// Card validation
// ─────────────────────────────────────────────

function validateCard(card, file, index) {
  if (!card || typeof card !== 'object') {
    err(file, index, 'card is not an object');
    return;
  }

  // Required string fields
  if (typeof card.text !== 'string' || !card.text.trim())
    err(file, index, 'missing or empty "text"');

  if (typeof card.action !== 'string' || !card.action.trim())
    err(file, index, 'missing or empty "action"');

  // Icon
  if (typeof card.icon !== 'string')
    err(file, index, 'missing "icon"');
  else if (!VALID_ICONS.has(card.icon))
    warn(file, index, `unknown icon "${card.icon}" — verify the Ionicons name`);

  // Intensity
  if (!VALID_INTENSITY.has(card.intensity))
    err(file, index, `"intensity" must be 1, 2, or 3 (got ${JSON.stringify(card.intensity)})`);

  // Tags (optional) — "bar" is what the Raising the Bar deck filters on
  if (card.tags !== undefined) {
    if (!Array.isArray(card.tags))
      err(file, index, '"tags" must be an array of strings when present');
    else if (card.tags.some(t => typeof t !== 'string' || !t.trim()))
      err(file, index, '"tags" contains a non-string or empty entry');
  }

  const text = typeof card.text === 'string' ? card.text : '';

  // Token check — every {token} must be resolvable by substituteTokens
  const tokenMatches = text.match(/\{[^}]+\}/g) || [];
  for (const token of tokenMatches) {
    if (!VALID_TOKENS.has(token)) {
      err(file, index, `unknown token "${token}" — valid: ${[...VALID_TOKENS].sort().join(', ')}`);
    }
  }

  // Duplicate text across the whole card set
  if (text.trim()) {
    const key = text.trim().replace(/\s+/g, ' ').toLowerCase();
    const first = seenText.get(key);
    if (first) {
      warn(file, index, `duplicate card text — already defined at ${first}`);
    } else {
      seenText.set(key, `${file} #${index}`);
    }
  }

  // Length warnings
  if (text.length > 0 && text.length < 20)
    warn(file, index, `text is very short (${text.length} chars)`);
  if (text.length > 300)
    warn(file, index, `text is very long (${text.length} chars) — may overflow the card UI`);
}

// ─────────────────────────────────────────────
// Validate mechanic files
// ─────────────────────────────────────────────

for (const mode of MODE_FILES) {
  const filePath = path.join(CARDS_DIR, `${mode}.json`);
  console.log(`\nChecking ${mode}.json...`);

  // nosemgrep -- path.join(__dirname, ...), dev-only CLI, no user input
  if (!fs.existsSync(filePath)) {
    err(mode, 'root', `file not found: ${filePath}`);
    continue;
  }

  const data = loadJson(filePath);

  if (data instanceof Error) {
    err(mode, 'root', `JSON parse error — ${data.message}`);
    continue;
  }

  if (!Array.isArray(data)) {
    err(mode, 'root', 'root value must be a JSON array');
    continue;
  }

  if (data.length === 0)
    warn(mode, 'root', 'no cards in this file');

  data.forEach((card, i) => validateCard(card, mode, i));
  console.log(`  \u2192 ${data.length} card(s)`);
}

// ─────────────────────────────────────────────
// Warn about card files nobody imports
// ─────────────────────────────────────────────

const KNOWN_FILES = new Set([
  ...MODE_FILES.map(m => `${m}.json`),
  'rules.json',
  'word_banks.json',
]);

// nosemgrep -- dev-only CLI; CARDS_DIR is path.join(__dirname, 'cards'), never user input
if (fs.existsSync(CARDS_DIR)) {
  // nosemgrep -- dev-only CLI; CARDS_DIR is path.join(__dirname, 'cards'), never user input
  const stray = fs.readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.json') && !KNOWN_FILES.has(f));
  if (stray.length > 0) {
    console.warn('\nChecking for unused card files...');
    for (const f of stray) {
      warn('cards', f, 'not imported by src/data/gameData.ts — dead content');
    }
  }
}

// ─────────────────────────────────────────────
// Validate rules.json
// ─────────────────────────────────────────────

const rulesPath = path.join(CARDS_DIR, 'rules.json');
console.log('\nChecking rules.json...');

// nosemgrep -- path.join(__dirname, ...), dev-only CLI, no user input
if (!fs.existsSync(rulesPath)) {
  err('rules', 'root', `file not found: ${rulesPath}`);
} else {
  const data = loadJson(rulesPath);

  if (data instanceof Error) {
    err('rules', 'root', `JSON parse error — ${data.message}`);
  } else if (!Array.isArray(data)) {
    err('rules', 'root', 'root value must be a JSON array');
  } else {
    const seenIds = new Set();

    data.forEach((pair, i) => {
      if (!pair || typeof pair !== 'object') {
        err('rules', i, 'entry is not an object');
        return;
      }

      // ruleId
      if (typeof pair.ruleId !== 'string' || !pair.ruleId.trim())
        err('rules', i, 'missing or empty "ruleId"');
      else if (seenIds.has(pair.ruleId))
        err('rules', i, `duplicate ruleId "${pair.ruleId}"`);
      else
        seenIds.add(pair.ruleId);

      // start / end cards
      if (!pair.start) err('rules', i, 'missing "start" card');
      else validateCard(pair.start, `rules[${i}].start`, i);

      if (!pair.end) err('rules', i, 'missing "end" card');
      else validateCard(pair.end, `rules[${i}].end`, i);
    });

    console.log(`  \u2192 ${data.length} rule pair(s)`);
  }
}

// ─────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────

console.log('\n────────────────────────────────────────');
if (errors === 0 && warnings === 0) {
  console.log('\u2705  All cards valid. No issues found.\n');
} else {
  if (warnings > 0) console.warn(`\u26a0   ${warnings} warning(s)`);
  if (errors   > 0) console.error(`\u2717   ${errors} error(s) — fix before shipping\n`);
}
console.log('────────────────────────────────────────\n');

process.exit(errors > 0 ? 1 : 0);
