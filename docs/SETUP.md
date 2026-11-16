# Setup & how to play

## Part 1: One-time setup (about 10 minutes)

You'll put the site on GitHub Pages. It's free, and you get a web address like
`https://YOUR-NAME.github.io/mtg-tabletop/` that both of you open.

1. **Make a GitHub account** at <https://github.com> (skip if you have one).
2. **Create a repository:** click **+** (top right) → **New repository**.
   - Name: `mtg-tabletop`
   - Set it to **Public** (free GitHub Pages needs a public repository)
   - Click **Create repository**.
3. **Upload the files:** on the new repository's page click **uploading an existing file**
   (or **Add file → Upload files**). Unzip the download first, open the `mtg-tabletop` folder, select **everything inside it**
   (`index.html`, the `js`, `css`, `docs`, `test` folders, etc.) and drag it onto the page. Click **Commit changes**.
   - `index.html` must be at the top level of the repository, not inside another folder.
4. **Turn on GitHub Pages:** in the repository go to **Settings → Pages**.
   Under **Build and deployment** set **Source: Deploy from a branch**, **Branch: `main`**, folder **`/ (root)`**, then **Save**.
5. Wait a minute or two, then refresh that page. It shows your site's address. Open it and bookmark it.

Your friend doesn't need to do any of this. They just open your site's address.

## Part 2: Each time you play

**Host (you):**
1. Open your site (on a computer if possible).
2. First time: under **Host a new game**, type your name, choose Commander or 60-card, click **Create & host**.
   Next time: under **Games you host**, click **Open & host** on your saved game.
3. Click the yellow **game code** at the top (on a phone: ☰ → Copy invite link). That copies an invite link. Send it to your friends (up to 3).
4. **Keep this tab open** while you play. If you close it, the game is saved. Reopen it from the lobby and your friend reconnects automatically.

**Friends:**
1. Open the invite link (or open the site, choose **Join a friend's game** and type the code). On a phone, turn it sideways.
2. If they get disconnected, they just reload the page. They keep their seat and nothing is lost.

**Everyone:**
1. Click **Load deck** (phone: ☰ → Load deck) and paste your decklist, or pick a deck you imported before (see below).
2. When everyone has a deck, someone clicks **Start game**. Decks are shuffled and everyone draws 7.
3. Each player chooses **Mulligan** (shuffle and draw a fresh 7, as often as you like) or **Keep**.
4. Once everyone has kept, a d20 pops up for each player. **Flick it** (a quick swipe) to roll. Highest goes first and turn order follows the rolls. Ties roll again.
5. Click **Help** in the game for controls.

## Getting your deck from Archidekt

1. Open your deck on Archidekt.
2. Use **Export** and pick the **text** format that includes set codes and collector numbers.
   Lines look like `1x Sol Ring (c21) 263 [Ramp]`.
3. Copy it, click **Load deck** in the game, paste, and click **Import → Use this deck**.

The set code + collector number means each card shows the exact art you chose. Cards in **Maybeboard** / **Sideboard**
categories are skipped, and cards in the **Commander** category start in the command zone.

After importing you'll see an **automation report**. It lists the cards whose text the helper recognised
(like *"Mirari's Wake: creatures you control get +1/+1"*) with a tick box each. Untick anything that's wrong, or press
**Edit** to fix it. Cards it couldn't work out are marked ⚠. You can set those up yourself in game
(right-click / tap the card → **Effects…**).

Decks you import are remembered in your browser, with their effects. Next time pick them from
**Decks you imported before**, where you can also **Rename** or **Remove** them.

Other formats work too: Moxfield, MTG Arena exports, or plain `1 Lightning Bolt` lines (those get Scryfall's default art).

## Updating the site later

When you change a file (or get an updated version), go to the repository on GitHub, **Add file → Upload files**,
drop the changed files in (same folder structure) and commit. GitHub Pages updates within a minute or two.
Your saved games are not affected. They live in your browser, not on GitHub.

If you know git: `git clone`, edit, `git push`. That's all there is to it. There's no build step.

## Troubleshooting

| Problem | Fix |
|---|---|
| Friend sees "The host isn't online right now" | You need the game open in a tab. Open the site → **Open & host**. |
| "This game seems to be open in another tab" | Close the other tab (or wait ~10 seconds). It retries by itself. |
| Can't connect at all | Some networks block direct browser connections. Try another network (e.g. home Wi-Fi instead of work/school). |
| My saved game is gone | Saved games belong to one browser + one site address. Clearing browsing data deletes them, so use **Backup** now and then. |
| Card shows as text instead of art | Scryfall didn't recognise that line. Check the spelling or set code. |
| A card's power/toughness total is wrong | Hover it (phone: tap it) to see where each bonus comes from, then fix its **Effects…** or the **Power/toughness bonus…** |
| The phone shows "Turn your phone sideways" | The phone layout is landscape-only. Turn off rotation lock. |
| I want the computer layout on a tablet (or vice versa) | Settings → Layout. |
| The page looks old after an update | Hard-refresh: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> (Mac: <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd>). |
