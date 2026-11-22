// Runs every test file, each in its own process, and then checks that the built main.js loads.
//   npm test                 everything (the stress test at its normal size)
//   ESCENARIOS=1200 npm test  a longer stress run
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const tests = ['guidelines', 'i18n', 'font', 'frames', 'panel', 'connections', 'outline-export', 'behavior', 'edges', 'snapshots', 'stress'];
let failed = 0;

for (const name of tests) {
	const file = path.join(__dirname, name + '.js');
	const run = spawnSync(process.execPath, [file], { encoding: 'utf8', env: process.env });
	const out = (run.stdout || '') + (run.stderr || '');
	const passed = (out.match(/^ {2}OK /gm) || []).length;
	if (run.status === 0) {
		console.log('ok    ' + name.padEnd(16) + (passed ? passed + ' checks' : (out.match(/\d+ operaciones/) || [''])[0]));
	} else {
		failed++;
		console.log('FAIL  ' + name);
		console.log(out.split('\n').filter((l) => /FALLA|Error|^\s+at /.test(l)).slice(0, 25).join('\n'));
	}
}

// The release asset: built by "npm run build". It must load and export the plugin class.
const built = path.join(__dirname, '..', 'main.js');
if (fs.existsSync(built)) {
	const Module = require('module');
	const stub = path.join(__dirname, 'helpers', 'obsidian-stub.js');
	const resolve = Module._resolveFilename;
	Module._resolveFilename = function (request, ...rest) {
		return request === 'obsidian' ? stub : resolve.call(this, request, ...rest);
	};
	try {
		require('./helpers/domlite.js');
		const Plugin = require(built);
		const good = typeof Plugin === 'function' && typeof Plugin.prototype.onload === 'function';
		console.log((good ? 'ok    ' : 'FAIL  ') + 'built main.js'.padEnd(16) + 'loads and exports the plugin');
		if (!good) failed++;
	} catch (e) {
		failed++;
		console.log('FAIL  built main.js: ' + e.message);
	}
} else {
	console.log('skip  built main.js (run "npm run build" first)');
}

console.log(failed ? '\n' + failed + ' test file(s) failed' : '\nAll tests passed');
process.exit(failed ? 1 : 0);
