// Run with:  node --test test/
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const I = require('../js/importer.js');

function setup() {
  const g = E.createGame({ name: 'Test', format: 'commander' });
  const a = E.joinGame(g, 'Abby').player;
  const b = E.joinGame(g, 'Sam').player;
  g.hostPlayerId = a.id;
  const deck = {
    name: 'D',
    cards: [
      { name: 'Commander Guy', qty: 1, isCommander: true, typeLine: 'Legendary Creature' },
      { name: 'Sol Ring', qty: 1, typeLine: 'Artifact' },
      { name: 'Forest', qty: 60, typeLine: 'Basic Land — Forest' },
    ],
  };
  E.applyAction(g, a, { type: 'loadDeck', deck });
  E.applyAction(g, b, { type: 'loadDeck', deck });
  E.applyAction(g, a, { type: 'startGame' });
  return { g, a, b };
}

test('start game deals 7 and puts commander in command zone', () => {
  const { a, b } = setup();
  for (const p of [a, b]) {
    assert.equal(p.zones.hand.length, 7);
    assert.equal(p.zones.command.length, 1);
    assert.equal(p.zones.library.length, 54);
    assert.equal(p.life, 40);
  }
});

test('opponents cannot see your hand or library', () => {
  const { g, a, b } = setup();
  const v = E.viewFor(g, b.id);
  const abbyView = v.players.find((p) => p.id === a.id);
  assert.equal(abbyView.zones.hand, null);
  for (const id of a.zones.hand) assert.equal(v.cards[id], undefined);
  for (const id of a.zones.library) assert.equal(v.cards[id], undefined);
  assert.equal(JSON.stringify(v).includes(a.token), false, 'tokens must never be sent');
});

test('moving, tapping, counters, tokens', () => {
  const { g, a } = setup();
  const id = a.zones.hand[0];
  E.applyAction(g, a, { type: 'move', cardId: id, to: 'battlefield' });
  assert.equal(g.cards[id].zone, 'battlefield');
  E.applyAction(g, a, { type: 'tap', cardId: id });
  assert.equal(g.cards[id].tapped, true);
  E.applyAction(g, a, { type: 'cardCounter', cardId: id, name: '+1/+1', delta: 3 });
  assert.equal(g.cards[id].counters['+1/+1'], 3);
  E.applyAction(g, a, { type: 'move', cardId: id, to: 'graveyard' });
  assert.equal(g.cards[id].tapped, false);
  assert.deepEqual(g.cards[id].counters, {});
  E.applyAction(g, a, { type: 'createToken', name: 'Treasure', count: 2 });
  const tokens = a.zones.battlefield.filter((x) => g.cards[x].isToken);
  assert.equal(tokens.length, 2);
  E.applyAction(g, a, { type: 'move', cardId: tokens[0], to: 'graveyard' });
  assert.equal(g.cards[tokens[0]], undefined, 'tokens disappear when they leave the battlefield');
});

test('cards always go to their owner\'s graveyard; control can change', () => {
  const { g, a, b } = setup();
  const id = a.zones.hand[0];
  E.applyAction(g, a, { type: 'move', cardId: id, to: 'battlefield', playerId: b.id });
  assert.ok(b.zones.battlefield.includes(id));
  E.applyAction(g, b, { type: 'move', cardId: id, to: 'graveyard' });
  assert.ok(a.zones.graveyard.includes(id));
});

test('commander tax and commander damage', () => {
  const { g, a, b } = setup();
  const cmd = a.zones.command[0];
  E.applyAction(g, a, { type: 'move', cardId: cmd, to: 'battlefield' });
  E.applyAction(g, a, { type: 'move', cardId: cmd, to: 'command' });
  E.applyAction(g, a, { type: 'move', cardId: cmd, to: 'stack' });
  assert.equal(g.cards[cmd].castCount, 2);
  E.applyAction(g, a, { type: 'cmdDamage', playerId: b.id, sourceId: cmd, delta: 7 });
  assert.equal(b.cmdDamage[cmd], 7);
  assert.equal(b.life, 33);
});

test('pass turn untaps and draws for the next player', () => {
  const { g, a, b } = setup();
  g.turn.active = a.id;
  const id = b.zones.hand[0];
  E.applyAction(g, b, { type: 'move', cardId: id, to: 'battlefield' });
  E.applyAction(g, b, { type: 'tap', cardId: id });
  E.applyAction(g, a, { type: 'passTurn' });
  assert.equal(g.turn.active, b.id);
  assert.equal(g.cards[id].tapped, false);
  assert.equal(b.zones.hand.length, 7);
});

test('bad actions are rejected cleanly', () => {
  const { g, a } = setup();
  assert.throws(() => E.applyAction(g, a, { type: 'nope' }), E.GameError);
  assert.throws(() => E.applyAction(g, a, { type: 'move', cardId: 'missing', to: 'hand' }), E.GameError);
  assert.throws(() => E.applyAction(g, a, { type: 'move', cardId: a.zones.hand[0], to: 'moon' }), E.GameError);
});

test('game state survives a save/load round trip (JSON)', () => {
  const { g, a } = setup();
  const copy = JSON.parse(JSON.stringify(g));
  const a2 = copy.players.find((p) => p.id === a.id);
  E.applyAction(copy, a2, { type: 'draw', n: 2 });
  assert.equal(a2.zones.hand.length, 9);
});

test('decklist parser handles Archidekt export lines', () => {
  const { entries } = I.parseText(`1x Atraxa, Praetors' Voice (2x2) 190 [Commander{top}]
1x Sol Ring (c21) 263 [Ramp]
1x Doubling Season (2xm) 159 [Maybeboard]
10x Forest (m19) 280 ^Have,#37d67a^
1 Lightning Bolt
Island`);
  assert.deepEqual(
    entries.map((e) => [e.qty, e.name, e.set, e.cn, e.isCommander]),
    [
      [1, "Atraxa, Praetors' Voice", '2x2', '190', true],
      [1, 'Sol Ring', 'c21', '263', false],
      [10, 'Forest', 'm19', '280', false],
      [1, 'Lightning Bolt', null, null, false],
      [1, 'Island', null, null, false],
    ],
  );
});

test('decklist parser handles Arena/Moxfield style sections', () => {
  const { entries } = I.parseText(`Commander
1 Krenko, Mob Boss (DDT) 52

Deck
1 Goblin Bombardment *F*
SIDEBOARD:
1 Shock`);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].isCommander, true);
  assert.equal(entries[1].name, 'Goblin Bombardment');
});

test('archidekt link detection', () => {
  assert.equal(I.archidektId('https://archidekt.com/decks/19345263/yuriko_ninjas'), '19345263');
  assert.equal(I.archidektId('1 Sol Ring'), null);
});
