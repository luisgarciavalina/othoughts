// Lists the texts in src/main.js that have no translation in a locale file (default: es).
//   node scripts/missing-translations.js [es]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const lang = process.argv[2] || 'es';
const src = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const table = require(path.join(root, 'src', 'locales', lang + '.js'));

const keys = new Set();
src.replace(/\b(?:t|L)\('((?:[^'\\]|\\.)*)'/g, (m, k) => {
	keys.add(k.replace(/\\(['"\\])/g, '$1'));
	return m;
});
const missing = Array.from(keys).filter((k) => !Object.prototype.hasOwnProperty.call(table, k));
const unused = Object.keys(table).filter((k) => !keys.has(k));
console.log(missing.length + ' missing in ' + lang + '.js');
for (const k of missing) console.log('  ' + JSON.stringify(k));
console.log(unused.length + ' unused');
for (const k of unused) console.log('  ' + JSON.stringify(k));
process.exit(missing.length || unused.length ? 1 : 0);
