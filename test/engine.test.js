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
  E.applyAction(g, b, { type: 'cmdDamage', playerId: b.id, sourceId: cmd, delta: 7 });
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

/* ------------------------------------------------------------ new features */

const D = { name: 'D', cards: [
  { name: 'Shivan Dragon', qty: 2, typeLine: 'Creature — Dragon', pt: '5/5' },
  { name: 'Llanowar Elves', qty: 2, typeLine: 'Creature — Elf Druid', pt: '1/1' },
  { name: 'Storm-Kiln Artist', qty: 1, typeLine: 'Creature — Dwarf Shaman', pt: '2/2',
    effects: [{ kind: 'forEach', p: 1, t: 0, count: 'artifact', where: 'you' }] },
  { name: 'Sol Ring', qty: 1, typeLine: 'Artifact' },
  { name: 'Bonesplitter', qty: 1, typeLine: 'Artifact — Equipment', effects: [{ kind: 'pt', who: 'attached', p: 2, t: 0 }] },
  { name: "Mirari's Wake", qty: 1, typeLine: 'Enchantment',
    effects: [{ kind: 'pt', who: 'yours', p: 1, t: 1 }, { kind: 'keyword', who: 'yours', keyword: 'Flying' }] },
  { name: 'Dragonstorm Globe', qty: 1, typeLine: 'Artifact', effects: [{ kind: 'etb', who: 'yours', filter: 'Dragon', n: 1, counter: '+1/+1' }] },
  { name: 'Forest', qty: 30, typeLine: 'Basic Land — Forest' },
] };

function fresh() {
  const g = E.createGame({ name: 'T', format: 'commander' });
  const a = E.joinGame(g, 'Abby').player;
  const b = E.joinGame(g, 'Sam').player;
  E.applyAction(g, a, { type: 'loadDeck', deck: D });
  E.applyAction(g, b, { type: 'loadDeck', deck: D });
  return { g, a, b };
}
const find = (g, p, name) => Object.values(g.cards).find((c) => c.owner === p.id && c.name === name && c.zone !== 'battlefield');
const play = (g, p, name) => {
  const c = find(g, p, name);
  E.applyAction(g, p, { type: 'move', cardId: c.id, to: 'battlefield' });
  return c;
};

test('mulligan / keep / roll for turn order', () => {
  const { g, a, b } = fresh();
  E.applyAction(g, a, { type: 'startGame' });
  assert.equal(g.setup.stage, 'mulligan');
  E.applyAction(g, a, { type: 'mulligan' });
  assert.equal(a.zones.hand.length, 7);
  assert.equal(g.setup.mulls[a.id], 1);
  E.applyAction(g, a, { type: 'keep' });
  assert.throws(() => E.applyAction(g, a, { type: 'mulligan' }), E.GameError);
  E.applyAction(g, b, { type: 'keep' });
  assert.equal(g.setup.stage, 'roll');
  for (let i = 0; i < 20 && g.setup.stage === 'roll'; i++)
    for (const p of [a, b]) if (g.setup.eligible.includes(p.id)) E.applyAction(g, p, { type: 'rollInitiative', vx: 500, vy: -900 });
  assert.equal(g.setup.stage, 'done');
  assert.equal(g.order.length, 2);
  const first = g.order[0];
  const r = g.setup.results;
  const other = g.order[1];
  assert.ok(r[first].join() > r[other].join() || r[first][r[first].length - 1] > r[other][r[other].length - 1]);
  assert.equal(g.turn.active, first);
});

test('touching an opponent\'s stuff needs their permission', () => {
  const { g, a, b } = fresh();
  const elf = play(g, b, 'Llanowar Elves');
  const r = E.applyAction(g, a, { type: 'tap', cardId: elf.id });
  assert.ok(r.pendingRequest);
  assert.equal(elf.tapped, false);
  assert.throws(() => E.applyAction(g, a, { type: 'respond', requestId: r.pendingRequest, allow: true }), E.GameError, 'only the victim answers');
  E.applyAction(g, b, { type: 'respond', requestId: r.pendingRequest, allow: true });
  assert.equal(elf.tapped, true);
  // denial
  const r2 = E.applyAction(g, a, { type: 'life', playerId: b.id, delta: -3 });
  const res = E.applyAction(g, b, { type: 'respond', requestId: r2.pendingRequest, allow: false });
  assert.ok(res.denied);
  assert.equal(b.life, 40);
  // library peek returns private cards to the requester after approval
  const r3 = E.applyAction(g, a, { type: 'viewZone', playerId: b.id, zone: 'library', count: 2 });
  const res3 = E.applyAction(g, b, { type: 'respond', requestId: r3.pendingRequest, allow: true });
  assert.equal(res3.privateFor, a.id);
  assert.equal(res3.private.cards.length, 2);
  // proliferate and graveyard stuff need no permission
  assert.equal(E.needsPermission(g, a, { type: 'proliferate', cardIds: [elf.id] }), null);
  assert.equal(E.needsPermission(g, a, { type: 'move', cardId: elf.id, to: 'graveyard' }), b.id);
});

test('stolen creatures can be tapped freely by the new controller', () => {
  const { g, a, b } = fresh();
  const elf = play(g, b, 'Llanowar Elves');
  E.applyAction(g, b, { type: 'move', cardId: elf.id, to: 'battlefield', playerId: a.id });
  assert.equal(E.needsPermission(g, a, { type: 'tap', cardId: elf.id }), null);
});

test('+1/+1 and -1/-1 counters cancel out; proliferate', () => {
  const { g, a } = fresh();
  const d = play(g, a, 'Shivan Dragon');
  E.applyAction(g, a, { type: 'cardCounter', cardId: d.id, name: '+1/+1', delta: 3 });
  E.applyAction(g, a, { type: 'cardCounter', cardId: d.id, name: '-1/-1', delta: 1 });
  assert.deepEqual(d.counters, { '+1/+1': 2 });
  E.applyAction(g, a, { type: 'cardCounter', cardId: d.id, name: '-1/-1', delta: 4 });
  assert.deepEqual(d.counters, { '-1/-1': 2 });
  E.applyAction(g, a, { type: 'cardCounter', cardId: d.id, name: 'charge', delta: 1 });
  a.counters.poison = 2;
  E.applyAction(g, a, { type: 'proliferate', cardIds: [d.id], playerIds: [a.id] });
  assert.deepEqual(d.counters, { '-1/-1': 3, charge: 2 });
  assert.equal(a.counters.poison, 3);
});

test('effects: anthems, for-each, equipment, keywords, ETB counters, manual bonus', () => {
  const { g, a, b } = fresh();
  const artist = play(g, a, 'Storm-Kiln Artist');
  let st = E.computeStats(g)[artist.id];
  assert.equal(st.total, '2/2');
  play(g, a, 'Sol Ring');
  const bs = play(g, a, 'Bonesplitter');
  st = E.computeStats(g)[artist.id];
  assert.equal(st.total, '4/2', 'two artifacts');
  E.applyAction(g, a, { type: 'attach', cardId: bs.id, targetId: artist.id });
  st = E.computeStats(g)[artist.id];
  assert.equal(st.total, '6/2');
  play(g, a, "Mirari's Wake");
  st = E.computeStats(g)[artist.id];
  assert.equal(st.total, '7/3');
  assert.deepEqual(st.keywords.map((k) => k.keyword), ['Flying']);
  const theirElf = play(g, b, 'Llanowar Elves');
  assert.equal(E.computeStats(g)[theirElf.id].total, '1/1', "anthem doesn't affect opponents");
  play(g, a, 'Dragonstorm Globe');
  const dragon = play(g, a, 'Shivan Dragon');
  assert.deepEqual(dragon.counters, { '+1/+1': 1 });
  assert.equal(E.computeStats(g)[dragon.id].total, '7/7');
  E.applyAction(g, a, { type: 'setPtMod', cardId: dragon.id, p: 3, t: 0 });
  assert.equal(E.computeStats(g)[dragon.id].total, '10/7');
  assert.deepEqual(E.computeStats(g)[dragon.id].fx, { p: 4, t: 1 });
  // equipment falls off when the creature dies
  E.applyAction(g, a, { type: 'move', cardId: artist.id, to: 'graveyard' });
  assert.equal(bs.attachedTo, null);
});

test('setEffects updates every copy and the deck list', () => {
  const { g, a } = fresh();
  const elf = find(g, a, 'Llanowar Elves');
  E.applyAction(g, a, { type: 'setEffects', cardId: elf.id, effects: [{ kind: 'pt', who: 'self', p: 1, t: 1 }] });
  const copies = Object.values(g.cards).filter((c) => c.owner === a.id && c.name === 'Llanowar Elves');
  assert.equal(copies.length, 2);
  for (const c of copies) assert.equal(c.effects.length, 1);
  assert.equal(a.deck.cards.find((t) => t.name === 'Llanowar Elves').effects.length, 1);
  assert.equal(E.describeEffect({ kind: 'pt', who: 'yoursOther', filter: 'Elf', p: 1, t: 1 }), 'Other Elf creatures you control get +1/+1');
});

test('dice physics is deterministic and stays on the table', () => {
  const f1 = E.simulateDie(100, 100, 2500, -1800, 1600, 700);
  const f2 = E.simulateDie(100, 100, 2500, -1800, 1600, 700);
  assert.deepEqual(f1, f2);
  for (const [x, y] of f1) assert.ok(x >= 0 && y >= 0 && x <= 1530 && y <= 630);
  const { g, a } = fresh();
  E.applyAction(g, a, { type: 'placeDie' });
  const die = Object.values(g.dice)[0];
  E.applyAction(g, a, { type: 'rollDie', dieId: die.id, vx: 900, vy: 300 });
  assert.ok(die.value >= 1 && die.value <= 20);
  const last = E.simulateDie(die.sx, die.sy, die.vx, die.vy, 1600, 700).pop();
  assert.deepEqual([die.x, die.y], [last[0], last[1]]);
});

test('hand can be re-sorted', () => {
  const { g, a } = fresh();
  E.applyAction(g, a, { type: 'draw', n: 3 });
  const [x, y, z] = a.zones.hand;
  E.applyAction(g, a, { type: 'reorderHand', cardId: z, index: 0 });
  assert.deepEqual(a.zones.hand, [z, x, y]);
});

test('effect helper reads common card wordings', () => {
  const t = (name, oracle) => I.suggestEffects({ name, oracle }).suggestions.map((s) => s.text);
  assert.deepEqual(t("Mirari's Wake", 'Creatures you control get +1/+1 and have flying.'), ['Creatures you control get +1/+1', 'Creatures you control have Flying']);
  assert.deepEqual(t('Storm-Kiln Artist', 'Storm-Kiln Artist gets +1/+0 for each artifact you control.'), ['This creature gets +1/+0 for each artifact you control']);
  assert.deepEqual(t('Dragonstorm Globe', 'Each Dragon you control enters with an additional +1/+1 counter on it.'), ['Dragon creatures you control enter with 1 extra +1/+1 counter']);
  assert.deepEqual(t('Bonesplitter', 'Equipped creature gets +2/+0.\nEquip {1}'), ['Equipped/enchanted creature gets +2/+0']);
  assert.deepEqual(t('Giant Growth', 'Target creature gets +3/+3 until end of turn.'), []);
  assert.equal(I.suggestEffects({ name: 'Crusade', oracle: 'White creatures get +1/+1.' }).unhandled, true);
});
