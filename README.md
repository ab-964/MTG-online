# MTG Tabletop

A free, browser-based tabletop for playing **Magic: The Gathering** with friends online.

- **No server to run.** It's a plain website (host it free on GitHub Pages). The host's browser *is* the game. Friends connect straight to it, peer-to-peer.
- **Games are saved** in the host's browser after every action. If someone drops out, they rejoin and everything is where it was. If the host closes the tab or restarts their PC, they reopen the game from the lobby and carry on.
- **Archidekt decklists with the right art.** Paste Archidekt's text export and each card shows the exact printing (set + collector number) via Scryfall.
- **A real table feel.** Card art on a battlefield you can zoom and scroll around, drag & drop between zones, tapping, counters, notes, tokens, a shared stack, graveyards/exile you can browse, commander damage and tax, life and poison, dice, chat and a game log.
- **Rules aren't enforced.** Like a real table, you're in charge. Right-click any card → *Open on Scryfall* for its rulings.

👉 **New here? Follow [docs/SETUP.md](docs/SETUP.md).** It walks through putting this on GitHub Pages (one time) and what to do each time you play.

## Quick tour

| Do this | How |
|---|---|
| Move a card | Drag it: battlefield, hand, stack, your piles, or another player's battlefield |
| Tap / untap | Click it on the battlefield, or hover + <kbd>T</kbd> |
| See a card big | Hover it |
| All card options | Right-click (counters, notes, transform, face down, token copy, move to…, **Open on Scryfall**) |
| Draw | Click your library or press <kbd>D</kbd> |
| Search / scry / mill / mulligan | Right-click your library |
| Cast with a chance to respond | Drag to the **Stack**, double-click it there to resolve |
| Zoom / scroll the battlefield | Mouse wheel / drag an empty spot / "fit" button |
| Create tokens | **+ Token** (searches Scryfall), or right-click a card that makes tokens |
| Life | ± buttons (<kbd>Shift</kbd> = 5), click the number to type it |

## How it works

```
 Host's browser  ◄──── WebRTC data channel (encrypted, direct) ────►  Friend's browser
 (keeps + saves                                                        (shows the table,
  the game state)                                                       sends actions)
          ▲                                                                    ▲
          └──────── PeerJS cloud: only helps the two browsers find each other ┘
```

- `js/engine.js`: game state and every action (move, tap, counters, turns…). It also decides what each player is allowed to see (hidden hands and libraries).
- `js/net.js`: hosting/joining over PeerJS, saving to the host's browser storage, reconnecting.
- `js/importer.js`: decklist parsing and Scryfall lookups.
- `js/ui.js`: everything on screen.
- `test/`: automated tests for the engine and the decklist parser (`npm test`, needs Node.js 18+; optional).

## Good to know

- **The host must have the game open** for anyone to play. Saved games live in the browser you host from, so use the same browser and the same site address. *Backup* (lobby or Settings) downloads a file you can restore later or on another PC.
- **Anyone with the game code can take an empty seat** (up to 4 players), so only share it with friends.
- As with any peer-to-peer connection, the browsers learn each other's IP addresses. Nothing on your PC opens a port, and nothing runs once you close the tab.
- Some strict networks (certain workplaces, schools or mobile carriers) block direct browser connections. If you can't connect, try a different network.
- **Archidekt links:** Archidekt doesn't let other websites read decks, so paste the text export instead (see SETUP.md). The paste option keeps the exact art.

## Credits

Card images and data come from [Scryfall](https://scryfall.com). Magic: The Gathering is © Wizards of the Coast. This is an unofficial fan project, not affiliated with or endorsed by Wizards of the Coast, Scryfall or Archidekt. Connections are made with [PeerJS](https://peerjs.com).

Licensed under the MIT License (see `LICENSE`).
