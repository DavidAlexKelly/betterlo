// tools/trivia-smoke.ts
// ─────────────────────────────────────────────────────────────────────────────
// Behavioural checks for the React-Native-free parts of the Trivia mode
// (src/data/triviaData.ts). ValidateTrivia.js checks the DATA; this checks the
// LOGIC that reads it — option shuffling, grading, difficulty fallback and the
// penalty scale.
//
// Run from the project root (needs the app's own devDependency typescript,
// so `npm install` in this folder first):
//
//   npx tsc --outDir .trivia-build --rootDir . --module commonjs \
//           --target ES2020 --moduleResolution node --resolveJsonModule \
//           --strict --skipLibCheck --esModuleInterop tools/trivia-smoke.ts
//   node .trivia-build/tools/trivia-smoke.js
//
// Exits non-zero on failure. Not wired into CI — the app has no test runner
// yet; adding vitest here is a worthwhile follow-up.
// ─────────────────────────────────────────────────────────────────────────────

import {
  ALL_QUESTIONS, QUESTION_COUNTS, STREAK_THRESHOLD, TIMEOUT_SENTINEL, WEDGE_POOLS,
  buildOptions, failedStealSips, formatSips, getWedgePool, isCorrect,
  smallestPoolSize, streakRewardSips, wedgeRewardSips, wrongAnswerSips,
} from '../src/data/triviaData';
import { WEDGE_IDS } from '../src/data/trivia/types';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.error(`  FAIL ${name} ${detail}`); failures++; }
}

console.log('\n1. Pools');
check('total question count is 100', ALL_QUESTIONS.length === 100, `got ${ALL_QUESTIONS.length}`);
check('counts match validator output',
  JSON.stringify(QUESTION_COUNTS) === JSON.stringify({
    geography: 4, entertainment: 51, history: 13, arts: 10, science: 11, sport: 11,
  }), JSON.stringify(QUESTION_COUNTS));
check('every wedge id has a pool', WEDGE_IDS.every(w => Array.isArray(WEDGE_POOLS[w])));
check('smallestPoolSize picks the thinnest wedge',
  smallestPoolSize(['entertainment', 'geography']) === 4);
check('smallestPoolSize of nothing is 0', smallestPoolSize([]) === 0);

console.log('\n2. Option building');
const boolQ = ALL_QUESTIONS.find(q => q.type === 'boolean')!;
const multiQ = ALL_QUESTIONS.find(q => q.type === 'multiple')!;
check('boolean renders exactly True/False',
  JSON.stringify(buildOptions(boolQ)) === JSON.stringify(['True', 'False']));
check('multiple renders 4 options', buildOptions(multiQ).length === 4);
check('multiple always contains the answer',
  Array.from({ length: 50 }, () => buildOptions(multiQ)).every(o => o.includes(multiQ.answer)));
check('multiple options are unique',
  Array.from({ length: 50 }, () => buildOptions(multiQ)).every(o => new Set(o).size === 4));
const positions = new Set(Array.from({ length: 200 },
  () => buildOptions(multiQ).indexOf(multiQ.answer)));
check('answer is not always in the same slot', positions.size > 1, `slots seen: ${[...positions]}`);

console.log('\n3. Grading');
check('exact match is correct', isCorrect(multiQ, multiQ.answer));
check('case/whitespace insensitive', isCorrect(multiQ, `  ${multiQ.answer.toUpperCase()}  `));
check('a distractor is wrong', !isCorrect(multiQ, multiQ.distractors[0]));
check('timeout sentinel grades as wrong', !isCorrect(multiQ, TIMEOUT_SENTINEL));
check('timeout sentinel matches no real answer anywhere',
  ALL_QUESTIONS.every(q => !isCorrect(q, TIMEOUT_SENTINEL)));
check('boolean False answers grade correctly', isCorrect(boolQ, boolQ.answer));

console.log('\n4. Difficulty filtering + the no-strand guarantee');
check('filter narrows the pool',
  getWedgePool('entertainment', [1]).every(q => q.difficulty === 1));
const impossible = getWedgePool('geography', [3]);
const geoHard = WEDGE_POOLS.geography.filter(q => q.difficulty === 3).length;
check('empty filter result falls back to the full wedge rather than stranding',
  geoHard === 0 ? impossible.length === WEDGE_POOLS.geography.length : true,
  `geography hard=${geoHard}, returned=${impossible.length}`);
check('no filter returns everything',
  getWedgePool('sport').length === QUESTION_COUNTS.sport);

console.log('\n5. Penalties honour the Sip Intensity bonus');
check('easy miss = 1 sip', wrongAnswerSips(1) === 1);
check('medium miss = 2 sips', wrongAnswerSips(2) === 2);
check('hard miss = 3 sips', wrongAnswerSips(3) === 3);
check('bonus +2 scales a hard miss to 5', wrongAnswerSips(3, { bonus: 2 }) === 5);
check('wedge reward = 3 sips', wedgeRewardSips() === 3);
check('wedge reward scales with bonus', wedgeRewardSips({ bonus: 3 }) === 6);
check('failed steal is cheaper than a hard miss', failedStealSips() < wrongAnswerSips(3));
check('streak bonus is 1 sip', streakRewardSips() === 1);
check('streak bonus scales with intensity', streakRewardSips({ bonus: 2 }) === 3);
check('streak threshold is a sane small number',
  STREAK_THRESHOLD >= 2 && STREAK_THRESHOLD <= 5, `got ${STREAK_THRESHOLD}`);
check('formatSips singular', formatSips(1) === '1 sip');
check('formatSips plural', formatSips(4) === '4 sips');
check('formatSips renders the finish-your-drink sentinel',
  formatSips(99) === 'finish your drink');

console.log('\n6. Data sanity');
check('no answer appears among its own distractors',
  ALL_QUESTIONS.every(q => !q.distractors
    .map(d => d.toLowerCase()).includes(q.answer.toLowerCase())));
check('every question has a wedge matching its file',
  WEDGE_IDS.every(w => WEDGE_POOLS[w].every(q => q.wedge === w)));
check('boolean questions have exactly 1 distractor',
  ALL_QUESTIONS.filter(q => q.type === 'boolean').every(q => q.distractors.length === 1));
check('multiple questions have exactly 3 distractors',
  ALL_QUESTIONS.filter(q => q.type === 'multiple').every(q => q.distractors.length === 3));

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
