// El esquema no pisa el formato de los nodos, y la exportacion (FreeMind, OPML, Markdown).
const k = require('./helpers/kit.js');
const { ok, T } = k;
const { El } = require('./helpers/domlite.js');
const fs = require('fs');
const path = require('path');

// El de domlite no tiene foco: se lo agregamos, como en el navegador
El.prototype.focus = function () {
	const prev = global.document.activeElement;
	if (prev && prev !== this && typeof prev.fire === 'function') prev.fire('blur');
	global.document.activeElement = this;
	this.fire('focus');
};
El.prototype.blur = function () {
	if (global.document.activeElement === this) global.document.activeElement = null;
	this.fire('blur');
};

function esquema(plugin) {
	const v = new T.OutlineView({}, plugin);
	v.contentEl = new El('div');
	v.registerInterval = () => {};
	v.onOpen();
	return v;
}

const RICO = '## Título con **negrita**, [[Nota larga|un enlace]] y auto-organización';

if (!k.viejo) {
	console.log('\n--- texto limpio para mostrar');
	ok(T.plainText(RICO) === 'Título con negrita, un enlace y auto-organización', 'saca las marcas y deja los guiones de las palabras');
	ok(T.plainText('- [ver](https://x.org) `codigo` snake_case_word') === 'ver codigo snake_case_word', 'listas, links y codigo; no toca los guiones bajos de adentro');
	ok(T.plainText('*cursiva* y _otra_ y 3 * 4') === 'cursiva y otra y 3 * 4', 'cursivas si, asteriscos sueltos no');
}

console.log('\n--- pasar por el esquema no cambia los nodos');
{
	const d = k.mapaBase();
	d.nodes.find((n) => n.id === 'A').text = RICO;
	d.nodes.find((n) => n.id === 'B').text = 'Primera línea\n\n- punto uno\n- punto dos';
	d.nodes.find((n) => n.id === 'C').text = '> cita con [[enlace]]';
	const { canvas, plugin } = k.setup(d);
	const antes = k.foto(canvas, plugin).texto;
	const v = esquema(plugin);
	const fila = v.rows.get('A');
	ok(!!fila && fila.text.textContent.indexOf('#') === -1 && fila.text.textContent.indexOf('[[') === -1, 'en el esquema el nodo se ve limpio, sin marcas');
	// recorro TODAS las filas con el foco, como al navegar con las flechas
	v.rows.forEach((row) => { row.text.focus(); });
	if (global.document.activeElement) global.document.activeElement.blur();
	const despues = k.foto(canvas, plugin).texto;
	ok(JSON.stringify(antes) === JSON.stringify(despues), 'recorrer todas las filas con el foco no cambia ni una letra de ningun nodo');
	ok(despues.A === RICO, 'el Markdown del nodo sigue intacto: ' + JSON.stringify(despues.A).slice(0, 40) + '...');

	if (!k.viejo) {
		const f2 = v.rows.get('A');
		f2.text.focus();
		ok(f2.text.textContent === RICO, 'al entrar a editar aparece el texto real, con su Markdown');
		f2.text.textContent = '## Título nuevo con **negrita**';
		f2.text.blur();
		ok(k.foto(canvas, plugin).texto.A === '## Título nuevo con **negrita**', 'si lo cambias de verdad, se guarda lo que escribiste');
		ok(canvas.looseEdges().length === 0, 'y el mapa sigue entero');
	}
}

if (k.viejo) k.fin();

console.log('\n--- exportar: el mapa completo');
function mapaRico() {
	const d = k.mapaBase();
	const set = (id, o) => Object.assign(d.nodes.find((n) => n.id === id), o);
	set('R', { text: 'Ideas & bocetos <nuevas> "ya"' });
	set('A', { text: RICO, color: '4' });
	set('A1', { text: 'Línea uno\nLínea dos', x: -400 });           // a la izquierda de... (es nieto: no lleva lado)
	set('B', { text: 'Rama izquierda 🙂', x: -400, color: '#aabbcc' }); // a la izquierda de la raiz
	set('C', { type: 'link', url: 'https://example.org/a?b=1&c=2', text: undefined });
	d.nodes.push({ id: 'NOTA', type: 'file', file: 'Notas/Mi nota.md', x: 320, y: 600, width: 300, height: 200 });
	d.edges.push(k.flecha('R', 'NOTA'));
	d.edges.push(k.flecha('A2', 'B1', { id: 'cruzada', color: '1' }));
	d.edges.find((e) => e.id === 'e-R-A').color = '2';
	return d;
}

{
	const { canvas, plugin } = k.setup(mapaRico(), { path: 'Proyectos/Ideas - Café.canvas' });
	plugin.toggleCollapse(canvas.nodes.get('A'));               // una rama colapsada tambien se exporta
	k.runFrames(); k.dropTimers(); canvas.frame();
	const info = plugin.exportInfo(canvas);
	const m = info.model;
	ok(m.count === 10 && m.title === 'Ideas - Café', 'el modelo trae los 10 nodos (tambien los ocultos y los sueltos) y el nombre del canvas');

	// ---------- FreeMind
	const mm = T.toFreeMind(m);
	const tmp = path.join(__dirname, '.salida');
	fs.mkdirSync(tmp, { recursive: true });
	fs.writeFileSync(path.join(tmp, 'mapa.mm'), mm);
	ok(/^<map version="1\.0\.1">/.test(mm) && /<\/map>\s*$/.test(mm), '.mm: es un mapa FreeMind');
	ok(!/[^\x00-\x7f]/.test(mm), '.mm: es ASCII puro (acentos, eñes y emojis van como &#...;), se lee igual en cualquier programa');
	ok(mm.indexOf('TEXT="Ideas &amp; bocetos &lt;nuevas&gt; &quot;ya&quot;"') > -1, '.mm: los caracteres especiales van escapados');
	ok(mm.indexOf('L&#237;nea uno&#10;L&#237;nea dos') > -1, '.mm: los saltos de linea se conservan');
	ok(mm.indexOf('&#128578;') > -1, '.mm: los emojis tambien');
	ok(/ID="ID_A"[^>]*POSITION="right"[^>]*FOLDED="true"[^>]*BACKGROUND_COLOR="#44cf6e"/.test(mm), '.mm: la rama colapsada va plegada, a la derecha y con su color');
	ok(/ID="ID_B"[^>]*POSITION="left"[^>]*BACKGROUND_COLOR="#aabbcc"/.test(mm), '.mm: la rama de la izquierda va a la izquierda');
	ok(!/ID="ID_A1"[^>]*POSITION/.test(mm), '.mm: los nietos no llevan lado (lo heredan)');
	ok(mm.indexOf('<edge COLOR="#e9973f"/>') > -1, '.mm: el color de la flecha viaja');
	ok(/ID="ID_A2"[^>]*>\s*<arrowlink DESTINATION="ID_B1" COLOR="#fb464c"/.test(mm), '.mm: la conexion cruzada va como arrowlink');
	ok(/ID="ID_C"[^>]*LINK="https:\/\/example.org\/a\?b=1&amp;c=2"/.test(mm), '.mm: el link conserva su direccion');
	ok(/ID="ID_NOTA" TEXT="Mi nota"[^>]*LINK="obsidian:\/\/open\?vault=Boveda&amp;file=Notas%2FMi%20nota.md"/.test(mm), '.mm: la nota va con su nombre y un enlace para abrirla en Obsidian');
	ok(/<!--[^\n]*-->\n<node ID="ID_R" TEXT="Ideas/.test(mm), '.mm: la raiz del mapa es la raiz del archivo');
	ok(/<node ID="ID_sueltos" TEXT="Sueltos" POSITION="right" FOLDED="true">\s*<node ID="ID_S"[^>]*\/>\s*<node ID="ID_IMG"/.test(mm), '.mm: lo suelto no se pierde: va en una rama aparte, plegada');
	ok((mm.match(/<node /g) || []).length === 11, '.mm: los 10 nodos + la rama de sueltos');

	// ---------- OPML
	const opml = T.toOpml(m);
	fs.writeFileSync(path.join(tmp, 'mapa.opml'), opml);
	ok(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<opml version="2.0">/.test(opml), 'OPML: encabezado estandar');
	ok(opml.indexOf('<title>Ideas - Café</title>') > -1, 'OPML: lleva el titulo');
	ok((opml.match(/<outline /g) || []).length === 10, 'OPML: los 10 nodos');
	ok(opml.indexOf('type="link" url="https://example.org/a?b=1&amp;c=2"') > -1, 'OPML: los links van como link');
	ok(opml.indexOf('_note="Nota de Obsidian: Notas/Mi nota.md"') > -1, 'OPML: las notas dicen de donde vienen');

	// ---------- Markdown
	const md = T.toMarkdown(m, true);
	fs.writeFileSync(path.join(tmp, 'mapa.md'), md);
	const lineas = md.split('\n');
	ok(lineas.indexOf('- Ideas & bocetos <nuevas> "ya"') > -1, 'Markdown: la raiz es el primer nivel');
	ok(lineas.indexOf('\t- Título con **negrita**, [[Nota larga|un enlace]] y auto-organización') > -1, 'Markdown: los hijos van con sangria, sin el ## que romperia la lista, con su formato');
	ok(lineas.indexOf('\t\t- Línea uno') > -1 && lineas.indexOf('\t\t  Línea dos') > -1, 'Markdown: un nodo de varias lineas sigue siendo un solo item');
	ok(lineas.indexOf('\t- [[Notas/Mi nota]]') > -1, 'Markdown: las notas van como enlace');
	ok(lineas.indexOf('\t- <https://example.org/a?b=1&c=2>') > -1, 'Markdown: los links van como link');
	ok(lineas.filter((l) => /^\t*- /.test(l)).length === 10, 'Markdown: 10 items');
	ok(md.indexOf(T.EXPORT_MARK) === -1 && T.toMarkdown(m, false).indexOf(T.EXPORT_MARK) > -1, 'Markdown: el archivo lleva la marca; lo copiado al portapapeles no');
}

console.log('\n--- exportar: un solo mapa, sin nodos sueltos');
{
	const d = k.mapaBase();
	d.nodes = d.nodes.filter((n) => n.id !== 'S' && n.id !== 'IMG');
	const { canvas, plugin } = k.setup(d);
	const mm = T.toFreeMind(plugin.exportInfo(canvas).model);
	ok(/<map version="1.0.1">\n<!--[^\n]*-->\n<node ID="ID_R" TEXT="R">/.test(mm), 'la raiz del mapa es la raiz del archivo, sin nodo de mas');
	ok(/ID="ID_A"[^>]*POSITION="right"/.test(mm), 'y las ramas llevan su lado');
}

console.log('\n--- exportar: varios mapas en un canvas');
{
	const d = k.mapaBase();
	d.nodes.push(k.nodo('R2', 0, 900), k.nodo('X', 320, 900));
	d.edges.push(k.flecha('R2', 'X'));
	const { canvas, plugin } = k.setup(d, { path: 'Dos mapas.canvas' });
	const mm = T.toFreeMind(plugin.exportInfo(canvas).model);
	ok(mm.indexOf('<node ID="ID_mapa" TEXT="Dos mapas">') > -1, 'con varios mapas, cuelgan todos de un nodo con el nombre del canvas');
	ok(/<node ID="ID_R" TEXT="R">/.test(mm) && /<node ID="ID_R2" TEXT="R2">/.test(mm), 'cada mapa es una rama');
}

console.log('\n--- exportar: los archivos');
(async () => {
	const { canvas, plugin, adapter, app } = k.setup(mapaRico(), { path: 'Proyectos/Ideas - Café.canvas' });
	const a = await plugin.exportMap('mm');
	ok(a === 'Proyectos/Ideas - Café.mm' && adapter.files.has(a), 'el .mm queda al lado del canvas, con su mismo nombre');
	ok(app.shown.length === 1 && app.shown[0] === a, 'y se muestra en el explorador de archivos');
	const b = await plugin.exportMap('opml');
	ok(b === 'Proyectos/Ideas - Café.opml', 'el .opml tambien');
	const c = await plugin.exportMap('md');
	ok(c === 'Proyectos/Ideas - Café (esquema).md' && app.shown.length === 2, 'el esquema en Markdown queda como nota, sin abrir el explorador');

	// volver a exportar actualiza el mismo archivo
	plugin.setNodeText(canvas, 'R', 'Raiz cambiada');
	const a2 = await plugin.exportMap('mm');
	ok(a2 === a && adapter.files.get(a).indexOf('Raiz cambiada') > -1 && adapter.files.size === 3, 'volver a exportar actualiza el mismo archivo');

	// una exportacion hecha cuando el plugin tenia otro nombre tambien es nuestra
	adapter.files.set('Proyectos/Ideas - Café.opml', '<opml><!-- Exportado por Canvas Mindmap Tools (Obsidian). --></opml>');
	const b2 = await plugin.exportMap('opml');
	ok(b2 === 'Proyectos/Ideas - Café.opml' && adapter.files.get(b2).indexOf(T.EXPORT_MARK) > -1 && adapter.files.size === 3,
		'una exportacion hecha con el nombre anterior del plugin se actualiza, no se duplica');

	// pero nunca pisa un archivo tuyo
	adapter.files.set('Proyectos/Ideas - Café (esquema).md', '# Mis apuntes\n\nEsto lo escribi yo.');
	const c2 = await plugin.exportMap('md');
	ok(c2 === 'Proyectos/Ideas - Café (esquema) 2.md', 'si ya hay una nota tuya con ese nombre, exporta a "... 2.md"');
	ok(adapter.files.get('Proyectos/Ideas - Café (esquema).md') === '# Mis apuntes\n\nEsto lo escribi yo.', 'y tu nota queda intacta');

	await plugin.copyOutline();
	ok(typeof global.navigator.clipboard.text === 'string' && global.navigator.clipboard.text.split('\n').indexOf('- Raiz cambiada') > -1, 'copiar el esquema lo deja en el portapapeles');

	plugin.settings.revealExport = false;
	await plugin.exportMap('opml');
	ok(app.shown.length === 4, 'con la opcion apagada no abre el explorador');

	const vacio = k.setup({ nodes: [], edges: [] });
	ok((await vacio.plugin.exportMap('mm')) === null && vacio.adapter.files.size === 0, 'un canvas vacio no exporta nada');

	console.log('\n--- el panel y el esquema tienen los botones');
	const panel = global.document.createElement('div');
	T.paintToolPanel(plugin, canvas, panel);
	const textos = [];
	const ver = (el) => { if (el.tag === 'button') textos.push(el.textContent); el.kids.forEach(ver); };
	panel.kids.forEach(ver);
	ok(['Mapa .mm', 'OPML', 'Markdown', 'Copiar esquema'].every((t) => textos.indexOf(t) > -1), 'la ruedita tiene la seccion Exportar');
	const v = esquema(plugin);
	const botones = [];
	const ver2 = (el) => { if (el.tag === 'button') botones.push(el); el.kids.forEach(ver2); };
	v.headerEl.kids.forEach(ver2);
	ok(botones.map((b) => b.textContent).join('|') === 'Copiar|Markdown|OPML|Mapa .mm', 'el esquema tiene sus botones de exportar');
	const antes = adapter.files.size;
	botones[1].fire('click');
	await new Promise((r) => setImmediate(r));
	await new Promise((r) => setImmediate(r));
	ok(adapter.files.size >= antes, 'y funcionan');
	k.fin();
})();
