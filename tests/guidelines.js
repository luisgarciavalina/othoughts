// Static checks: Obsidian's plugin guidelines and submission requirements, plus translation hygiene.
// These are the things the community directory's automated review looks at.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const src = read('src/main.js');
const es = require('../src/locales/es.js');
const manifest = JSON.parse(read('manifest.json'));
const pkg = JSON.parse(read('package.json'));
const versions = JSON.parse(read('versions.json'));

let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALLA') + '  ' + m); if (!c) fails++; };

// source without comments, so that prose in comments does not trip the checks
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

console.log('\n--- plugin guidelines');
ok(!/innerHTML|outerHTML|insertAdjacentHTML/.test(code), 'no innerHTML / outerHTML / insertAdjacentHTML');
ok(!/\bactiveLeaf\b/.test(code), 'no workspace.activeLeaf');
ok(!/hotkeys\s*:/.test(code), 'no default hotkeys');
ok(!/console\.(log|debug|info)\(/.test(code), 'no console logging except errors');
ok(!/\.style\.[a-zA-Z]+\s*=[^=]/.test(code), 'no hardcoded style assignments (only CSS custom properties via setProperty)');
ok(!/createEl\('h[1-6]'/.test(code), 'settings headings use Setting.setHeading(), not HTML headings');
ok(!/\(\?<[=!]/.test(code), 'no lookbehind in regular expressions (breaks on older iOS)');
ok(!/window\.app\b|globalThis\.app\b/.test(code), 'no global app object (always this.app, or passed in as an argument)');
ok(!/require\('(fs|path|os|crypto|child_process|electron)'\)/.test(code), 'no Node.js or Electron modules (the plugin also runs on mobile)');
ok(!/\bvar\s+\w/.test(code), 'const and let, never var');
ok(!/detachLeavesOfType/.test(code), 'leaves are not detached on unload');
ok(!/vault\.adapter\./.test(code), 'Vault API, not the adapter');
const ids = [];
code.replace(/canvasCommand\('([^']+)'/g, (m, id) => { ids.push(id); return m; });
code.replace(/\bid: '([^']+)'/g, (m, id) => { ids.push(id); return m; });
ok(ids.length > 20 && !ids.some((id) => id.indexOf(manifest.id) > -1), 'command ids do not repeat the plugin id (' + ids.length + ' commands)');

console.log('\n--- manifest and versions');
ok(/^[a-z-]+$/.test(manifest.id) && !/obsidian/.test(manifest.id) && !/plugin$/.test(manifest.id), 'id: lowercase letters and hyphens, no "obsidian", does not end in "plugin"');
ok(!/obsidian|obsi-|-sidian|plugin/i.test(manifest.name) && /^[A-Za-z0-9 +()-]+$/.test(manifest.name), 'name: Basic Latin, no "Obsidian", no "Plugin"');
ok(manifest.description.length <= 250 && /\.$/.test(manifest.description) && !/^this is a plugin/i.test(manifest.description),
	'description: ' + manifest.description.length + ' characters (max 250), ends with a period');
ok(/^\d+\.\d+\.\d+$/.test(manifest.version) && manifest.version === pkg.version, 'version is x.y.z and matches package.json (' + manifest.version + ')');
ok(versions[manifest.version] === manifest.minAppVersion, 'versions.json maps ' + manifest.version + ' to minAppVersion ' + manifest.minAppVersion);
ok(manifest.isDesktopOnly === false && !('fundingUrl' in manifest), 'isDesktopOnly false (no Node APIs), no empty fundingUrl');
ok(fs.existsSync(path.join(root, 'LICENSE')) && fs.existsSync(path.join(root, 'README.md')), 'README.md and LICENSE at the root');
ok(typeof pkg.scripts.build === 'string', 'package.json has the "build" script the review runs');

console.log('\n--- translations');
const keys = new Set();
// t('...') translates on the spot; L('...') marks a label that a lazy table translates when read
src.replace(/\b(?:t|L)\('((?:[^'\\]|\\.)*)'/g, (m, k) => { keys.add(k.replace(/\\'/g, "'")); return m; });
const missing = Array.from(keys).filter((k) => !Object.prototype.hasOwnProperty.call(es, k));
const unused = Object.keys(es).filter((k) => !keys.has(k));
ok(keys.size > 250, keys.size + ' translatable texts in the source');
ok(missing.length === 0, 'every text has a Spanish translation' + (missing.length ? ': missing ' + JSON.stringify(missing.slice(0, 5)) : ''));
ok(unused.length === 0, 'no leftover translations' + (unused.length ? ': unused ' + JSON.stringify(unused.slice(0, 5)) : ''));
const holes = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
const mismatch = Object.keys(es).filter((k) => holes(k) !== holes(es[k]));
ok(mismatch.length === 0, 'placeholders match in both languages' + (mismatch.length ? ': ' + JSON.stringify(mismatch.slice(0, 3)) : ''));
const spanish = [];
code.replace(/'((?:[^'\\]|\\.)*)'/g, (m, lit) => {
	if (lit === 'Español') return m; // the name of the language, in its own language
	if (/[áéíóúñ¿¡]/i.test(lit) || /\b(nodo|nodos|rama|ramas|flecha|esquema|seleccion|hacia)\b/i.test(lit)) spanish.push(lit);
	return m;
});
ok(spanish.length === 0, 'no Spanish text left in the source' + (spanish.length ? ': ' + JSON.stringify(spanish.slice(0, 5)) : ''));

// Sentence case: flag texts with a capitalized word that is neither first nor a proper noun.
const PROPER = new Set(['Othoughts', 'Obsidian', 'Canvas', 'Mindmap', 'Tools', 'Markdown', 'FreeMind', 'OPML', 'iThoughts', 'XMind', 'Freeplane',
	'MindManager', 'MindNode', 'SimpleMind', 'OmniOutliner', 'Logseq', 'Workflowy', 'Word', 'Alt', 'Shift', 'Ctrl', 'Cmd', 'Tab',
	'Enter', 'A', 'Z', 'Click', 'Desktop', 'Change', 'Pick', 'Kept', 'Only', 'Stored', 'If', 'It', 'You', 'Exporting', 'The']);
const titled = Array.from(keys).filter((k) => {
	const sentences = k.split(/[.:;!?]\s+|\(|"/);
	return sentences.some((s) => s.trim().split(/\s+/).slice(1).some((w) => /^[A-Z][a-z]+$/.test(w) && !PROPER.has(w)));
});
ok(titled.length === 0, 'UI text is in sentence case' + (titled.length ? ': ' + JSON.stringify(titled.slice(0, 6)) : ''));

console.log(fails ? '\nFALLAS: ' + fails : '\nTodo OK');
process.exit(fails ? 1 : 0);
