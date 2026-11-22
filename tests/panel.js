// Panel de herramientas, letra por nivel y estilo Papel
require('./helpers/domlite.js');
const Plugin = require('./helpers/load.js').loadPlugin();
const { paintToolPanel, THEMES, DIRECTIONS, BACKGROUNDS, ALIGN_MODES, FONT_LEVEL, nodeFontPx, applyFontScale, DEFAULT_SETTINGS } = Plugin.__test;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALLA') + '  ' + m); if (!c) fails++; };

function plugin() {
	const p = Object.create(Plugin.prototype);
	p.app = {};
	p.settings = Object.assign({}, DEFAULT_SETTINGS, { fontBump: 1.5 });
	p.maps = {};
	p.saveSettings = () => {};
	p.hechos = [];
	p.estado = { dir: 'right', mode: 'manual', theme: 'ninguno', bg: 'tema' };
	p.mapState = () => p.estado;
	p.setTheme = (k) => { p.estado.theme = k; p.hechos.push('tema:' + k); };
	p.setBackground = (k) => { p.estado.bg = k; p.hechos.push('fondo:' + k); };
	p.setFontBump = (v) => { p.settings.fontBump = Math.max(0, Math.min(6, v)); p.hechos.push('letra:' + p.settings.fontBump); return p.settings.fontBump; };
	p.setFontLevels = (v) => { p.settings.fontLevels = v; p.hechos.push('nivel:' + v); };
	p.setMapDirection = (d) => { p.estado.dir = d; p.hechos.push('dir:' + d); };
	p.setAlignMode = (m) => { p.estado.mode = m; p.hechos.push('alin:' + m); };
	p.layout = (d, todo) => p.hechos.push('reorganizar:' + d + ':' + todo);
	p.collapseAll = () => p.hechos.push('colapsar');
	p.expandAll = () => p.hechos.push('expandir');
	p.openOutline = () => p.hechos.push('esquema');
	return p;
}
const textos = (panel) => {
	const out = [];
	const ver = (el) => { if (el.tag === 'button') out.push(el.textContent); el.kids.forEach(ver); };
	panel.kids.forEach(ver);
	return out;
};
const boton = (panel, texto) => {
	let hit = null;
	const ver = (el) => { if (el.tag === 'button' && el.textContent === texto) hit = hit || el; el.kids.forEach(ver); };
	panel.kids.forEach(ver);
	return hit;
};

{   // el panel trae todo lo que pidio: estilo, letra, tipo de mapa, alineacion
	const p = plugin();
	const panel = global.document.createElement('div');
	paintToolPanel(p, {}, panel);
	const t = textos(panel);
	ok(Object.keys(THEMES).every((k) => t.indexOf(THEMES[k].label) > -1), 'estan los ' + Object.keys(THEMES).length + ' estilos, Papel incluido');
	ok(t.indexOf('Dos lados') > -1 && t.indexOf('Derecha') > -1, 'estan los tipos de mapa');
	ok(Object.keys(BACKGROUNDS).every((k) => t.indexOf(BACKGROUNDS[k].label) > -1), 'y los ' + Object.keys(BACKGROUNDS).length + ' fondos, en su propia seccion');
	const titulos = [];
	const verSec = (el) => { if (el.classList.contains('mm-sec-title')) titulos.push(el.textContent); el.kids.forEach(verSec); };
	panel.kids.forEach(verSec);
	ok(titulos.indexOf('Estilo') > -1 && titulos.indexOf('Fondo') > -1, 'estilo y fondo son dos secciones separadas');
    ok(ALIGN_MODES.every((m) => t.indexOf({ full: 'Completa', partial: 'Parcial', manual: 'Manual' }[m]) > -1), 'estan los modos de alineacion');
	ok(t.indexOf('Por nivel') > -1 && t.indexOf('+') > -1, 'estan los controles de letra');
	ok(t.indexOf('Colapsar todo') > -1 && t.indexOf('Esquema') > -1, 'y las acciones');
}
{   // cada boton hace lo suyo y el panel queda al dia
	const p = plugin();
	const panel = global.document.createElement('div');
	paintToolPanel(p, {}, panel);
	boton(panel, 'Papel').fire('click');
	ok(p.hechos.indexOf('tema:papel') > -1, 'un clic en Papel pone ese estilo');
	ok(boton(panel, 'Papel').classList.contains('is-active'), 'y queda marcado como el elegido');
	boton(panel, '+').fire('click');
	ok(p.settings.fontBump === 2, 'el mas sube la letra medio punto');
	boton(panel, '−').fire('click');
	ok(p.settings.fontBump === 1.5, 'y el menos la baja');
	boton(panel, 'Por nivel').fire('click');
	ok(p.settings.fontLevels === true, 'por nivel se prende');
	boton(panel, 'Abajo').fire('click');
	ok(p.hechos.indexOf('dir:down') > -1, 'un tipo de mapa reorganiza hacia ese lado');
	boton(panel, 'Completa').fire('click');
	ok(p.estado.mode === 'full', 'y se puede cambiar la alineacion');
	boton(panel, 'Esquema').fire('click');
	ok(p.hechos.indexOf('esquema') > -1, 'las acciones tambien andan');
}
{   // el fondo se elige aparte del estilo
	const p = plugin();
	const panel = global.document.createElement('div');
	paintToolPanel(p, {}, panel);
	boton(panel, 'Clásico').fire('click');
	boton(panel, 'Crema').fire('click');
	ok(p.estado.theme === 'clasico' && p.estado.bg === 'crema', 'podes tener el estilo Clásico con el fondo Crema');
	const fondos = [];
	const verF = (el) => { if (el.tag === 'button' && el.classList.contains('is-active')) fondos.push(el.textContent); el.kids.forEach(verF); };
	panel.kids.forEach(verF);
	ok(fondos.indexOf('Clásico') > -1 && fondos.indexOf('Crema') > -1, 'y los dos quedan marcados');
	boton(panel, 'Del estilo').fire('click');
	ok(p.estado.bg === 'tema', 'y se puede volver al fondo que trae el estilo');
}
{   // la letra no baja de 0 ni sube de 6
	const p = plugin();
	p.settings.fontBump = 0;
	const panel = global.document.createElement('div');
	paintToolPanel(p, {}, panel);
	boton(panel, '−').fire('click');
	ok(p.settings.fontBump === 0, 'con la letra en 0, el menos no la deja negativa');
}
{   // letra por nivel
	ok(FONT_LEVEL['0'] > FONT_LEVEL['1'] && FONT_LEVEL['1'] > FONT_LEVEL['2'], 'la raiz va mas grande que las ramas, y las ramas que las hojas');
	ok(Math.abs(nodeFontPx(15, FONT_LEVEL['0'], 1.5) - 22.275) < 0.01, 'la raiz con el ajuste puesto queda en 22,3 px');
	ok(nodeFontPx(15, FONT_LEVEL['2'], 1.5) === 16.5, 'y las hojas quedan en 16,5');
}
{   // el tamano se aplica como font-size, que es lo que Obsidian hereda
	const el = global.document.createElement('div');
	el.querySelectorAll = () => [];
	applyFontScale(el, 1, 15, 1.5);
	ok(el.style.vars['--mm-font-px'] === '16.5px' && el.classList.contains('mm-font'), 'el nodo recibe los px y la marca que usa el CSS');
	applyFontScale(el, 1, 15, 0);
	ok(!el.classList.contains('mm-font') && !('--mm-font-px' in el.style.vars), 'y al apagarlo se limpia');
}
console.log(fails ? '\nFALLAS: ' + fails : '\nTodo OK');
process.exit(fails ? 1 : 0);
