# Othoughts

Turn Obsidian's Canvas into a mind-mapping tool, in the spirit of iThoughts: collapse and move whole branches, lay the map out automatically in any direction, build it from the keyboard, restyle it, work on it as an outline, keep snapshots of how it evolves, and export it to the formats other mind-mapping apps read.

It works on ordinary `.canvas` files. Your cards, notes, images and links stay what they are; the plugin adds structure on top of the arrows you draw. There is no new file type and nothing to convert: open any canvas and start.

*Leelo en castellano: [README.es.md](README.es.md).*

Othoughts is an independent project. It is not affiliated with toketaWare or with iThoughts.

## Quick start

1. Open a canvas (or create one) and add a card. Type its text, then press `Escape`.
2. With the card selected, press `Tab`: a child appears to its right, ready to type in. `Escape` again, then `Enter` for a sibling, `Tab` for a grandchild. Arrow keys move between cards.
3. Click the gear at the bottom left of the canvas. Pick a map type (to the right, both sides, downward...), a style and a background, and press *Rearrange*.
4. Right-click any card for branch actions: collapse, color, arrange, focus. Right-click an arrow to change its type, line and color.
5. Open *Map history* from the gear and take a first snapshot. Turn on automatic snapshots in the settings if you want one a day without thinking about it.

## What it does

**Branches**
- Collapse and expand any branch, from a round button on the card, the context menu, or the outline. A collapsed card shows how many cards it hides.
- Drag a card and its whole branch moves with it.
- Drop a branch next to another card to re-attach it: level with the card makes it a child, just above or below makes it a sibling. A branch that crosses to the other side of the root flips over, arrows included.

**Auto layout**
- Arrange a branch or the whole map: to the right, to the left, downward, upward, or on both sides of the root.
- Three levels of automatic alignment per canvas: *full* (rearranges when you collapse or move a branch), *partial* (only when you collapse or expand) and *manual* (nothing moves by itself).
- Only maps are arranged. Loose cards, images and notes that are not connected to anything stay where you put them.

**Keyboard**
- `Tab` adds a child, `Enter` adds a sibling, and the new card is ready to type in.
- `Escape` leaves the card; `Alt+Enter` adds a new line inside it.
- Arrow keys jump from card to card along the map.
- These only act on cards that belong to a map. On a loose card, `Enter` and the arrow keys keep their usual Obsidian behavior.

**Look**
- Seven map styles per canvas (paper, classic, underline, chalkboard, notebook, night, or none) and seven backgrounds, chosen independently.
- A handle on each card scales the card and its text together.
- Optional larger text for the root and the main branches, an optional zoom level when opening a canvas, and a zoom indicator.

**Arrows that stay tidy**
- While you drag a card, its arrows switch sides on the fly: they leave from the faces that look at each other along the map, and a card placed right above or below another is joined from the top or the bottom. A small margin keeps them from flickering at the threshold.
- Smooth curves: arrows leave and arrive straight and cross over in a gentle diagonal, like iThoughts, instead of the tight hooks Obsidian draws between nearby cards. Both can be turned off.

**Outline and export**
- An outline panel shows the whole map as an indented list, including what is inside collapsed branches. Edit text, indent with `Tab`, add siblings with `Enter`.
- Export the map to **FreeMind (`.mm`)**, which iThoughts, XMind, Freeplane, MindManager, MindNode and SimpleMind open; to **OPML**; or to a **Markdown** outline. The export includes hidden branches, colors, which side each branch is on, links and cross-connections.

**Snapshots: the history of a map**
- Take a snapshot to keep the map exactly as it is now, with an optional name ("before the conference"). Turn on automatic snapshots to keep one a day (or a week) of every map you work on, only when it changed.
- The *Map history* panel lists them on a timeline, with how many cards each one had and what changed since the previous one (+ new, − removed, ~ rewritten).
- Open any snapshot to look at it: it opens read-only, so your history can't be changed by accident. Restore one to bring the map back to that version; the current version is saved first, so restoring can be undone.
- Snapshots are ordinary canvases in a folder of your vault (*Map snapshots* by default), so they travel with your vault and its backups. If you move or rename a canvas, its history follows it.

Everything is in the tools button at the bottom left of the canvas, in the context menu of cards and arrows, and in the command palette.

## Suggested hotkeys

The plugin sets no hotkeys, so that it never clashes with yours. These are the ones worth assigning in **Settings → Hotkeys** (search for "Othoughts"):

| Command | Suggestion |
| --- | --- |
| Collapse or expand branch | `Ctrl/Cmd+Alt+C` |
| Expand all branches | `Ctrl/Cmd+Alt+E` |
| Select the whole branch | `Ctrl/Cmd+Alt+A` |
| Focus the selected branch | `Ctrl/Cmd+Alt+F` |
| Open the map outline | `Ctrl/Cmd+Alt+O` |
| Arrange: to the right / left / downward / upward | `Ctrl/Cmd+Alt+Arrow keys` |
| Take a snapshot of the map | `Ctrl/Cmd+Alt+H` |

`Tab`, `Enter`, `Escape`, `Alt+Enter` and the arrow keys work inside a canvas without any setup.

## How the hierarchy works

The tree comes from your arrows. A card with no incoming arrow is a root. If a card receives several arrows, the first one is its parent and the others are cross-connections; the plugin marks those in the canvas file so the hierarchy never changes by itself. To choose a different parent, right-click the arrow and pick *Use this arrow as the branch*.

By default an arrow goes from parent to child. If an arrow has its head on the starting card only, the relationship is reversed (this can be turned off).

## Good to know

**What changes as soon as you install it.** Nothing in your files changes until you use a command, with two exceptions that you can turn off in the settings: arrows switch sides when you drag a card (*Adjust arrow sides*, which saves the new sides in the canvas file), and arrows are drawn with smooth curves (*Smooth curves*, display only). Both apply to every canvas, not only to mind maps.


- **Collapsed branches are stored inside the canvas file**, in the card that hides them. They are not visible to other apps, or to Obsidian without this plugin. **Before you uninstall the plugin, run *Expand all branches* in each canvas that has collapsed branches.** As a safety net, the last collapsed branches are also kept in the plugin's data (*Restore lost collapsed branches*).
- The plugin relies on Canvas internals that are not part of Obsidian's public API. When it collapses a branch it checks that the data was kept and reverts the change if it was not, but a future Obsidian update may require a plugin update. It was developed against Obsidian 1.13 to 1.15.
- The plugin adds a few keys to cards and arrows in the canvas file (`mmCollapsed`, `mmCollapsedData`, `mmEdgeStyle`, `mmFontScale`, `mmLink`). Other apps ignore them.
- No network access, no telemetry, and no files touched outside your vault. Exports are written next to the canvas and never overwrite a file the plugin did not create. Snapshots are written to their own folder; automatic snapshots are off until you turn them on. To keep snapshots out of search and the graph, add their folder under *Excluded files* in the *Files and links* settings.
- Smooth curves work by adjusting how Obsidian draws canvas arrows. If an Obsidian update changes that, the arrows simply go back to Obsidian's own curves.
- No default hotkeys. Assign your own in **Settings → Hotkeys** (search for "Othoughts").
- It uses no desktop-only APIs, so it should load on mobile, but it has only been tested on desktop. Showing an exported file in the system file manager is desktop only.

## Languages

English and Spanish. The plugin follows Obsidian's language, and you can pick one in its settings. To add a language, copy [`src/locales/es.js`](src/locales/es.js), translate the values and register it in `src/main.js`.

## Installing

From Obsidian: **Settings → Community plugins → Browse**, search for "Othoughts".

Manually: download `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/othoughts/`.

## Development

```bash
npm install
npm run build   # bundles src/ into main.js
npm test        # static checks, unit tests and a randomized stress test
```

The source is plain JavaScript in `src/`. The tests in `tests/` run against a stand-in for Obsidian's Canvas that reproduces its behavior, and the stress test applies thousands of random operations and checks after each one that no card, arrow or parent was lost.

## License

[MIT](LICENSE)
