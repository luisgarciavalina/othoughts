// Copies the built plugin into your own vault, so you can try it before releasing.
// The destination is read from local.json (not committed):
//   { "pluginDir": "C:/path/to/vault/.obsidian/plugins/othoughts" }
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = path.join(root, 'local.json');
if (!fs.existsSync(config)) {
	console.error('local.json not found. Create it with: { "pluginDir": "<vault>/.obsidian/plugins/othoughts" }');
	process.exit(1);
}
const { pluginDir } = JSON.parse(fs.readFileSync(config, 'utf8'));
if (!pluginDir || !fs.existsSync(pluginDir)) {
	console.error('pluginDir does not exist: ' + pluginDir);
	process.exit(1);
}
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	fs.copyFileSync(path.join(root, file), path.join(pluginDir, file));
	console.log('copied ' + file);
}
console.log('Done. Reload the plugin in Obsidian (turn it off and on again).');
