// tools/traitors-smoke.ts
// Behavioural checks for Word Traitors!. src/data/traitorsGame.ts is React-free,
// so these play complete rounds and verify the reveal pass, role assignment,
// accusation scoring and round progression.
//
//   npx tsc --outDir .tr-build --rootDir . --module commonjs --target ES2020 \
//           --moduleResolution node --resolveJsonModule --strict --skipLibCheck \
//           --esModuleInterop tools/traitors-smoke.ts
//   node .tr-build/tools/traitors-smoke.js

import { WORDS, pickTraitorIndices, suggestedTraitors, wordId } from '../src/data/traitorsData';
import {
  TraitorsConfig, TraitorsState,
  accusationComplete, advanceReveal, createGame, endGame, firstSpeaker, goToAccuse,
  isOver, isTraitor, nextRound, revealTarget, startClues, submitAccusation,
  toggleAccused,
} from '../src/data/traitorsGame';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.error(`  FAIL ${name} ${detail}`); failures++; }
}

const players = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));

const cfg = (over: Partial<TraitorsConfig> = {}): TraitorsConfig => ({
  players: players(5),
  traitorCount: 1,
  hintsEnabled: true,
  totalRounds: 3,
  ...over,
});

/** Tap through the whole reveal pass. */
function completeReveal(s: TraitorsState, c: TraitorsConfig): TraitorsState {
  let guard = 0;
  while (s.phase !== 'starter' && guard++ < 200) s = advanceReveal(s, c);
  return s;
}

console.log('\n1. Word pack');
check('pack is loaded', WORDS.length === 30, `got ${WORDS.length}`);
check('ids are derived and unique',
  new Set(WORDS.map(w => w.id)).size === WORDS.length);
check('id derivation is lowercase-slug', wordId('Ice Cream') === 'ice-cream');
check('no hint equals its word',
  WORDS.every(w => w.hint.toLowerCase() !== w.word.toLowerCase()));
check('no hint contains its word',
  WORDS.every(w => !w.hint.toLowerCase().includes(w.word.toLowerCase())));

console.log('\n2. Role assignment');
{
  check('one traitor by default in a small group', suggestedTraitors(4) === 1);
  check('two at six players', suggestedTraitors(6) === 2);
  check('three at nine', suggestedTraitors(9) === 3);

  for (const n of [3, 4, 5, 6, 8, 10]) {
    const picked = pickTraitorIndices(n, 3);
    check(`${n} players: at least two innocents remain`, n - picked.length >= 2,
      `traitors=${picked.length}`);
    check(`${n} players: traitor indices are unique and in range`,
      new Set(picked).size === picked.length && picked.every(i => i >= 0 && i < n));
  }
  check('never zero traitors even if asked for none',
    pickTraitorIndices(5, 0).length === 1);
}

console.log('\n3. The reveal pass');
{
  const c = cfg({ players: players(4) });
  let s = createGame(c);
  check('starts on the hand-off screen', s.phase === 'handoff');
  check('first hand-off targets the first player',
    revealTarget(s, c)?.name === 'P1');
  check('nothing secret is showing at hand-off', s.phase !== 'role');

  s = advanceReveal(s, c);
  check('tap shows the role', s.phase === 'role');
  check('role belongs to the same player', revealTarget(s, c)?.name === 'P1');

  s = advanceReveal(s, c);
  check('tap returns to a hand-off, not straight to the next role',
    s.phase === 'handoff');
  check('  → and advances to the next player', revealTarget(s, c)?.name === 'P2');

  // Everyone in the list gets exactly one look.
  const seen: string[] = [];
  let t = createGame(c);
  let guard = 0;
  while (t.phase !== 'starter' && guard++ < 100) {
    if (t.phase === 'role') seen.push(revealTarget(t, c)!.name);
    t = advanceReveal(t, c);
  }
  check('every player is shown exactly once',
    JSON.stringify(seen) === JSON.stringify(['P1', 'P2', 'P3', 'P4']),
    JSON.stringify(seen));
  check('lands on the starter screen after the last player', t.phase === 'starter');
  check('a first speaker is named', firstSpeaker(t, c) !== null);
  check('the first speaker is a real player',
    c.players.some(p => p.name === firstSpeaker(t, c)!.name));
}

console.log('\n4. Phase order is enforced');
{
  const c = cfg();
  const fresh = createGame(c);
  check('cannot skip to clues from handoff', startClues(fresh).phase === 'handoff');
  check('cannot vote before the clue round', goToAccuse(fresh).phase === 'handoff');
  check('cannot accuse outside the accuse phase',
    toggleAccused(fresh, 0).current.accused.length === 0);
  const atStarter = completeReveal(createGame(c), c);
  check('starter → clues', startClues(atStarter).phase === 'clues');
  check('clues → accuse', goToAccuse(startClues(atStarter)).phase === 'accuse');
}

console.log('\n5. Accusation');
{
  const c = cfg({ players: players(5), traitorCount: 2 });
  let s = goToAccuse(startClues(completeReveal(createGame(c), c)));
  check('two traitors were assigned', s.current.traitorIndices.length === 2);
  check('no accusation yet', !accusationComplete(s));

  s = toggleAccused(s, 0);
  check('one suspect selected', s.current.accused.length === 1);
  check('still incomplete', !accusationComplete(s));

  s = toggleAccused(s, 0);
  check('tapping again deselects', s.current.accused.length === 0);

  s = toggleAccused(s, 0);
  s = toggleAccused(s, 1);
  check('two suspects selected', s.current.accused.length === 2);
  check('accusation is complete', accusationComplete(s));

  const overselected = toggleAccused(s, 2);
  check('cannot accuse more people than there are traitors',
    overselected.current.accused.length === 2);

  check('submitting before completion is ignored',
    submitAccusation(toggleAccused(s, 0), c).phase === 'accuse');
}

console.log('\n6. Scoring');
{
  // Exact catch → innocents win.
  const c = cfg({ players: players(5), traitorCount: 1 });
  let s = goToAccuse(startClues(completeReveal(createGame(c), c)));
  const traitor = s.current.traitorIndices[0];
  s = submitAccusation(toggleAccused(s, traitor), c);
  check('catching the traitor wins it for the innocents',
    s.current.innocentsWin === true);
  check('  → score updated', s.score.innocentWins === 1 && s.score.traitorWins === 0);
  check('  → traitor recorded as caught',
    s.stats[c.players[traitor].id].caught === 1);
  check('  → traitor did not survive',
    s.stats[c.players[traitor].id].survived === 0);
  check('  → counted as a traitor round',
    s.stats[c.players[traitor].id].timesTraitor === 1);

  // Wrong person → traitors win.
  let s2 = goToAccuse(startClues(completeReveal(createGame(c), c)));
  const t2 = s2.current.traitorIndices[0];
  const innocent = [0, 1, 2, 3, 4].find(i => i !== t2)!;
  s2 = submitAccusation(toggleAccused(s2, innocent), c);
  check('accusing an innocent hands it to the traitors',
    s2.current.innocentsWin === false);
  check('  → traitor recorded as survived',
    s2.stats[c.players[t2].id].survived === 1);

  // Partial catch with two traitors → traitors win.
  const c3 = cfg({ players: players(6), traitorCount: 2 });
  let s3 = goToAccuse(startClues(completeReveal(createGame(c3), c3)));
  const [tA] = s3.current.traitorIndices;
  const bystander = [0, 1, 2, 3, 4, 5].find(i => !s3.current.traitorIndices.includes(i))!;
  s3 = submitAccusation(toggleAccused(toggleAccused(s3, tA), bystander), c3);
  check('catching only one of two traitors is still a traitor win',
    s3.current.innocentsWin === false);
}

console.log('\n7. Rounds');
{
  const c = cfg({ players: players(4), traitorCount: 1, totalRounds: 3 });
  let s = createGame(c);
  const wordsSeen: string[] = [];

  for (let r = 1; r <= 3; r++) {
    check(`round ${r} is numbered correctly`, s.round === r);
    wordsSeen.push(s.current.word.id);
    s = goToAccuse(startClues(completeReveal(s, c)));
    s = submitAccusation(toggleAccused(s, s.current.traitorIndices[0]), c);
    check(`round ${r} resolves`, s.phase === 'result');
    s = nextRound(s, c);
  }
  check('game ends after the configured rounds', isOver(s));
  check('no word repeated across rounds',
    new Set(wordsSeen).size === wordsSeen.length, JSON.stringify(wordsSeen));
  check('innocents won all three', s.score.innocentWins === 3);
}
{
  const c = cfg({ players: players(4), totalRounds: null });
  let s = createGame(c);
  for (let r = 0; r < 5; r++) {
    s = goToAccuse(startClues(completeReveal(s, c)));
    s = submitAccusation(toggleAccused(s, s.current.traitorIndices[0]), c);
    s = nextRound(s, c);
  }
  check('endless keeps dealing rounds', !isOver(s) && s.round === 6);
  check('quit ends it', isOver(endGame(s)));
}

console.log('\n8. Role lookup');
{
  const c = cfg({ players: players(5), traitorCount: 2 });
  const s = createGame(c);
  const flagged = [0, 1, 2, 3, 4].filter(i => isTraitor(s, i));
  check('isTraitor agrees with the assignment',
    JSON.stringify(flagged.sort()) === JSON.stringify([...s.current.traitorIndices].sort()));
  check('at least two players are innocent', 5 - flagged.length >= 2);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
