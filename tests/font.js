// Letra de los nodos: los px de mas del ajuste, solos y combinados con el cuadradito
const Plugin = require('./helpers/load.js').loadPlugin();
const { applyFontScale, nodeFontPx, DEFAULT_SETTINGS } = Plugin.__test;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALLA') + '  ' + m); if (!c) fails++; };

// un elemento de mentira: clases y variables CSS
function elemento() {
	const vars = {};
	const clases = new Set();
	return {
		vars, clases,
		classList: { add: (c) => clases.add(c), remove: (c) => clases.delete(c), contains: (c) => clases.has(c) },
		style: {
			setProperty: (k, v) => { vars[k] = v; },
			removeProperty: (k) => { delete vars[k]; },
		},
	};
}

{
	ok(DEFAULT_SETTINGS.fontBump === 0 && DEFAULT_SETTINGS.openZoom === 0, 'por defecto el plugin no cambia ni la letra ni el zoom de Obsidian');
}
{   // nodo normal con el ajuste puesto
	const el = elemento();
	el.querySelectorAll = () => [];
	applyFontScale(el, 0, 15, 1.5);
	ok(el.vars['--font-text-size'] === '16.5px', 'con el tema en 15 px, un nodo normal queda en 16,5');
	ok(!el.clases.has('mm-scaled'), 'sin que cuente como estirado con el cuadradito');
}
{   // el cuadradito sigue agrandando sobre ese tamano
	const el = elemento();
	el.querySelectorAll = () => [];
	applyFontScale(el, 2, 15, 1.5);
	ok(el.vars['--mm-font-px'] === '33.0px' && el.vars['--font-text-size'] === '33.0px', 'un nodo estirado al doble parte del tamano nuevo');
	ok(el.clases.has('mm-scaled'), 'y queda marcado como estirado');
}
{   // volver a 0 deja todo como Obsidian
	const el = elemento();
	el.querySelectorAll = () => [];
	applyFontScale(el, 0, 15, 1.5);
	applyFontScale(el, 0, 15, 0);
	ok(!('--font-text-size' in el.vars), 'con el ajuste en 0 no queda nada puesto');
	const el2 = elemento();
	el2.querySelectorAll = () => [];
	applyFontScale(el2, 2, 15, 0);
	applyFontScale(el2, 0, 15, 0);
	ok(!el2.clases.has('mm-scaled') && !('--mm-font-px' in el2.vars), 'y al desestirar un nodo tampoco');
}
{   // nunca una letra ilegible
	ok(nodeFontPx(15, 1, 1.5) === 16.5, 'la cuenta es tema + px de mas');
	ok(nodeFontPx(15, 0.5, 1.5) === 8.25, 'achicar con el cuadradito sigue andando');
	ok(nodeFontPx(2, 0.1, -20) === 6, 'y nunca baja de 6 px');
}
{   // el ajuste aparece en las opciones, de 0 a 6 y de medio en medio
	const { Setting } = require('./helpers/obsidian-stub.js');
	Setting.sliders = [];
	const app = { workspace: { on: () => {}, getLeavesOfType: () => [] }, vault: { on: () => {} } };
	const plugin = new Plugin(app, {});
	plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
	plugin.saveSettings = async () => {};
	plugin.backups = [];
	const tab = new Plugin.__test.MindmapSettingTab(app, plugin);
	const hechos = [];
	const crear = (t) => { const e = { createEl: crear, empty: () => {}, appendChild: () => {}, kids: [] }; hechos.push(t); return e; };
	tab.containerEl = { empty: () => {}, createEl: (t) => crear(t), appendChild: () => {} };
	tab.display();
	const sl = Setting.sliders.find((c) => c.limites && c.limites[0] === 0 && c.limites[1] === 6);
	ok(!!sl && sl.limites[2] === 0.5, 'hay un control de 0 a 6 px, de medio en medio');
	ok(sl && sl.valor === 0, 'y arranca en 0');
}
console.log(fails ? '\nFALLAS: ' + fails : '\nTodo OK');
process.exit(fails ? 1 : 0);
