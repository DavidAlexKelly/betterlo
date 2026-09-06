// tools/dealer-smoke.ts
// ─────────────────────────────────────────────────────────────────────────────
// Behavioural checks for Screw the Dealer!'s rules.
//
// Because src/data/dealerGame.ts is React-free and takes an injectable deck,
// these tests play real games with a KNOWN card order — so dealer rotation,
// streaks, the drink cap and the end conditions are actually verified rather
// than eyeballed.
//
// Run from the project root:
//
//   npx tsc --outDir .dealer-build --rootDir . --module commonjs \
//           --target ES2020 --moduleResolution node --resolveJsonModule \
//           --strict --skipLibCheck --esModuleInterop tools/dealer-smoke.ts
//   node .dealer-build/tools/dealer-smoke.js
//
// Exits non-zero on failure.
// ─────────────────────────────────────────────────────────────────────────────

import {
  Card, DECK_SIZE, RANKS, SUITS,
  buildDeck, cardName, dealerDrinks, hintFor, possibleRanks, rankLabel,
  rawDifference, remainingByRank, wrongGuessDrinks,
} from '../src/data/dealerData';
import {
  DealerConfig, DealerState,
  applyGuess, applyNextTurn, createGame, dealerDamage, endGame, isOver,
  nextGuesserIndex,
} from '../src/data/dealerGame';

let failures = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { console.log(`  ok   ${name}`); }
  else { console.error(`  FAIL ${name} ${detail}`); failures++; }
}

const PLAYERS = [
  { id: 1, name: 'Ada' },
  { id: 2, name: 'Bea' },
  { id: 3, name: 'Cal' },
  { id: 4, name: 'Dee' },
];

const cfg = (over: Partial<DealerConfig> = {}): DealerConfig => ({
  players: PLAYERS,
  drinkCap: 10,
  endCondition: 'endless',
  mercyTurns: null,
  ...over,
});

/** A deck of the given ranks, all spades — enough for rules tests. */
const deckOf = (ranks: number[]): Card[] =>
  ranks.map(r => ({ rank: r, suit: 'spades' as const, id: `${r}-spades` }));

/** Play one turn to a resolution with an explicit pair of guesses. */
function playTurn(state: DealerState, c: DealerConfig, g1: number, g2?: number) {
  let s = applyGuess(state, g1, c);
  if (s.phase === 'guess2' && g2 !== undefined) s = applyGuess(s, g2, c);
  return s;
}

console.log('\n1. Deck');
const deck = buildDeck();
check('52 cards', deck.length === DECK_SIZE, `got ${deck.length}`);
check('four of every rank',
  RANKS.every(r => deck.filter(c => c.rank === r).length === 4));
check('thirteen of every suit',
  SUITS.every(s => deck.filter(c => c.suit === s).length === 13));
check('all ids unique', new Set(deck.map(c => c.id)).size === DECK_SIZE);
check('aces are low', rankLabel(1) === 'A' && rankLabel(13) === 'K');
check('face labels', rankLabel(11) === 'J' && rankLabel(12) === 'Q');
check('card names read properly',
  cardName({ rank: 12, suit: 'hearts', id: 'x' }) === 'Queen of Hearts');

console.log('\n2. Hints are honest');
check('card above the guess says higher', hintFor(5, 9) === 'higher');
check('card below the guess says lower', hintFor(9, 5) === 'lower');
check('possible ranks after higher exclude the guess',
  possibleRanks(5, 'higher').every(r => r > 5) && !possibleRanks(5, 'higher').includes(5));
check('possible ranks after lower exclude the guess',
  possibleRanks(5, 'lower').every(r => r < 5));
check('higher on 12 leaves only the king',
  JSON.stringify(possibleRanks(12, 'higher')) === '[13]');

console.log('\n3. Drink maths');
check('your example: guessed 6, card was 3 → 3 drinks',
  wrongGuessDrinks(6, 3, 10) === 3);
check('your example: guessed 5, card was 2 → 3 drinks',
  wrongGuessDrinks(5, 2, 10) === 3);
check('difference is symmetric', rawDifference(3, 9) === rawDifference(9, 3));
check('worst case uncapped is 12', wrongGuessDrinks(1, 13, null) === 12);
check('cap of 10 clamps the worst case', wrongGuessDrinks(1, 13, 10) === 10);
check('cap does not touch a small miss', wrongGuessDrinks(7, 6, 10) === 1);
check('cap boundary is inclusive, not off by one',
  wrongGuessDrinks(1, 11, 10) === 10 && wrongGuessDrinks(1, 12, 10) === 10);
check('dealer takes 4 when beaten first guess', dealerDrinks(1) === 4);
check('dealer takes 2 when beaten second guess', dealerDrinks(2) === 2);
check('sip intensity raises the dealer penalty', dealerDrinks(1, { bonus: 2 }) === 6);

console.log('\n4. Turn resolution');
{
  const c = cfg();
  // Deck: first card is a 7.
  const s0 = createGame(c, deckOf([7, 7, 7, 7, 7, 7, 7, 7]));
  check('dealer starts as the first player', s0.dealerIndex === 0);
  check('guesser is the player to the dealer\'s left', s0.guesserIndex === 1);
  check('card is hidden before any guess', s0.outcome === null);

  const nailed = applyGuess(s0, 7, c);
  check('correct first guess resolves immediately', nailed.phase === 'reveal');
  check('  → dealer drinks 4', nailed.outcome?.dealerDrinks === 4);
  check('  → guesser drinks nothing', nailed.outcome?.guesserDrinks === 0);
  check('  → streak stays at 0', nailed.streak === 0);
  check('  → recorded as a correct guess',
    nailed.stats.correctGuesses[PLAYERS[1].id] === 1);

  const missedOnce = applyGuess(s0, 4, c);
  check('wrong first guess asks for a second', missedOnce.phase === 'guess2');
  check('  → hint says higher', missedOnce.hint === 'higher');
  check('  → nothing is drunk yet', missedOnce.outcome === null);

  const second = applyGuess(missedOnce, 7, c);
  check('correct second guess → dealer drinks 2', second.outcome?.dealerDrinks === 2);
  check('  → streak still 0', second.streak === 0);

  const missedTwice = applyGuess(missedOnce, 10, c);
  check('missed both → guesser drinks the difference',
    missedTwice.outcome?.guesserDrinks === 3, `got ${missedTwice.outcome?.guesserDrinks}`);
  check('  → dealer drinks nothing', missedTwice.outcome?.dealerDrinks === 0);
  check('  → streak advances to 1', missedTwice.streak === 1);
  check('  → card is laid on the table', missedTwice.revealed.length === 1);
  check('  → hidden card is cleared', missedTwice.hiddenCard === null);

  // No card may ever be lost or duplicated: every card is either undealt, on
  // the table, or the one currently in hand.
  const accounted = (s: DealerState) =>
    s.deck.length + s.revealed.length + (s.hiddenCard ? 1 : 0);
  check('card conservation holds mid-turn', accounted(s0) === 8, `got ${accounted(s0)}`);
  check('card conservation holds after the hint',
    accounted(missedOnce) === 8, `got ${accounted(missedOnce)}`);
  check('card conservation holds after resolution',
    accounted(missedTwice) === 8, `got ${accounted(missedTwice)}`);
  check('the dealt card is the one that reached the table',
    missedTwice.revealed[0].rank === 7);
}

console.log('\n5. Streak and passing the deck');
{
  const c = cfg();
  let s = createGame(c, deckOf([7, 7, 7, 7, 7, 7, 7, 7]));
  // Three players in a row fail.
  s = playTurn(s, c, 4, 10); // Bea misses
  check('after 1 beaten, deck stays', s.outcome?.passedDeck === false);
  s = applyNextTurn(s, c);
  check('  → guesser moves to Cal', s.guesserIndex === 2);
  check('  → dealer unchanged', s.dealerIndex === 0);

  s = playTurn(s, c, 4, 10); // Cal misses
  check('after 2 beaten, deck stays', s.outcome?.passedDeck === false);
  s = applyNextTurn(s, c);
  check('  → guesser moves to Dee', s.guesserIndex === 3);

  s = playTurn(s, c, 4, 10); // Dee misses
  check('after 3 beaten, deck passes', s.outcome?.passedDeck === true);
  check('  → reason is the streak', s.outcome?.passReason === 'streak');
  check('  → streak reads 3', s.streak === 3);
  s = applyNextTurn(s, c);
  check('  → dealer moves clockwise to Bea', s.dealerIndex === 1);
  check('  → new guesser is to the new dealer\'s left', s.guesserIndex === 2);
  check('  → streak resets', s.streak === 0);
  check('  → a reign is counted', s.reignsCompleted === 1);
  check('  → new dealer credited with a reign',
    s.stats.reigns[PLAYERS[1].id] === 1);
}

console.log('\n6. A correct guess breaks the streak');
{
  const c = cfg();
  let s = createGame(c, deckOf([7, 7, 7, 7, 7, 7]));
  s = playTurn(s, c, 4, 10); s = applyNextTurn(s, c); // beaten 1
  s = playTurn(s, c, 4, 10); s = applyNextTurn(s, c); // beaten 2
  check('streak sits at 2', s.streak === 2);
  s = applyGuess(s, 7, c);                            // nailed it
  check('a correct guess wipes the streak', s.streak === 0);
  s = applyNextTurn(s, c);
  check('  → dealer keeps the deck', s.dealerIndex === 0);
  check('  → no reign completed', s.reignsCompleted === 0);
}

console.log('\n7. Guesser rotation never lands on the dealer');
{
  for (const count of [2, 3, 4, 5]) {
    const players = Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `P${i + 1}` }));
    const c = cfg({ players });
    let s = createGame(c, deckOf(Array(30).fill(7)));
    let everLandedOnDealer = false;
    for (let t = 0; t < 12; t++) {
      if (s.guesserIndex === s.dealerIndex && count > 1) everLandedOnDealer = true;
      s = playTurn(s, c, 4, 10);
      s = applyNextTurn(s, c);
      if (isOver(s)) break;
    }
    check(`${count} players: guesser is never the dealer`, !everLandedOnDealer);
  }
}

console.log('\n8. Mercy rule');
{
  const c = cfg({ mercyTurns: 4 });
  let s = createGame(c, deckOf(Array(20).fill(7)));
  // Keep guessing correctly so the streak never builds — only mercy can pass it.
  for (let t = 0; t < 3; t++) {
    s = applyGuess(s, 7, c);
    check(`  turn ${t + 1}: deck not passed yet`, s.outcome?.passedDeck === false);
    s = applyNextTurn(s, c);
  }
  s = applyGuess(s, 7, c);
  check('mercy fires on exactly the 4th turn', s.outcome?.passedDeck === true);
  check('  → reason is mercy, not streak', s.outcome?.passReason === 'mercy');
  check('  → streak was never 3', s.outcome?.streakAfter === 0);
}
{
  const c = cfg({ mercyTurns: null });
  let s = createGame(c, deckOf(Array(20).fill(7)));
  for (let t = 0; t < 8; t++) { s = applyGuess(s, 7, c); s = applyNextTurn(s, c); }
  check('mercy off → dealer never escapes by time', s.dealerIndex === 0);
}

console.log('\n9. End conditions');
{
  // deck: runs out and stops.
  const c = cfg({ endCondition: 'deck' });
  let s = createGame(c, deckOf([7, 7, 7]));
  s = playTurn(s, c, 4, 10); s = applyNextTurn(s, c);
  s = playTurn(s, c, 4, 10); s = applyNextTurn(s, c);
  check('deck-out: still running on the last card', !isOver(s));
  s = playTurn(s, c, 4, 10); s = applyNextTurn(s, c);
  check('deck-out: game ends when the deck empties', isOver(s));
  check('deck-out: never reshuffles', s.justReshuffled === false);
}
{
  // endless: reshuffles and clears the table.
  const c = cfg({ endCondition: 'endless' });
  let s = createGame(c, deckOf([7, 7]));
  s = playTurn(s, c, 4, 10); s = applyNextTurn(s, c);
  s = playTurn(s, c, 4, 10);
  check('endless: two cards on the table', s.revealed.length === 2);
  s = applyNextTurn(s, c, deckOf([3, 3, 3]));
  check('endless: keeps going past the last card', !isOver(s));
  check('endless: reshuffle is flagged', s.justReshuffled === true);
  check('endless: table is cleared for the new deck', s.revealed.length === 0);
  check('endless: quit ends it', isOver(endGame(s)));
}
{
  // oneDealEach: ends after every player has dealt.
  const c = cfg({ endCondition: 'oneDealEach' });
  let s = createGame(c, deckOf(Array(80).fill(7)));
  let guard = 0;
  while (!isOver(s) && guard++ < 200) {
    s = playTurn(s, c, 4, 10); // always beat the guesser → passes every 3 turns
    s = applyNextTurn(s, c, deckOf(Array(80).fill(7)));
  }
  check('one-deal-each: terminates', isOver(s), `guard=${guard}`);
  check('one-deal-each: exactly one reign per player',
    s.reignsCompleted === PLAYERS.length, `got ${s.reignsCompleted}`);
}

console.log('\n10. Stats and the cap flag');
{
  const c = cfg({ drinkCap: 6 });
  let s = createGame(c, deckOf([13, 13]));
  s = playTurn(s, c, 1, 1); // guessed Ace twice against a King → raw 12
  check('capped hit is clamped', s.outcome?.guesserDrinks === 6);
  check('raw difference is preserved for messaging', s.outcome?.rawDifference === 12);
  check('capped flag is set', s.outcome?.capped === true);
  check('worst hit is recorded', s.stats.worstHit[PLAYERS[1].id] === 6);
  check('totals track the guesser', s.stats.totals[PLAYERS[1].id] === 6);

  const s2 = applyGuess(createGame(c, deckOf([7])), 7, c);
  check('dealer damage is attributed to the dealer',
    s2.stats.asDealer[PLAYERS[0].id] === 4);
  check('dealerDamage() reads the current dealer', dealerDamage(s2, c) === 4);
  check('uncapped small miss leaves capped false',
    playTurn(createGame(c, deckOf([7])), c, 5, 6).outcome?.capped === false);
}

console.log('\n11. Guards');
{
  const c = cfg();
  const s = createGame(c, deckOf([7]));
  check('guessing during reveal is ignored',
    applyGuess(applyGuess(s, 7, c), 3, c).phase === 'reveal');
  check('nextTurn before a resolution is ignored',
    applyNextTurn(s, c).phase === 'guess1');
  check('empty deck starts already over', isOver(createGame(c, [])));
  check('remainingByRank counts down',
    remainingByRank([{ rank: 7, suit: 'spades', id: '7-spades' }])[7] === 3);
  check('remainingByRank leaves others alone',
    remainingByRank([{ rank: 7, suit: 'spades', id: '7-spades' }])[8] === 4);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
