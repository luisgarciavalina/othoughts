// The interface follows Obsidian's language: English by default, Spanish when Obsidian is in Spanish.
const { loadPlugin } = require('./helpers/load.js');

let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALLA') + '  ' + m); if (!c) fails++; };

function load(lang) {
	if (lang === null) delete process.env.MM_LANG; else process.env.MM_LANG = lang;
	return loadPlugin().__test;
}

{
	const en = load('en');
	ok(en.LOCALE === 'en', 'Obsidian in English: the plugin speaks English');
	ok(en.THEMES.papel.label === 'Paper' && en.THEMES.clasico.label === 'Classic', 'map styles: Paper, Classic');
	ok(en.BACKGROUNDS.tema.label === 'From the style' && en.DIRECTIONS.right === 'To the right', 'backgrounds and directions');
	ok(en.ALIGN_LABEL.full === 'Full' && en.DIR_SHORT['both-h'] === 'Both sides', 'alignment modes and map types');
	ok(en.t('Branch collapsed: {n} cards hidden.', { n: 5 }) === 'Branch collapsed: 5 cards hidden.', 'messages fill in their numbers');
	ok(en.t('Something not in any table') === 'Something not in any table', 'an unknown text is shown as written');
	ok(en.EXPORT_FORMATS.md.suffix === ' (outline)', 'the exported note is called "... (outline).md"');
}
{
	const es = load('es');
	ok(es.LOCALE === 'es', 'Obsidian en castellano: el plugin habla castellano');
	ok(es.THEMES.papel.label === 'Papel' && es.BACKGROUNDS.tema.label === 'Del estilo', 'estilos y fondos en castellano');
	ok(es.t('Branch collapsed: {n} cards hidden.', { n: 5 }) === 'Rama colapsada: 5 nodos ocultos.', 'los mensajes tambien');
	ok(es.EXPORT_FORMATS.md.suffix === ' (esquema)', 'la nota exportada se llama "... (esquema).md"');
}
{
	ok(load('es-ES').LOCALE === 'es', 'una variante regional (es-ES) usa el castellano');
	ok(load('fr').LOCALE === 'en', 'un idioma sin traduccion cae al ingles');
	ok(load('zh-TW').LOCALE === 'en', 'zh-TW tambien');
}
{
	// The language can be chosen in the settings, whatever Obsidian is set to.
	const T = load('en');
	ok(T.setLocale('es') === 'es' && T.THEMES.papel.label === 'Papel' && T.DIRECTIONS.right === 'Hacia la derecha',
		'Obsidian en ingles, plugin en castellano: las etiquetas cambian sin recargar');
	ok(T.EXPORT_FORMATS.md.suffix === ' (esquema)' && T.ALIGN_LABEL.full === 'Completa' && T.CANVAS_COLORS[0].label === 'Rojo', 'todas las tablas siguen al idioma elegido');
	ok(T.setLocale('en') === 'en' && T.THEMES.papel.label === 'Paper', 'y vuelve al ingles');
	ok(T.setLocale('auto') === 'en' && T.setLocale('xx') === 'en', '"auto" sigue a Obsidian; un codigo desconocido cae al ingles');
	ok(T.EXPORT_FORMATS.mm.ext === '.mm' && typeof T.EXPORT_FORMATS.mm.build === 'function' && T.ARROW_PRESETS.both.fromEnd === 'arrow',
		'lo que no es texto para el usuario no se toca');
}
(async () => {
	// Someone who used the plugin before it had languages (Spanish only) keeps it in Spanish.
	const Plugin = (process.env.MM_LANG = 'en', loadPlugin());
	const T = Plugin.__test;
	const viejo = new Plugin({}, {});
	viejo.loadData = async () => ({ settings: { fontBump: 4.5 } });
	await viejo.loadSettings();
	ok(viejo.settings.language === 'es' && T.THEMES.papel.label === 'Papel', 'quien ya usaba el plugin (solo en castellano) lo sigue viendo en castellano');
	const nuevo = new Plugin({}, {});
	nuevo.loadData = async () => null;
	await nuevo.loadSettings();
	ok(nuevo.settings.language === 'auto' && T.THEMES.papel.label === 'Paper', 'una instalacion nueva sigue el idioma de Obsidian');
	const elegido = new Plugin({}, {});
	elegido.loadData = async () => ({ settings: { language: 'en' } });
	await elegido.loadSettings();
	ok(elegido.settings.language === 'en', 'y lo que elegiste en las opciones se respeta');
})().then(() => {
{
	// English end to end: the tools panel
	require('./helpers/domlite.js');
	const en = load('en');
	const plugin = {
		settings: Object.assign({}, en.DEFAULT_SETTINGS),
		mapState: () => ({ dir: 'right', mode: 'manual', theme: 'ninguno', bg: 'tema' }),
	};
	const panel = global.document.createElement('div');
	en.paintToolPanel(plugin, {}, panel);
	const texts = [];
	const walk = (el) => { if (el.tag === 'button' || el.classList.contains('mm-sec-title')) texts.push(el.textContent); el.kids.forEach(walk); };
	panel.kids.forEach(walk);
	ok(['Style', 'Background', 'Text size', 'Map type', 'Automatic alignment', 'Actions', 'Export'].every((x) => texts.indexOf(x) > -1), 'the tools panel sections are in English');
	ok(['Paper', 'Cream', 'By level', 'Both sides', 'Collapse all', 'Copy outline', 'Map .mm'].every((x) => texts.indexOf(x) > -1), 'and so are its buttons');
}
console.log(fails ? '\nFALLAS: ' + fails : '\nTodo OK');
process.exit(fails ? 1 : 0);
});
