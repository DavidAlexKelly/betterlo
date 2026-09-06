#!/usr/bin/env node
// tools/fetch-trivia.js
//
// Pulls questions from Open Trivia DB into tools/raw/, balanced ACROSS WEDGES.
//
//   node tools/fetch-trivia.js                # 120 per wedge
//   node tools/fetch-trivia.js --target 200
//   node tools/fetch-trivia.js --wedge geography --target 250
//
// Then convert and validate:
//   node tools/convert-trivia.js && node src/data/ValidateTrivia.js
//
// WHY THIS EXISTS: a plain `?amount=50` pull is a random draw across all of
// OpenTDB, whose corpus is dominated by gaming/anime. The first 100 questions
// fetched that way were 60% Entertainment and 4% Geography. This fetches PER
// CATEGORY against a per-wedge quota instead, so the six wedges come out
// roughly even.
//
// Notes on the API:
//   • 50 questions max per request.
//   • Rate limited to one request per 5s per IP — RATE_LIMIT_MS respects that.
//   • A session token makes the API never repeat a question until exhausted;
//     response_code 4 means "that's everything we have for this query".
//   • Some categories are genuinely small (Art and Mythology are ~50 each), so
//     a high --target will legitimately fall short. That is reported, not hidden.
//
// Requires Node 18+ (global fetch). No dependencies.

const fs = require('fs');
const path = require('path');

const API = 'https://opentdb.com';
const RAW_DIR = path.join(__dirname, 'raw');
const RATE_LIMIT_MS = 5200;
const PAGE = 50;

// OpenTDB category id → wedge. Mirrors WEDGE_OF_CATEGORY in convert-trivia.js;
// that file remains the source of truth at conversion time.
const WEDGE_SOURCES = {
  geography: [{ id: 22, name: 'Geography' }],
  history: [
    { id: 23, name: 'History' },
    { id: 24, name: 'Politics' },
    { id: 20, name: 'Mythology' },
  ],
  arts: [
    { id: 25, name: 'Art' },
    { id: 10, name: 'Books' },
    { id: 16, name: 'Board Games' },
  ],
  science: [
    { id: 17, name: 'Science & Nature' },
    { id: 18, name: 'Computers' },
    { id: 19, name: 'Mathematics' },
    { id: 27, name: 'Animals' },
    { id: 28, name: 'Vehicles' },
  ],
  sport: [
    { id: 21, name: 'Sports' },
    { id: 9, name: 'General Knowledge' },
  ],
  entertainment: [
    { id: 11, name: 'Film' },
    { id: 12, name: 'Music' },
    { id: 14, name: 'Television' },
    { id: 15, name: 'Video Games' },
    { id: 26, name: 'Celebrities' },
    { id: 32, name: 'Cartoons' },
    { id: 31, name: 'Anime & Manga' },
    { id: 29, name: 'Comics' },
  ],
};

const CODES = {
  0: 'ok',
  1: 'no results — category is smaller than requested',
  2: 'invalid parameter',
  3: 'session token not found',
  4: 'exhausted — every question for this query has been returned',
  5: 'rate limited',
};

// ── args ─────────────────────────────────────────────────────
const argv = process.argv.slice(2);
function arg(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
}

if (argv.includes('--help') || argv.includes('-h')) {
  console.log(`
Usage: node tools/fetch-trivia.js [--target N] [--wedge NAME]

  --target N    questions to aim for per wedge (default 120)
  --wedge NAME  fetch only one wedge: ${Object.keys(WEDGE_SOURCES).join(', ')}

Writes tools/raw/opentdb-fetch-<wedge>-<category>.json, then run:
  node tools/convert-trivia.js && node src/data/ValidateTrivia.js
`);
  process.exit(0);
}

const TARGET = parseInt(arg('--target', '120'), 10);
const ONLY = arg('--wedge', null);

if (!Number.isFinite(TARGET) || TARGET < 1) {
  console.error(`--target must be a positive number (got "${arg('--target', '')}")`);
  process.exit(1);
}
if (ONLY && !WEDGE_SOURCES[ONLY]) {
  console.error(`Unknown wedge "${ONLY}". Expected one of: ${Object.keys(WEDGE_SOURCES).join(', ')}`);
  process.exit(1);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getToken() {
  const res = await fetch(`${API}/api_token.php?command=request`);
  const json = await res.json();
  if (json.response_code !== 0) throw new Error('could not obtain a session token');
  return json.token;
}

async function fetchPage(categoryId, amount, token) {
  const url = `${API}/api.php?amount=${amount}&category=${categoryId}&token=${token}`;

  // Defence in depth. Every component of `url` is already fixed: API is a
  // constant, categoryId comes from the hardcoded WEDGE_SOURCES map, amount is
  // a clamped integer and token came from OpenTDB itself. This asserts that
  // invariant rather than trusting it, so the request can never be redirected
  // to another host by a future edit.
  if (!url.startsWith(`${API}/`)) {
    throw new Error(`refusing to fetch a non-OpenTDB URL: ${url}`);
  }

  // nosemgrep justification (node-ssrf): dev-only CLI, no user-controlled URL
  // input, and the origin is asserted above.
  // nosemgrep
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} from OpenTDB`);
  return res.json();
}

async function main() {
  if (typeof fetch !== 'function') {
    console.error('This script needs Node 18+ (global fetch).');
    process.exit(1);
  }

  // nosemgrep -- RAW_DIR is path.join(__dirname, 'raw'); dev-only CLI
  fs.mkdirSync(RAW_DIR, { recursive: true });

  console.log(`\nFetching up to ${TARGET} question(s) per wedge from Open Trivia DB.`);
  console.log('Rate limited to one request per ~5s, so this takes a few minutes.\n');

  let token;
  try {
    token = await getToken();
  } catch (err) {
    console.error(`Could not start a session: ${err.message}`);
    console.error('Check your internet connection and try again.');
    process.exit(1);
  }

  const wedges = ONLY ? [ONLY] : Object.keys(WEDGE_SOURCES);
  const summary = {};

  for (const wedge of wedges) {
    const sources = WEDGE_SOURCES[wedge];
    // Spread the quota evenly, then let earlier categories overflow into the
    // remainder if later ones run dry.
    const perSource = Math.ceil(TARGET / sources.length);
    let got = 0;
    console.log(`── ${wedge} ─────────────────────────────`);

    for (const source of sources) {
      if (got >= TARGET) break;
      let want = Math.min(perSource, TARGET - got);
      let page = 0;

      while (want > 0) {
        const amount = Math.min(PAGE, want);
        let json;
        try {
          json = await fetchPage(source.id, amount, token);
        } catch (err) {
          console.log(`  ! ${source.name}: ${err.message} — skipping`);
          break;
        }

        const code = json.response_code;
        if (code !== 0) {
          console.log(`  · ${source.name}: ${CODES[code] || `code ${code}`}`);
          break;
        }

        const results = json.results || [];
        if (results.length === 0) break;

        const file = path.join(
          RAW_DIR,
          `opentdb-fetch-${wedge}-${source.id}-${page}.json`,
        );
        // Filename is RAW_DIR plus a validated wedge name, a hardcoded
        // category id and an integer page counter. Dev-only CLI.
        // NB: the nosemgrep token must sit on the line directly above the
        // finding — a multi-line justification above it does not suppress.
        // nosemgrep
        fs.writeFileSync(file, JSON.stringify({ response_code: 0, results }, null, 0));

        got += results.length;
        want -= results.length;
        page++;
        console.log(`  + ${source.name}: ${results.length} (wedge total ${got})`);

        if (results.length < amount) break; // category ran dry
        await sleep(RATE_LIMIT_MS);
      }
      await sleep(RATE_LIMIT_MS);
    }

    summary[wedge] = got;
    if (got < TARGET) {
      console.log(`  ⚠  ${wedge}: ${got}/${TARGET} — OpenTDB has no more for these categories`);
    }
    console.log('');
  }

  console.log('────────────────────────────────────────');
  for (const [wedge, n] of Object.entries(summary)) {
    console.log(`  ${wedge.padEnd(15)} ${String(n).padStart(4)}`);
  }
  console.log('────────────────────────────────────────');
  console.log('\nNext:\n  node tools/convert-trivia.js && node src/data/ValidateTrivia.js\n');
}

main().catch(err => {
  console.error(`\nUnexpected failure: ${err.stack || err.message}`);
  process.exit(1);
});
