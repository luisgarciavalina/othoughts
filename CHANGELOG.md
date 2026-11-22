# Changelog

## 5.2.0

First public release. The plugin was called Canvas Mindmap Tools while it was private; canvases and settings made with it keep working.

- **Snapshots.** Keep the map as it is at a given moment, by hand or automatically (once a day or once a week, only when it changed). A history panel shows them on a timeline with what changed between versions; snapshots open read-only and can be restored, and restoring saves the current version first.
- **Arrows that stay tidy.** While you drag a card, its arrows switch to the sides that face each other, live; a card right above or below another is joined from the top or the bottom. Optional smooth curves replace the tight hooks Obsidian draws between nearby cards.
- Read-only canvases (snapshots, or canvases you lock) are never changed by the plugin.
- English and Spanish interface. It follows Obsidian's language, or the one you pick in the settings.
- Keyboard creation and navigation only act on cards that belong to a map; loose cards keep Obsidian's behavior.
- Dropping a card next to another one only attaches it when one of the two already belongs to a map.
- A fresh install no longer changes the text size or the opening zoom of your canvases.
- No default hotkeys: assign your own in Settings → Hotkeys.
- Exports are written through the Vault API.
- Unloading the plugin removes everything it added to the canvas.

## 5.0.0

- Fixed arrows left behind after re-attaching a branch, cards lost while the map was being rearranged, and parents changing when a card had more than one incoming arrow.
- Export to FreeMind (.mm), OPML and Markdown.
- The outline no longer rewrites a card's Markdown when you only pass through it.
