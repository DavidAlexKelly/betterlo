#!/usr/bin/env node
// tools/convert-trivia.js
//
// Turns raw Open Trivia DB dumps into the bundled question files the app ships.
// Run from the project root:
//
//   node tools/convert-trivia.js
//
//   tools/raw/*.json                    →  src/data/trivia/<wedge>.json
//
// Why a build-time converter rather than parsing at runtime:
//
//   • OpenTDB HTML-encodes every string ("&quot;", "&#039;", "Herg&eacute;",
//     "Trackmania&sup2;"). Decoding once here means the app never ships a
//     decoder and a card can never render a raw entity.
//   • OpenTDB's ~24 categories have to collapse onto the 6 wedges. Keeping
//     that mapping here (and keeping `sourceCategory` on every question)
//     means re-balancing later is a re-run, not a re-annotation.
//   • Raw dumps stay committed under tools/raw/, so the whole pipeline is
//     reproducible and a fresh pull can be diffed against what shipped.
//
// This script is deliberately dependency-free — plain Node, like
// ValidateCards.js.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAW_DIR = path.join(__dirname, 'raw');
const OUT_DIR = path.join(__dirname, '..', 'src', 'data', 'trivia');
const BLOCKLIST_PATH = path.join(__dirname, 'blocklist.json');

// ─────────────────────────────────────────────
// Wedge mapping
// ─────────────────────────────────────────────

/**
 * The six Trivial-Pursuit-style wedges. Order matters only for reporting.
 * Keep in sync with src/data/trivia/types.ts.
 */
const WEDGES = ['geography', 'entertainment', 'history', 'arts', 'science', 'sport'];

/**
 * OpenTDB category → wedge.
 *
 * Two entries exist purely to prop up thin wedges and are the ones to revisit
 * first if the balance feels wrong:
 *   • 'Entertainment: Board Games' → arts   (rather than entertainment)
 *   • 'General Knowledge'          → sport  (Sport & LEISURE)
 */
const CATEGORY_TO_WEDGE = {
  'Geography': 'geography',

  'Entertainment: Television': 'entertainment',
  'Entertainment: Film': 'entertainment',
  'Entertainment: Music': 'entertainment',
  'Entertainment: Musicals & Theatres': 'entertainment',
  'Entertainment: Video Games': 'entertainment',
  'Entertainment: Japanese Anime & Manga': 'entertainment',
  'Entertainment: Cartoon & Animations': 'entertainment',
  'Entertainment: Comics': 'entertainment',
  'Celebrities': 'entertainment',

  'History': 'history',
  'Politics': 'history',
  'Mythology': 'history',

  'Art': 'arts',
  'Entertainment: Books': 'arts',
  'Entertainment: Board Games': 'arts',

  'Science & Nature': 'science',
  'Science: Computers': 'science',
  'Science: Mathematics': 'science',
  'Science: Gadgets': 'science',
  'Animals': 'science',
  'Vehicles': 'science',

  'Sports': 'sport',
  'General Knowledge': 'sport',
};

const DIFFICULTY = { easy: 1, medium: 2, hard: 3 };

// ─────────────────────────────────────────────
// HTML entity decoding
// ─────────────────────────────────────────────

const NAMED_ENTITIES = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  ldquo: '\u201C', rdquo: '\u201D', lsquo: '\u2018', rsquo: '\u2019',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', bull: '\u2022',
  deg: '\u00B0', sup1: '\u00B9', sup2: '\u00B2', sup3: '\u00B3',
  frac12: '\u00BD', frac14: '\u00BC', frac34: '\u00BE',
  times: '\u00D7', divide: '\u00F7', plusmn: '\u00B1',
  copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
  pound: '\u00A3', euro: '\u20AC', cent: '\u00A2', yen: '\u00A5',
  eacute: '\u00E9', egrave: '\u00E8', ecirc: '\u00EA', euml: '\u00EB',
  aacute: '\u00E1', agrave: '\u00E0', acirc: '\u00E2', auml: '\u00E4',
  aring: '\u00E5', aelig: '\u00E6', atilde: '\u00E3',
  iacute: '\u00ED', igrave: '\u00EC', icirc: '\u00EE', iuml: '\u00EF',
  oacute: '\u00F3', ograve: '\u00F2', ocirc: '\u00F4', ouml: '\u00F6',
  otilde: '\u00F5', oslash: '\u00F8',
  uacute: '\u00FA', ugrave: '\u00F9', ucirc: '\u00FB', uuml: '\u00FC',
  ntilde: '\u00F1', ccedil: '\u00E7', szlig: '\u00DF', yuml: '\u00FF',
  Eacute: '\u00C9', Egrave: '\u00C8', Ecirc: '\u00CA',
  Aacute: '\u00C1', Agrave: '\u00C0', Acirc: '\u00C2', Auml: '\u00C4',
  Aring: '\u00C5', AElig: '\u00C6',
  Iacute: '\u00CD', Oacute: '\u00D3', Ouml: '\u00D6', Oslash: '\u00D8',
  Uacute: '\u00DA', Uuml: '\u00DC', Ntilde: '\u00D1', Ccedil: '\u00C7',
};

/**
 * Decode HTML entities, then assert none survived.
 *
 * Failing loudly is the point: a silent pass-through is how "&sup2;" ends up
 * printed on a card in front of a room full of people. If this throws, add the
 * entity to NAMED_ENTITIES rather than stripping it.
 */
function decodeEntities(raw, where) {
  let out = String(raw)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));

  // &amp; last would double-decode "&amp;quot;"; named pass first, then a
  // final &amp; sweep is unnecessary because the map includes it and the
  // regex is single-pass over the original string.
  out = out.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name)) {
      return NAMED_ENTITIES[name];
    }
    throw new Error(
      `Unknown HTML entity "${match}" in ${where}.\n` +
      `  Add it to NAMED_ENTITIES in tools/convert-trivia.js — do not strip it.`
    );
  });

  const leftover = out.match(/&[a-zA-Z#][a-zA-Z0-9]*;/);
  if (leftover) {
    throw new Error(`Entity "${leftover[0]}" survived decoding in ${where}.`);
  }
  return out;
}

/** Collapse runs of whitespace and trim — OpenTDB has stray double spaces. */
const tidy = (s) => s.replace(/\s+/g, ' ').trim();

const clean = (raw, where) => tidy(decodeEntities(raw, where));

/** Stable id from the question text, so ids survive re-runs and re-ordering. */
function makeId(wedge, questionText) {
  const hash = crypto
    .createHash('sha1')
    .update(questionText.toLowerCase())
    .digest('hex')
    .slice(0, 8);
  return `${wedge}-${hash}`;
}

// ─────────────────────────────────────────────
// Load raw dumps
// ─────────────────────────────────────────────

if (!fs.existsSync(RAW_DIR)) {                                  // nosemgrep -- build script, hardcoded path
  console.error(`No raw directory at ${RAW_DIR}`);
  process.exit(1);
}

const rawFiles = fs.readdirSync(RAW_DIR).filter(f => f.endsWith('.json')).sort();   // nosemgrep -- build script, hardcoded path
if (rawFiles.length === 0) {
  console.error(`No .json dumps found in ${RAW_DIR}`);
  process.exit(1);
}

const blocklist = new Set(
  fs.existsSync(BLOCKLIST_PATH)                                 // nosemgrep -- build script, hardcoded path
    ? JSON.parse(fs.readFileSync(BLOCKLIST_PATH, 'utf8')).blocked || []   // nosemgrep -- build script, hardcoded path
    : []
);

console.log(`\nReading ${rawFiles.length} raw dump(s) from tools/raw/`);

let rawCount = 0;
const incoming = [];

for (const file of rawFiles) {
  const full = path.join(RAW_DIR, file);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(full, 'utf8'));          // nosemgrep -- build script, hardcoded path
  } catch (e) {
    console.error(`  ✗ ${file}: JSON parse error — ${e.message}`);
    process.exit(1);
  }
  const results = Array.isArray(parsed) ? parsed : parsed.results;
  if (!Array.isArray(results)) {
    console.error(`  ✗ ${file}: expected an array or an object with a "results" array`);
    process.exit(1);
  }
  rawCount += results.length;
  results.forEach((r, i) => incoming.push({ raw: r, where: `${file} #${i}` }));
  console.log(`  • ${file} — ${results.length} question(s)`);
}

// ─────────────────────────────────────────────
// Convert
// ─────────────────────────────────────────────

const byWedge = Object.fromEntries(WEDGES.map(w => [w, []]));
const seen = new Map();          // normalised question text → id
const unmapped = new Map();      // unknown source category → count
const skipped = { duplicate: 0, blocked: 0, unmapped: 0, malformed: 0 };

for (const { raw, where } of incoming) {
  const sourceCategory = clean(raw.category ?? '', `${where} (category)`);
  const wedge = CATEGORY_TO_WEDGE[sourceCategory];

  if (!wedge) {
    unmapped.set(sourceCategory, (unmapped.get(sourceCategory) || 0) + 1);
    skipped.unmapped++;
    continue;
  }

  const type = raw.type === 'boolean' ? 'boolean' : 'multiple';
  const difficulty = DIFFICULTY[raw.difficulty];
  if (!difficulty) {
    console.error(`  ✗ ${where}: unknown difficulty "${raw.difficulty}"`);
    skipped.malformed++;
    continue;
  }

  const question = clean(raw.question, `${where} (question)`);
  const answer = clean(raw.correct_answer, `${where} (correct_answer)`);
  const distractors = (raw.incorrect_answers || [])
    .map((d, i) => clean(d, `${where} (incorrect_answers[${i}])`));

  const expected = type === 'boolean' ? 1 : 3;
  if (distractors.length !== expected) {
    console.error(
      `  ✗ ${where}: ${type} question has ${distractors.length} distractor(s), expected ${expected}`
    );
    skipped.malformed++;
    continue;
  }

  const key = question.toLowerCase();
  if (seen.has(key)) {
    skipped.duplicate++;
    continue;
  }

  const id = makeId(wedge, question);
  if (blocklist.has(id)) {
    skipped.blocked++;
    continue;
  }

  seen.set(key, id);
  byWedge[wedge].push({
    id,
    wedge,
    sourceCategory,
    type,
    difficulty,
    question,
    answer,
    distractors,
  });
}

// ─────────────────────────────────────────────
// Write
// ─────────────────────────────────────────────

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });  // nosemgrep -- build script, hardcoded path

let written = 0;
for (const wedge of WEDGES) {
  // Sort by difficulty then id so diffs between runs stay readable.
  const list = byWedge[wedge].sort(
    (a, b) => a.difficulty - b.difficulty || a.id.localeCompare(b.id)
  );
  fs.writeFileSync(                                              // nosemgrep -- build script, hardcoded path
    path.join(OUT_DIR, `${wedge}.json`),
    JSON.stringify(list, null, 2) + '\n',
    'utf8'
  );
  written += list.length;
}

// ─────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────

console.log(`\nWedge distribution:`);
const max = Math.max(1, ...WEDGES.map(w => byWedge[w].length));
for (const wedge of WEDGES) {
  const n = byWedge[wedge].length;
  const bar = '█'.repeat(Math.round((n / max) * 32));
  console.log(`  ${wedge.padEnd(14)} ${String(n).padStart(4)}  ${bar}`);
}

if (unmapped.size > 0) {
  console.warn(`\n⚠  Unmapped source categories (questions dropped):`);
  for (const [cat, n] of [...unmapped].sort((a, b) => b[1] - a[1])) {
    console.warn(`     ${String(n).padStart(4)}  ${cat}`);
  }
  console.warn(`   Add these to CATEGORY_TO_WEDGE in tools/convert-trivia.js.`);
}

console.log(
  `\nIn: ${rawCount}   Out: ${written}   ` +
  `Skipped: ${skipped.duplicate} dup, ${skipped.blocked} blocked, ` +
  `${skipped.unmapped} unmapped, ${skipped.malformed} malformed`
);
console.log(`Wrote ${WEDGES.length} file(s) to src/data/trivia/\n`);

if (skipped.malformed > 0) process.exit(1);
