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
  const last = E.simulateDie(die.sx, die.sy, die.vx, die.vy, die.rw, die.rh, 70, die.rx, die.ry).pop();
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
  assert.equal(I.suggestEffects({ name: 'Brute', oracle: 'Attacking creatures you control get +1/+0.' }).unhandled, true);
});

/* ------------------------------------------------------------ v3 features */

const D3 = { name: 'D3', cards: [
  { name: 'Grizzly Bears', qty: 3, typeLine: 'Creature — Bear', pt: '2/2', cmc: 2, colors: ['G'] },
  { name: 'Serra Angel', qty: 1, typeLine: 'Creature — Angel', pt: '4/4', cmc: 5, colors: ['W'], oracle: 'Flying, vigilance' },
  { name: 'Boros Swiftblade', qty: 1, typeLine: 'Creature — Human Soldier', pt: '1/2', cmc: 2, colors: ['R', 'W'], oracle: 'Double strike' },
  { name: 'Jace Beleren', qty: 1, typeLine: 'Legendary Planeswalker — Jace', loyalty: '3', cmc: 3, colors: ['U'] },
  { name: 'Crusade', qty: 1, typeLine: 'Enchantment', cmc: 2, colors: ['W'], effects: [{ kind: 'pt', who: 'all', color: 'W', p: 1, t: 1 }] },
  { name: 'Forest', qty: 20, typeLine: 'Basic Land — Forest', cmc: 0, colors: [] },
] };
function fresh3() {
  const g = E.createGame({ name: 'T3' });
  const a = E.joinGame(g, 'Abby').player;
  const b = E.joinGame(g, 'Sam').player;
  E.applyAction(g, a, { type: 'loadDeck', deck: D3 });
  E.applyAction(g, b, { type: 'loadDeck', deck: D3 });
  g.turn.active = a.id;
  return { g, a, b };
}
const put = (g, p, name, hint) => {
  const c = Object.values(g.cards).find((x) => x.owner === p.id && x.name === name && x.zone !== 'battlefield');
  E.applyAction(g, p, { type: 'move', cardId: c.id, to: 'battlefield', hint });
  return c;
};

test('cards land at the hint point without stacking', () => {
  const { g, a } = fresh3();
  const x = put(g, a, 'Grizzly Bears', { x: 1000, y: 800 });
  const y = put(g, a, 'Grizzly Bears', { x: 1000, y: 800 });
  assert.equal(x.x, 950);
  assert.equal(x.y, 730);
  assert.ok(Math.abs(x.x - y.x) >= 85 || Math.abs(x.y - y.y) >= 115);
});

test('setCounters writes one log line and nets +1/+1 with -1/-1', () => {
  const { g, a } = fresh3();
  const bear = put(g, a, 'Grizzly Bears');
  const logs = g.log.length;
  E.applyAction(g, a, { type: 'setCounters', cardId: bear.id, counters: { '+1/+1': 3, '-1/-1': 1, fire: 2 } });
  assert.deepEqual(bear.counters, { '+1/+1': 2, fire: 2 });
  assert.equal(g.log.length, logs + 1);
  const r = E.applyAction(g, a, { type: 'setCounters', cardId: bear.id, counters: { '+1/+1': 2, fire: 2 } });
  assert.ok(r.noChange);
});

test('planeswalkers enter with loyalty counters', () => {
  const { g, a } = fresh3();
  const jace = put(g, a, 'Jace Beleren');
  assert.equal(jace.counters.loyalty, 3);
});

test('colour and mana value filters', () => {
  const { g, a } = fresh3();
  const angel = put(g, a, 'Serra Angel');
  const bear = put(g, a, 'Grizzly Bears');
  put(g, a, 'Crusade');
  const st = E.computeStats(g);
  assert.equal(st[angel.id].total, '5/5', 'white creature gets +1/+1');
  assert.equal(st[bear.id].total, '2/2', 'green creature does not');
  assert.equal(E.describeEffect({ kind: 'pt', who: 'yours', color: 'W', mvOp: '<=', mv: 3, p: 1, t: 1 }), 'White creatures you control with mana value 3 or less get +1/+1');
});

test('reveal until a creature', () => {
  const { g, a } = fresh3();
  a.zones.library.sort((x, y) => (g.cards[x].name === 'Serra Angel') - (g.cards[y].name === 'Serra Angel'));
  const libBefore = a.zones.library.length;
  E.applyAction(g, a, { type: 'revealUntil', typeWord: 'creature', mvOp: '>=', mv: 5 });
  const rv = g.reveal;
  assert.equal(g.cards[rv.found].name, 'Serra Angel');
  E.applyAction(g, a, { type: 'resolveReveal', found: 'hand', rest: 'bottom' });
  assert.equal(g.reveal, null);
  assert.ok(a.zones.hand.includes(rv.found));
  assert.equal(a.zones.library.length, libBefore - 1);
});

test('combat: attack, block, damage with double strike and modifiers, both press done', () => {
  const { g, a, b } = fresh3();
  const angel = put(g, a, 'Serra Angel');
  const blade = put(g, a, 'Boros Swiftblade');
  const jace = put(g, b, 'Jace Beleren');
  const bear = put(g, b, 'Grizzly Bears');
  E.applyAction(g, a, { type: 'setPhase', phase: 4 });
  assert.ok(g.combat);
  E.applyAction(g, a, { type: 'declareAttack', cardId: angel.id, target: { kind: 'player', id: b.id } });
  E.applyAction(g, a, { type: 'declareAttack', cardId: blade.id, target: { kind: 'pw', id: jace.id } });
  assert.equal(E.needsPermission(g, a, { type: 'declareAttack', cardId: angel.id }), null);
  const atA = g.combat.attacks[0];
  const atB = g.combat.attacks[1];
  assert.throws(() => E.applyAction(g, a, { type: 'block', attackId: atA.id, cardId: angel.id }), E.GameError);
  E.applyAction(g, b, { type: 'block', attackId: atA.id, cardId: bear.id });
  assert.deepEqual(atA.blockers, [bear.id]);
  let v = E.viewFor(g, a.id);
  assert.equal(v.combat.attacks[0].dmg, 4);
  assert.equal(v.combat.attacks[1].dmg, 2, 'double strike doubles 1 power');
  E.applyAction(g, a, { type: 'combatMod', attackId: atB.id, op: '+', n: 2 });
  E.applyAction(g, a, { type: 'combatMod', attackId: atB.id, op: 'x', n: 2 });
  v = E.viewFor(g, a.id);
  assert.equal(v.combat.attacks[1].dmg, 8, '(2 + 2) x 2');
  E.applyAction(g, b, { type: 'combatMod', attackId: atB.id, op: 'move', index: 1, dir: 'left' });
  v = E.viewFor(g, a.id);
  assert.equal(v.combat.attacks[1].dmg, 6, 'defender re-orders: 2 x 2 + 2');
  E.applyAction(g, a, { type: 'combatDone' });
  assert.ok(g.combat, 'waits for the defender');
  E.applyAction(g, b, { type: 'combatDone' });
  assert.equal(g.combat, null);
  assert.equal(angel.tapped, false, 'vigilance');
  assert.equal(blade.tapped, true);
});

test('changing combat resets everyone\'s Done', () => {
  const { g, a, b } = fresh3();
  const bear = put(g, a, 'Grizzly Bears');
  const theirs = put(g, b, 'Grizzly Bears');
  E.applyAction(g, a, { type: 'combatStart' });
  E.applyAction(g, a, { type: 'declareAttack', cardId: bear.id, target: { kind: 'player', id: b.id } });
  E.applyAction(g, a, { type: 'combatDone' });
  E.applyAction(g, b, { type: 'block', attackId: g.combat.attacks[0].id, cardId: theirs.id });
  assert.deepEqual(g.combat.done, {});
});

test('old games are moved onto the big plane', () => {
  const { g, a } = fresh3();
  const bear = put(g, a, 'Grizzly Bears');
  bear.x = 100;
  bear.y = 50;
  delete g.planeV;
  E.upgradeGame(g);
  assert.deepEqual([bear.x, bear.y], [2300, 1700]);
});

test('helper reads colour anthems', () => {
  const r = I.suggestEffects({ name: 'Crusade', oracle: 'White creatures get +1/+1.' });
  assert.deepEqual(r.suggestions.map((x) => x.text), ['All white creatures get +1/+1']);
  assert.equal(r.unhandled, false);
});

test('first player always draws on turn 1', () => {
  for (const n of [2, 3]) {
    const g = E.createGame({ name: 'T' });
    const ps = ['A', 'B', 'C'].slice(0, n).map((x) => E.joinGame(g, x).player);
    for (const p of ps) E.applyAction(g, p, { type: 'loadDeck', deck: { name: 'D', cards: [{ name: 'Forest', qty: 30, typeLine: 'Basic Land' }] } });
    E.applyAction(g, ps[0], { type: 'startGame' });
    for (const p of ps) E.applyAction(g, p, { type: 'keep' });
    for (let i = 0; i < 30 && g.setup.stage === 'roll'; i++) for (const p of ps) if (g.setup.eligible.includes(p.id)) E.applyAction(g, p, { type: 'rollInitiative', vx: 500, vy: 500 });
    const first = ps.find((p) => p.id === g.turn.active);
    assert.equal(first.zones.hand.length, 8);
    assert.equal(g.turn.round, 1);
    assert.equal(g.turn.seat, 1);
  }
});

test('reactions on log lines toggle per player', () => {
  const { g, a, b } = fresh3();
  E.applyAction(g, a, { type: 'chat', text: 'gg' });
  const id = g.log[g.log.length - 1].id;
  E.applyAction(g, a, { type: 'react', logId: id, emoji: '💀' });
  E.applyAction(g, b, { type: 'react', logId: id, emoji: '💀' });
  assert.equal(g.log.find((e) => e.id === id).reactions['💀'].length, 2);
  E.applyAction(g, a, { type: 'react', logId: id, emoji: '💀' });
  assert.deepEqual(g.log.find((e) => e.id === id).reactions['💀'], [b.id]);
  assert.throws(() => E.applyAction(g, a, { type: 'react', logId: id, emoji: '🍕' }), E.GameError);
});

function started(n = 2, cards = [{ name: 'Forest', qty: 30, typeLine: 'Basic Land — Forest' }]) {
  const g = E.createGame({ name: 'T' });
  const ps = ['A', 'B', 'C'].slice(0, n).map((x) => E.joinGame(g, x).player);
  for (const p of ps) E.applyAction(g, p, { type: 'loadDeck', deck: { name: 'D', cards } });
  E.applyAction(g, ps[0], { type: 'startGame' });
  for (const p of ps) E.applyAction(g, p, { type: 'keep' });
  for (let i = 0; i < 30 && g.setup.stage === 'roll'; i++) for (const p of ps) if (g.setup.eligible.includes(p.id)) E.applyAction(g, p, { type: 'rollInitiative', vx: 500, vy: 500 });
  return { g, ps };
}

test('start game waits for everyone to have a deck', () => {
  const g = E.createGame({ name: 'T' });
  const a = E.joinGame(g, 'A').player;
  E.joinGame(g, 'B');
  E.applyAction(g, a, { type: 'loadDeck', deck: { name: 'D', cards: [{ name: 'Forest', qty: 10, typeLine: 'Basic Land' }] } });
  assert.throws(() => E.applyAction(g, a, { type: 'startGame' }), /Waiting for B/);
});

test('turns are numbered by round and seat, with time taken logged', () => {
  const { g } = started(3);
  const act = () => g.players.find((p) => p.id === g.turn.active);
  E.applyAction(g, act(), { type: 'passTurn' });
  assert.deepEqual([g.turn.round, g.turn.seat], [1, 2]);
  E.applyAction(g, act(), { type: 'passTurn' });
  E.applyAction(g, act(), { type: 'passTurn' });
  assert.deepEqual([g.turn.round, g.turn.seat], [2, 1]);
  assert.ok(g.log.some((e) => /turn took/.test(e.text)));
  assert.ok(g.log.some((e) => e.head && /Turn 2\.1/.test(e.text)));
});

test('players who are out are skipped, not logged, and the last one wins', () => {
  const { g, ps } = started(3);
  const [a, b, c] = ps;
  E.applyAction(g, b, { type: 'setOut' });
  const n = g.log.length;
  const card = g.cards[b.zones.hand[0]];
  E.applyAction(g, b, { type: 'move', cardId: card.id, to: 'battlefield' });
  assert.equal(g.log.length, n);
  assert.equal(card.zone, 'battlefield');
  for (let i = 0; i < 4; i++) {
    E.applyAction(g, g.players.find((p) => p.id === g.turn.active), { type: 'passTurn' });
    assert.notEqual(g.turn.active, b.id);
  }
  E.applyAction(g, c, { type: 'setOut' });
  assert.equal(g.winner.id, a.id);
});

test('resolving someone else\'s spell puts it on its owner\'s battlefield', () => {
  const { g, ps } = started(2, [{ name: 'Bear', qty: 30, typeLine: 'Creature — Bear', pt: '2/2' }]);
  const [a, b] = ps;
  const c = g.cards[a.zones.hand[0]];
  E.applyAction(g, a, { type: 'move', cardId: c.id, to: 'stack' });
  E.applyAction(g, b, { type: 'move', cardId: c.id, to: 'battlefield' });
  assert.equal(c.zp, a.id);
});

test('land stacks: insert, reorder, move together, break apart', () => {
  const { g, ps } = started(2);
  const a = ps[0];
  const ids = a.zones.hand.slice(0, 4);
  ids.forEach((id, i) => E.applyAction(g, a, { type: 'move', cardId: id, to: 'battlefield', x: 1000 + i * 200, y: 1000 }));
  const [w, x, y, z] = ids.map((id) => g.cards[id]);
  E.applyAction(g, a, { type: 'stackInsert', cardId: x.id, targetId: w.id, index: 1 });
  E.applyAction(g, a, { type: 'stackInsert', cardId: y.id, targetId: w.id, index: 2 });
  E.applyAction(g, a, { type: 'stackInsert', cardId: z.id, targetId: w.id, index: 0 });
  assert.deepEqual(Object.values(a.stacks)[0], [z.id, w.id, x.id, y.id]);
  assert.equal(z.x, 1000);
  assert.equal(y.y, 1000 - 3 * E.STACK_STEP);
  E.applyAction(g, a, { type: 'position', cardId: z.id, x: 2000, y: 2000 });
  assert.equal(y.x, 2000);
  E.applyAction(g, a, { type: 'stackBreak', cardId: w.id, x: 3000, y: 3000 });
  assert.deepEqual(Object.values(a.stacks), [[x.id, y.id]]); // z is alone, x+y stay stacked
  // x,y would be one stack of two
  E.applyAction(g, a, { type: 'stackInsert', cardId: w.id, targetId: x.id, index: 0 });
  assert.ok(Object.values(a.stacks).some((s) => s.includes(w.id) && s.includes(x.id)));
  E.applyAction(g, a, { type: 'move', cardId: x.id, to: 'graveyard' });
  assert.ok(Object.values(a.stacks).every((s) => !s.includes(x.id)));
});

test('Coat of Arms and Master Biomancer style effects', () => {
  const g = E.createGame({ name: 'T' });
  const a = E.joinGame(g, 'A').player;
  E.applyAction(g, a, { type: 'loadDeck', deck: { name: 'D', cards: [
    { name: 'Elf One', qty: 1, typeLine: 'Creature — Elf Warrior', pt: '1/1' },
    { name: 'Elf Two', qty: 1, typeLine: 'Creature — Elf Druid', pt: '1/1' },
    { name: 'Goblin', qty: 1, typeLine: 'Creature — Goblin', pt: '1/1' },
    { name: 'Coat', qty: 1, typeLine: 'Artifact', effects: [{ kind: 'forEach', who: 'all', p: 1, t: 1, count: 'creature', where: 'all', other: true, shares: true }] },
    { name: 'Biomancer', qty: 1, typeLine: 'Creature — Elf Wizard', pt: '2/4', effects: [{ kind: 'etb', who: 'yoursOther', nFrom: 'power', counter: '+1/+1', typeAdd: 'Mutant' }] },
    { name: 'Bear', qty: 1, typeLine: 'Creature — Bear', pt: '2/2' },
  ] } });
  const byName = (n) => Object.values(g.cards).find((c) => c.name === n);
  for (const n of ['Elf One', 'Elf Two', 'Goblin', 'Coat']) E.applyAction(g, a, { type: 'move', cardId: byName(n).id, to: 'battlefield' });
  let st = E.computeStats(g);
  assert.equal(st[byName('Elf One').id].total, '2/2');
  assert.equal(st[byName('Goblin').id].total, '1/1');
  E.applyAction(g, a, { type: 'move', cardId: byName('Biomancer').id, to: 'battlefield' });
  E.applyAction(g, a, { type: 'move', cardId: byName('Bear').id, to: 'battlefield' });
  const bear = byName('Bear');
  // Biomancer is 2/4 + 2 elves = 4/6, so the bear enters with 4 counters and becomes a Mutant
  assert.equal(bear.counters['+1/+1'], 4);
  assert.ok(bear.extraTypes.includes('Mutant'));
  // keyword / power filters on who gets it
  const eff = E.cleanEffects([{ kind: 'pt', who: 'all', p: 1, t: 0, pOp: '<=', pN: 1 }])[0];
  assert.equal(eff.pOp, '<=');
  assert.match(E.describeEffect(eff), /power 1 or less/);
});

test('edit card info, commander tax, proliferate N, token copies, reveal excluding lands', () => {
  const { g, ps } = started(2, [{ name: 'Bear', qty: 20, typeLine: 'Creature — Bear', pt: '2/2', cmc: 2 }, { name: 'Forest', qty: 20, typeLine: 'Basic Land', cmc: 0 }]);
  const a = ps[0];
  const c = g.cards[a.zones.hand[0]];
  E.applyAction(g, a, { type: 'move', cardId: c.id, to: 'battlefield' });
  E.applyAction(g, a, { type: 'editCard', cardId: c.id, pt: '5/5', typeLine: 'Creature — Bear Dragon' });
  assert.equal(E.computeStats(g)[c.id].total, '5/5');
  E.applyAction(g, a, { type: 'cardCounter', cardId: c.id, name: 'charge', delta: 1 });
  E.applyAction(g, a, { type: 'proliferate', cardIds: [c.id], n: 3 });
  assert.equal(c.counters.charge, 4);
  const before = Object.keys(g.cards).length;
  E.applyAction(g, a, { type: 'clone', cardId: c.id, count: 3 });
  assert.equal(Object.keys(g.cards).length, before + 3);
  E.applyAction(g, a, { type: 'revealUntil', nonland: true, mvOp: '<', mv: 3 });
  assert.ok(!/Land/.test(g.cards[g.reveal.found].typeLine));
});

test('token pictures, reveal X, GIF chat lines', () => {
  const { g, ps } = started(2, [{ name: 'Bear', qty: 30, typeLine: 'Creature — Bear', pt: '2/2' }]);
  const a = ps[0];
  const pic = 'data:image/jpeg;base64,' + 'A'.repeat(400);
  E.applyAction(g, a, { type: 'createToken', name: 'Pet', pt: '1/1', typeLine: 'Token Creature', upload: pic });
  const tok = Object.values(g.cards).find((c) => c.name === 'Pet');
  assert.match(tok.img, E.UPLOAD_REF);
  assert.equal(g.images[tok.img.slice(4)], pic);
  assert.throws(() => E.applyAction(g, a, { type: 'setTokenImage', cardId: tok.id, upload: 'data:text/html;base64,AAAA' }), E.GameError);
  E.applyAction(g, a, { type: 'clone', cardId: tok.id });
  assert.equal(Object.values(g.cards).filter((c) => c.name === 'Pet' && c.img === tok.img).length, 2);
  // reveal X then put them back on top in the same order
  const top3 = a.zones.library.slice(0, 3);
  E.applyAction(g, a, { type: 'revealX', n: 3 });
  assert.deepEqual(g.reveal.ids, top3);
  E.applyAction(g, a, { type: 'resolveReveal', rest: 'top' });
  assert.deepEqual(a.zones.library.slice(0, 3), top3);
  E.applyAction(g, a, { type: 'revealX', n: 2 });
  E.applyAction(g, a, { type: 'resolveReveal', rest: 'hand' });
  assert.ok(top3.slice(0, 2).every((id) => a.zones.hand.includes(id)));
  // GIFs: a host-stored id or a link from a GIF site; other links are ignored
  E.applyAction(g, a, { type: 'chat', gif: 'gif:abcdef1234' });
  assert.equal(g.log[g.log.length - 1].gif, 'gif:abcdef1234');
  E.applyAction(g, a, { type: 'chat', gif: 'https://media.tenor.com/x/y.gif' });
  assert.equal(g.log[g.log.length - 1].gif, 'https://media.tenor.com/x/y.gif');
  const n = g.log.length;
  E.applyAction(g, a, { type: 'chat', gif: 'https://evil.example/x.gif' });
  assert.equal(g.log.length, n);
  assert.ok(E.REACTIONS.includes('😛'));
});
