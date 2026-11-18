# MTG Tabletop

A free, browser-based tabletop for playing **Magic: The Gathering** with up to 4 friends online, on a computer or a phone.

- **No server to run.** It's a plain website (host it free on GitHub Pages). The host's browser *is* the game, and friends connect straight to it, peer-to-peer.
- **Games are saved** in the host's browser after every action. Anyone who drops out just reloads and rejoins. The host can close the tab or restart their PC and carry on later.
- **Archidekt decklists with the right art.** Paste Archidekt's text export and each card shows the exact printing you picked (via Scryfall).
- **Computer and phone layouts.** On a phone (portrait or landscape) the battlefield fills the screen, your hand sits along the bottom, and everything else is a tap away.
- **Fair-play permission system.** Touching another player's battlefield, hand, library or life sends them an Allow / Deny request.
- **Effects that do the maths.** Set up what cards do (anthems, equipment, "+1/+0 for each artifact", "enters with an extra counter", keywords). Power/toughness totals then update by themselves. A helper reads your cards' text when you import and suggests effects for you to approve.
- **Undo**, a **flickable d20** (and a dice-off for turn order), **mulligans**, **proliferate**, **counters**, **equipment & auras**, **tokens**, **commander damage & tax**, **chat** and a **game log**.
- **Combat screen**: a dark overlay on computer (its own screen on phones); drag attackers in (at players or planeswalkers), defenders drag in blockers, each column shows the damage it would deal (double strike, +X and ×N included, in the order you choose), and everyone presses Done.
- **A big free battlefield**: put cards anywhere; new cards land in the middle of your screen; **Fit** shows everything.
- **Reveal until…**, a tidy library menu (click for the menu, double-click to draw), and a little shuffle animation.
- **Emoji reactions** on chat and log lines: 😠 😂 🖕 😭 😨 💀 👍 😈 🫰
- **Rules aren't enforced.** Like a real table, you're in charge. Every card links to its Scryfall page for rulings.

👉 **New here? Follow [docs/SETUP.md](docs/SETUP.md)** to put it on GitHub Pages (one time) and see what to do each time you play.

## Quick tour (computer)

| Do this | How |
|---|---|
| Move a card | Drag it: battlefield, hand (drop between cards to sort), stack, piles, another player's battlefield |
| Tap / untap | Click it, or hover + <kbd>T</kbd> |
| See a card big + its total P/T, counters, effects | Hover it |
| All options | Right-click (counters, P/T bonus, effects, attach, transform, face down, move to…, Open on Scryfall) |
| Cast so others can respond | Drag to the **Stack**. Right-click there for Resolves / Doesn't resolve |
| Equipment / auras | Drag onto a creature |
| Search your library | Right-click library → Search, then type (name matches first, then type/rules-text matches) |
| See everyone | **All battlefields**: a grid in turn order (you bottom-left) |
| Undo | **↶ Undo** or <kbd>Ctrl</kbd>+<kbd>Z</kbd> |
| d20 | **d20** drops a die on your battlefield; flick it to roll, click it to remove |

## Quick tour (phone)

| Do this | How |
|---|---|
| Phases / pass turn | Top bar. Tap phases as you go, **Pass ▶** at the end |
| Play a card | Drag it up out of your hand (lands → battlefield, everything else → stack) |
| Look at a card in hand | Tap it |
| Re-order your hand | Hold a card, then slide it sideways |
| Battlefield | Drag to look around, pinch to zoom. Tap a land to tap it. Tap anything else for options. Hold + drag to move it |
| Resolve the stack | Tap the spell → green **Resolves** / red **Doesn't resolve** |
| Library, graveyard | Peeking in from the right edge (tap library for its menu, double-tap to draw) |
| Exile, command zone | **Other zones** under the piles |
| Move around | ▲ ▼ ◀ ▶ buttons: opponents above you in turn order, combat in between. **Current player** / **Return** at the top |
| Log | **Log** button at the top |
| Your life | Tap your life badge: slide for damage/gain, ±1, applied when you close it |

## How it works

```
 Host's browser  ◄──── WebRTC data channel (encrypted, direct) ────►  Friends' browsers
 (keeps + saves                                                        (show the table,
  the game state)                                                       send actions)
          ▲                                                                    ▲
          └──────── PeerJS cloud: only helps the browsers find each other ─────┘
```

| File | What it does |
|---|---|
| `js/engine.js` | Game state and every action, plus hidden information, permissions, effects, P/T maths, turn order and dice physics |
| `js/net.js` | Hosting/joining over PeerJS, saving to the host's browser, reconnecting, undo history |
| `js/importer.js` | Decklist parsing, Scryfall lookups, and the effect-suggestion helper |
| `js/ui.js` | Shared interface + the computer layout |
| `js/phone.js` | The phone / touch layout |
| `test/` | Automated tests (`npm test`, needs Node.js 18+; optional) |

## Good to know

- **The host must have the game open** for anyone to play. Saved games live in the browser you host from, so use the same browser and the same site address. *Backup* (lobby or Settings) downloads a file you can restore later or on another device.
- **Host from a computer if you can.** Phones pause pages when you switch apps or lock the screen, which disconnects everyone until you come back. Nothing is lost, though.
- **Anyone with the game code can take an empty seat** (up to 4 players), so only share it with friends.
- As with any peer-to-peer connection, the browsers learn each other's IP addresses. Nothing on your PC opens a port, and nothing runs once you close the tab.
- Some strict networks (certain workplaces, schools or mobile carriers) block direct browser connections. If you can't connect, try a different network.
- **Archidekt links:** Archidekt doesn't let other websites read decks, so paste the text export instead (see SETUP.md). It keeps the exact art.
- **Undo** keeps the last 40 actions while the host's page is open. Shuffles, mulligans and dice rolls can't be undone, so nobody can re-roll or peek and rewind.

## Credits

Card images and data come from [Scryfall](https://scryfall.com). Magic: The Gathering is © Wizards of the Coast. This is an unofficial fan project, not affiliated with or endorsed by Wizards of the Coast, Scryfall or Archidekt. Connections are made with [PeerJS](https://peerjs.com).

Licensed under the MIT License (see `LICENSE`).
