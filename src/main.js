'use strict';

/*
 * Othoughts
 * Herramientas de mapa mental para el Canvas de Obsidian.
 *  - Colapsar / expandir ramas y subramas
 *  - Arrastrar un nodo mueve toda su rama
 *  - Auto-organizacion direccional (derecha, izquierda, abajo, arriba, dos lados)
 *  - Estilos de flecha (puntas y trazo)
 *
 * Escrito en JS plano (sin build) para poder instalarlo/editarlo directamente.
 */

const obsidian = require('obsidian');
const { Plugin, PluginSettingTab, Setting, Notice, Menu, ItemView, Modal, TFile, TFolder, normalizePath } = obsidian;

/* ------------------------------------------------------------------ */
/* Idiomas                                                             */
/* ------------------------------------------------------------------ */

// El codigo lleva los textos en ingles; cada archivo de src/locales los traduce.
// Para sumar un idioma: copiar es.js, traducir los valores y agregarlo aca.
const LOCALES = { es: require('./locales/es.js') };

/** Idioma de la interfaz de Obsidian ('en' si no hay traduccion para ese idioma). */
function detectLocale() {
	let lang = '';
	// getLanguage es la API publica para esto (Obsidian 1.8 en adelante)
	try { if (typeof obsidian.getLanguage === 'function') lang = obsidian.getLanguage(); } catch (e) { /* noop */ }
	const code = String(lang || 'en').toLowerCase().split('-')[0];
	return LOCALES[code] ? code : 'en';
}

let LOCALE = detectLocale();

/** Fija el idioma: 'auto' sigue a Obsidian; si no, el codigo de un idioma con traduccion. */
function setLocale(code) {
	if (!code || code === 'auto') LOCALE = detectLocale();
	else LOCALE = (code === 'en' || LOCALES[code]) ? code : 'en';
	return LOCALE;
}

/** Marca un texto para traducir mas tarde (ver lazyLabels). */
const L = (text) => text;

/**
 * Tabla de etiquetas que se traduce cada vez que se lee, no al cargar el
 * plugin: asi el idioma se puede cambiar en las opciones. Con `flat`, todos los
 * textos de la tabla son etiquetas; si no, solo label, hint y short.
 */
function lazyLabels(table, flat) {
	const out = Array.isArray(table) ? [] : {};
	for (const key of Object.keys(table)) {
		const value = table[key];
		if (typeof value === 'string' && (flat || key === 'label' || key === 'hint' || key === 'short')) {
			Object.defineProperty(out, key, { enumerable: true, get: () => t(value) });
		} else if (value && typeof value === 'object') {
			out[key] = lazyLabels(value, false);
		} else {
			out[key] = value;
		}
	}
	return out;
}

/**
 * Texto en el idioma de Obsidian. `text` es el texto en ingles (que ademas es
 * la clave); `vars` reemplaza los {marcadores}.
 */
function t(text, vars) {
	const table = LOCALES[LOCALE];
	let out = (table && Object.prototype.hasOwnProperty.call(table, text)) ? table[text] : text;
	if (vars) {
		out = out.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
	}
	return out;
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = {
	language: 'auto',       // auto = el idioma de Obsidian; o 'en', 'es'
	levelGap: 120,          // separacion entre niveles (eje de profundidad)
	siblingGap: 30,         // separacion entre hermanos (eje transversal)
	treeGap: 200,           // separacion entre arboles independientes
	defaultDirection: 'right',
	dragBranch: true,       // arrastrar nodo => arrastra la rama
	dropToReparent: true,   // soltar sobre otro nodo lo engancha ahi
	createWithKeys: true,   // Tab crea un hijo, Enter crea un hermano
	arrowNavigation: true,  // las flechas saltan de nodo en nodo
	sizeGrip: true,         // punto para estirar caja y letra juntas
	fontBump: 0,            // px de mas para la letra dentro de las cajas (0 = como Obsidian)
	fontLevels: false,      // letra mas grande en la raiz y en las ramas principales
	toolPanel: true,        // boton de herramientas dentro del canvas
	revealExport: true,     // al exportar un .mm o .opml, mostrarlo en el explorador de archivos
	smoothCurves: true,     // curvas de las lineas mas suaves que las de Obsidian
	autoSnapshot: 'off',    // instantaneas automaticas: off | daily | weekly
	snapshotFolder: '',     // carpeta de las instantaneas ('' = se elige al guardar la primera)
	defaultTheme: 'ninguno',// estilo del mapa para los canvas nuevos
	zoomOnEdit: false,      // al escribir, acercar la vista si la letra se ve chica
	openZoom: 0,            // zoom al abrir un canvas, en % (0 = encuadrar todo, como Obsidian)
	zoomIndicator: true,    // mostrar el nivel de zoom
	readablePx: 14,         // tamano minimo de letra en pantalla al escribir
	dragModifier: 'none',   // none | alt | shift | ctrl  (tecla que ACTIVA el arrastre de rama)
	useArrowDirection: true,// si la flecha apunta al padre, invertir la relacion
	setEdgeSides: true,     // reacomodar los lados de las flechas al organizar y al mover
	showBadge: true,        // mostrar contador en nodos colapsados
	refitGroups: true,      // reajustar los grupos al reorganizar
	animate: true,          // animar el movimiento al reorganizar
	defaultAlign: 'manual', // alineacion automatica por defecto en cada canvas
	maxBackups: 40,
};

const DIRECTIONS = lazyLabels({
	right: L('To the right'),
	left: L('To the left'),
	down: L('Downward'),
	up: L('Upward'),
	'both-h': L('Both sides (horizontal)'),
	'both-v': L('Up and down (vertical)'),
}, true);

/**
 * Fondos del canvas, elegibles aparte del estilo: el estilo viste los nodos y
 * las lineas, el fondo solo pinta el papel de atras (y el color de los puntos).
 */
const BACKGROUNDS = lazyLabels({
	tema: { label: L('From the style'), hint: L('the one that comes with the chosen style') },
	papel: { label: L('Paper'), hint: L('paper beige') },
	crema: { label: L('Cream'), hint: L('warm white, easy on the eyes') },
	claro: { label: L('Light'), hint: L('very light gray') },
	gris: { label: L('Gray'), hint: L('mid gray, no glare') },
	pizarra: { label: L('Chalkboard'), hint: L('chalkboard green') },
	noche: { label: L('Night'), hint: L('dark blue') },
});

/** Nombres cortos, para los botones del panel. */
const DIR_SHORT = lazyLabels({
	right: L('Right'),
	left: L('Left'),
	down: L('Down'),
	up: L('Up'),
	'both-h': L('Both sides'),
	'both-v': L('Up and down'),
}, true);

/** Paleta de colores del Canvas de Obsidian. */
const CANVAS_COLORS = lazyLabels([
	{ id: '1', label: L('Red') },
	{ id: '2', label: L('Orange') },
	{ id: '3', label: L('Yellow') },
	{ id: '4', label: L('Green') },
	{ id: '5', label: L('Cyan') },
	{ id: '6', label: L('Purple') },
]);

/**
 * Grados de libertad de la alineacion automatica, como en iThoughts:
 *  completa — el mapa se reacomoda al colapsar y tambien al soltar una rama
 *  parcial  — solo se reacomoda al colapsar o expandir
 *  manual   — nada se mueve solo
 */
const ALIGN_MODES = ['full', 'partial', 'manual'];
const ALIGN_LABEL = lazyLabels({ full: L('Full'), partial: L('Partial'), manual: L('Manual') }, true);
const ALIGN_HINT = lazyLabels({
	full: L('rearranges when you collapse and when you move a branch'),
	partial: L('rearranges when you collapse or expand'),
	manual: L('nothing moves by itself'),
}, true);
const ALIGN_ICON = { full: 'align-start-horizontal', partial: 'move-vertical', manual: 'hand' };

const COLLAPSED_KEY = 'mmCollapsed';
const PAYLOAD_KEY = 'mmCollapsedData';
const STYLE_KEY = 'mmEdgeStyle';
const FONT_KEY = 'mmFontScale';
const LINK_KEY = 'mmLink'; // flecha que NO es madre-hija: una conexion cruzada

/* ------------------------------------------------------------------ */
/* Utilidades de acceso al canvas                                      */
/* ------------------------------------------------------------------ */

let lastCanvas = null;

function getCanvas(app) {
	// El Canvas no esta en la API publica: es un ItemView de tipo 'canvas'.
	const view = app.workspace.getActiveViewOfType(ItemView);
	if (view && view.getViewType() === 'canvas' && view.canvas) {
		lastCanvas = view.canvas;
		return lastCanvas;
	}
	const leaves = app.workspace.getLeavesOfType('canvas');
	// Si el foco esta en otro panel (por ejemplo el esquema), seguimos trabajando
	// sobre el ultimo canvas usado, siempre que siga abierto.
	if (lastCanvas) {
		for (const leaf of leaves) {
			if (leaf.view && leaf.view.canvas === lastCanvas) return lastCanvas;
		}
		lastCanvas = null;
	}
	for (const leaf of leaves) {
		if (leaf.view && leaf.view.canvas) { lastCanvas = leaf.view.canvas; return lastCanvas; }
	}
	return null;
}

function canvasFilePath(canvas) {
	try {
		return (canvas && canvas.view && canvas.view.file && canvas.view.file.path) || '';
	} catch (e) {
		return '';
	}
}

function safeData(obj) {
	try {
		const d = obj.getData();
		return d && typeof d === 'object' ? d : null;
	} catch (e) {
		return null;
	}
}

/**
 * La flecha esta bien anotada en el indice interno del canvas? Obsidian busca
 * ahi "las flechas de este nodo" para redibujarlas cuando el nodo se mueve y
 * para borrarlas cuando el nodo se borra.
 */
function edgeIndexed(canvas, edge) {
	try {
		const ef = canvas.edgeFrom;
		const et = canvas.edgeTo;
		if (!ef || !et || typeof ef.getArray !== 'function' || typeof et.getArray !== 'function') return true;
		return ef.getArray(edge.from.node).indexOf(edge) > -1 && et.getArray(edge.to.node).indexOf(edge) > -1;
	} catch (e) {
		return true;
	}
}

/**
 * Obsidian tiene un defecto: si a una flecha que ya existe se le cambia un
 * extremo por importData, cambia la flecha pero NO su indice. La flecha queda
 * anotada en el nodo viejo: cuando se mueve el nodo nuevo la linea no lo sigue
 * (queda suelta), y si se borra el nodo viejo la flecha se va con el aunque ya
 * no lo toque. Por eso una flecha que cambia de extremo (o que ya esta mal
 * anotada) entra con un id nuevo: Obsidian saca la vieja y crea una bien hecha.
 */
function renewRetargetedEdges(canvas, data) {
	let n = 0;
	if (!canvas || !data || !Array.isArray(data.edges)) return 0;
	if (!canvas.edges || typeof canvas.edges.get !== 'function') return 0;
	for (const e of data.edges) {
		const live = canvas.edges.get(e.id);
		if (!live || !live.from || !live.to || !live.from.node || !live.to.node) continue;
		const moved = live.from.node.id !== e.fromNode || live.to.node.id !== e.toNode;
		if (moved || !edgeIndexed(canvas, live)) {
			e.id = randomCanvasId();
			n++;
		}
	}
	return n;
}

// Escribe datos en el canvas completo y guarda.
function applyCanvasData(canvas, data) {
	if (canvas && canvas.readonly) return false; // instantanea, o canvas trabado: no se toca
	try {
		renewRetargetedEdges(canvas, data);
		// El segundo argumento es imprescindible: sin el, Obsidian no elimina
		// los nodos/flechas que ya no estan en la data (no habria colapso).
		if (typeof canvas.importData === 'function') canvas.importData(data, true);
		else if (typeof canvas.setData === 'function') canvas.setData(data);
		else throw new Error('The canvas does not expose importData/setData');
	} catch (e) {
		console.error('[Othoughts] could not apply the canvas data', e);
		new Notice(t('Othoughts: could not apply the change (see the console).'));
		return false;
	}
	try { canvas.requestSave(); } catch (e) { /* noop */ }
	try { if (typeof canvas.requestFrame === 'function') canvas.requestFrame(); } catch (e) { /* noop */ }
	return true;
}

function selectedNodes(canvas) {
	const out = [];
	try {
		canvas.selection.forEach((el) => {
			if (el && el.id && canvas.nodes.has(el.id)) out.push(el);
		});
	} catch (e) { /* noop */ }
	return out;
}

function selectedEdges(canvas) {
	const out = [];
	try {
		canvas.selection.forEach((el) => {
			if (el && el.id && canvas.edges.has(el.id)) out.push(el);
		});
	} catch (e) { /* noop */ }
	return out;
}

/** Id con el mismo formato que usa el Canvas (16 caracteres hex). */
function randomCanvasId() {
	let out = '';
	while (out.length < 16) out += Math.floor(Math.random() * 16).toString(16);
	return out.slice(0, 16);
}

/** Texto corto de un nodo para los avisos. */
function shortLabel(data) {
	const raw = nodeLabel(data).replace(/\s+/g, ' ').trim();
	if (!raw) return t('the card');
	return raw.length > 26 ? '"' + raw.slice(0, 25) + '..."' : '"' + raw + '"';
}

/**
 * Texto de un nodo sin las marcas de Markdown, para mostrarlo en una linea.
 * Solo saca marcas: no toca guiones ni guiones bajos de adentro de las palabras.
 */
function plainText(text) {
	return String(text || '')
		.replace(/!?\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
		.replace(/!?\[\[([^\]]*)\]\]/g, '$1')
		.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/^[ \t]*(#{1,6}|>+|[-*+]|\d+[.)])[ \t]+/gm, '')
		.replace(/(\*\*|__|~~|==|`)/g, '')
		.replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,;:!?])/gm, '$1$2')
		.trim();
}

/** Texto representativo de un nodo, para ordenar hermanos. */
function nodeLabel(data) {
	if (!data) return '';
	if (data.type === 'text') return plainText(data.text);
	if (data.type === 'file') {
		const path = String(data.file || '');
		const base = path.split('/').pop() || path;
		return base.replace(/\.md$/i, '');
	}
	if (data.type === 'link') return String(data.url || '');
	if (data.type === 'group') return String(data.label || '');
	return '';
}

/**
 * Donde va un nodo (nuevo o recien enganchado) dentro de un grupo de hermanos.
 *  zone 'end'    -> despues de todos los hermanos
 *  zone 'before' -> en el lugar del de referencia, corriendo al resto
 *  zone 'after'  -> justo despues del de referencia, corriendo al resto
 */
function placementFor(opts) {
	const parent = opts.parent;
	const siblings = opts.siblings || [];
	const ref = opts.ref;
	const horiz = opts.horiz;
	const back = opts.back;
	const settings = opts.settings;
	const bStart = (e) => (horiz ? e.y : e.x);
	const bEnd = (e) => (horiz ? e.y + e.h : e.x + e.w);
	const dStart = (e) => (horiz ? e.x : e.y);
	const dEnd = (e) => (horiz ? e.x + e.w : e.y + e.h);
	const sizeB = horiz ? opts.size.h : opts.size.w;
	const sizeD = horiz ? opts.size.w : opts.size.h;

	// profundidad: alineado con el de referencia, o con el ultimo hermano
	let depth;
	if (ref) depth = back ? dEnd(ref) - sizeD : dStart(ref);
	else if (siblings.length) {
		const last = siblings[siblings.length - 1];
		depth = back ? dEnd(last) - sizeD : dStart(last);
	} else if (parent) {
		depth = back ? dStart(parent) - settings.levelGap - sizeD : dEnd(parent) + settings.levelGap;
	} else depth = 0;

	// transversal
	let breadth;
	let pushFrom = null;
	if (opts.zone === 'before' && ref) {
		breadth = bStart(ref);
		pushFrom = breadth;
	} else if (opts.zone === 'after' && ref) {
		breadth = bEnd(ref) + settings.siblingGap;
		pushFrom = breadth;
	} else if (siblings.length) {
		let end = -Infinity;
		for (const sib of siblings) {
			for (const n of subtreeOf(sib, true)) end = Math.max(end, bEnd(n));
		}
		breadth = end + settings.siblingGap;
	} else if (parent) {
		breadth = (horiz ? parent.y + parent.h / 2 : parent.x + parent.w / 2) - sizeB / 2;
	} else breadth = 0;

	return { depth, breadth, pushFrom, pushDelta: sizeB + settings.siblingGap };
}

/** Corre hacia abajo (o a la derecha) a los hermanos que quedarian encima. */
function pushSiblings(data, siblings, pushFrom, delta, horiz, excludeIds) {
	const moved = new Set();
	for (const sib of siblings || []) {
		if (excludeIds && excludeIds.has(sib.id)) continue;
		if ((horiz ? sib.y : sib.x) < pushFrom) continue;
		for (const n of subtreeOf(sib, true)) moved.add(n.id);
	}
	if (!moved.size) return;
	for (const n of data.nodes) {
		if (!moved.has(n.id)) continue;
		if (horiz) n.y += delta; else n.x += delta;
	}
}

/** Mueve un nodo y toda su rama. */
function translateBranch(data, entry, dx, dy) {
	if (!dx && !dy) return;
	const ids = new Set(subtreeOf(entry, true).map((n) => n.id));
	for (const n of data.nodes) {
		if (!ids.has(n.id)) continue;
		n.x += dx;
		n.y += dy;
	}
}

const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

/**
 * A que nodo lleva una flecha, siguiendo la jerarquia del mapa:
 * hacia adelante se baja al primer hijo, hacia atras se sube al padre, y de
 * costado se salta entre hermanos. Devuelve null si no aplica.
 */
function navByTree(entry, key, dir, ladoDe) {
	const horiz = !(dir === 'down' || dir === 'up' || dir === 'both-v');
	const fallback = (dir === 'left' || dir === 'up') ? -1 : 1;
	const sideOf = (n) => (ladoDe && ladoDe.get(n.id)) || fallback;
	const plus = horiz ? 'ArrowRight' : 'ArrowDown';
	const minus = horiz ? 'ArrowLeft' : 'ArrowUp';
	const next = horiz ? 'ArrowDown' : 'ArrowRight';
	const prev = horiz ? 'ArrowUp' : 'ArrowLeft';
	const order = (x, y) => (horiz ? x.y - y.y : x.x - y.x);
	if (key === plus || key === minus) {
		const hacia = key === plus ? 1 : -1;
		if (!entry.parent) {
			// la raiz tiene ramas a los dos lados: vamos a la primera de ese lado
			if (entry.collapsed) return null;
			return entry.children.filter((c) => sideOf(c) === hacia).sort(order)[0] || null;
		}
		if (hacia === sideOf(entry)) {
			if (entry.collapsed || !entry.children.length) return null;
			return entry.children.slice().sort(order)[0];   // adelante: al primer hijo
		}
		return entry.parent;                               // atras: a la madre
	}
	if (key === next || key === prev) {
		const lado = sideOf(entry);
		const parent = entry.parent;
		const grupo = (parent ? parent.children.filter((c) => sideOf(c) === lado) : []).sort(order);
		const i = grupo.indexOf(entry);
		if (i < 0) return null;
		return grupo[i + (key === next ? 1 : -1)] || null;
	}
	return null;
}

/** Nodo mas cercano en esa direccion, sin mirar la jerarquia. */
function navByGeometry(graph, entry, key) {
	const cx = entry.x + entry.w / 2;
	const cy = entry.y + entry.h / 2;
	let best = null;
	graph.nodes.forEach((n) => {
		if (n === entry) return;
		const dx = (n.x + n.w / 2) - cx;
		const dy = (n.y + n.h / 2) - cy;
		let along;
		let across;
		if (key === 'ArrowRight') { along = dx; across = Math.abs(dy); }
		else if (key === 'ArrowLeft') { along = -dx; across = Math.abs(dy); }
		else if (key === 'ArrowDown') { along = dy; across = Math.abs(dx); }
		else { along = -dy; across = Math.abs(dx); }
		if (along <= 1) return;
		if (across > along * 2 + 250) return; // demasiado de costado
		const score = along + across * 1.5;
		if (!best || score < best.score) best = { node: n, score };
	});
	return best ? best.node : null;
}

/** Estilos del mapa (el mismo muestrario que viste), uno por canvas. */
const THEMES = lazyLabels({
	ninguno: { label: L('No style'), hint: L('as Obsidian draws it') },
	papel: { label: L('Paper'), hint: L('beige with dots, light cards') },
	clasico: { label: L('Classic'), hint: L('like iThoughts, colored branches') },
	subrayado: { label: L('Underline'), hint: L('no boxes, text on a line') },
	pizarra: { label: L('Chalkboard'), hint: L('chalkboard green and chalk') },
	cuaderno: { label: L('Notebook'), hint: L('grid paper and blue ink') },
	noche: { label: L('Night'), hint: L('dark blue with a glow') },
});

/**
 * Nivel y rama de cada nodo para los estilos: 0 la raiz, 1 las ramas
 * principales, 2 todo lo de abajo, x los nodos sueltos (los grupos se marcan
 * aparte). Las ramas principales se numeran 0..4, derecha primero.
 */
function themeInfo(graph) {
	const info = new Map();
	for (const root of graph.roots) {
		if (!root.children.length) { info.set(root.id, { lvl: 'x', br: null }); continue; }
		info.set(root.id, { lvl: '0', br: null });
		const cx = root.x + root.w / 2;
		const izq = (n) => (n.x + n.w / 2 < cx ? 1 : 0);
		const kids = root.children.slice().sort((a, b) => (izq(a) - izq(b)) || (a.y - b.y));
		kids.forEach((kid, i) => {
			const br = i % 5;
			const walk = (n, depth) => {
				if (info.has(n.id)) return;
				info.set(n.id, { lvl: depth >= 2 ? '2' : String(depth), br });
				n.children.forEach((c) => walk(c, depth + 1));
			};
			walk(kid, 1);
		});
	}
	return info;
}

/* ------------------------------------------------------------------ */
/* Panel de herramientas (la ruedita dentro del canvas)                */
/* ------------------------------------------------------------------ */

/** Un boton chico del panel; `activo` lo deja marcado. */
function chip(parent, texto, activo, tip, fn) {
	const b = document.createElement('button');
	b.className = 'mm-chip' + (activo ? ' is-active' : '');
	b.type = 'button';
	b.textContent = texto;
	if (tip) { b.setAttribute('title', tip); b.setAttribute('aria-label', tip); }
	b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
	parent.appendChild(b);
	return b;
}

function seccion(panel, titulo) {
	const s = document.createElement('div');
	s.className = 'mm-sec';
	const h = document.createElement('div');
	h.className = 'mm-sec-title';
	h.textContent = titulo;
	s.appendChild(h);
	const fila = document.createElement('div');
	fila.className = 'mm-chips';
	s.appendChild(fila);
	panel.appendChild(s);
	return fila;
}

/** Dibuja el panel con el estado del canvas que estas mirando. */
function paintToolPanel(plugin, canvas, panel) {
	panel.textContent = '';
	const st = plugin.mapState(canvas);
	const s = plugin.settings;
	const titulo = document.createElement('div');
	titulo.className = 'mm-panel-title';
	titulo.textContent = t('Map tools');
	panel.appendChild(titulo);

	const estilos = seccion(panel, t('Style'));
	for (const k of Object.keys(THEMES)) {
		chip(estilos, THEMES[k].label, st.theme === k, THEMES[k].hint, () => {
			plugin.setTheme(k);
			paintToolPanel(plugin, canvas, panel);
		});
	}

	const fondos = seccion(panel, t('Background'));
	for (const k of Object.keys(BACKGROUNDS)) {
		chip(fondos, BACKGROUNDS[k].label, (st.bg || 'tema') === k, BACKGROUNDS[k].hint, () => {
			plugin.setBackground(k);
			paintToolPanel(plugin, canvas, panel);
		});
	}

	const letra = seccion(panel, t('Text size'));
	const bump = Number(s.fontBump) || 0;
	chip(letra, '\u2212', false, t('Smaller text'), () => { plugin.setFontBump(bump - 0.5); paintToolPanel(plugin, canvas, panel); });
	const valor = document.createElement('span');
	valor.className = 'mm-valor';
	valor.textContent = (bump > 0 ? '+' : '') + String(bump).replace('.', t('.')) + ' px'; // separador decimal del idioma
	letra.appendChild(valor);
	chip(letra, '+', false, t('Larger text'), () => { plugin.setFontBump(bump + 0.5); paintToolPanel(plugin, canvas, panel); });
	chip(letra, t('By level'), !!s.fontLevels, t('Larger text for the root and the main branches (like iThoughts)'), () => {
		plugin.setFontLevels(!s.fontLevels);
		paintToolPanel(plugin, canvas, panel);
	});

	const mapa = seccion(panel, t('Map type'));
	for (const k of Object.keys(DIRECTIONS)) {
		chip(mapa, DIR_SHORT[k] || DIRECTIONS[k], st.dir === k, DIRECTIONS[k], () => {
			plugin.setMapDirection(k);
			paintToolPanel(plugin, canvas, panel);
		});
	}

	const alin = seccion(panel, t('Automatic alignment'));
	for (const m of ALIGN_MODES) {
		chip(alin, ALIGN_LABEL[m], st.mode === m, ALIGN_HINT[m], () => {
			plugin.setAlignMode(m);
			paintToolPanel(plugin, canvas, panel);
		});
	}

	const acc = seccion(panel, t('Actions'));
	chip(acc, t('Rearrange'), false, t('Arrange the whole map in the chosen direction'), () => plugin.layout(st.dir, true));
	chip(acc, t('Collapse all'), false, t('Close every branch'), () => plugin.collapseAll());
	chip(acc, t('Expand all'), false, t('Open every branch'), () => plugin.expandAll());
	chip(acc, t('Outline'), false, t('See the map as an outline'), () => plugin.openOutline());

	const exp = seccion(panel, t('Export'));
	for (const k of Object.keys(EXPORT_FORMATS)) {
		chip(exp, EXPORT_FORMATS[k].short, false, EXPORT_FORMATS[k].label + ': ' + EXPORT_FORMATS[k].hint, () => plugin.exportMap(k));
	}
	chip(exp, t('Copy outline'), false, t('Copy the outline as a Markdown list'), () => plugin.copyOutline());

	const hist = seccion(panel, t('History'));
	chip(hist, t('Take snapshot'), false, t('Save how the map looks right now'), () => plugin.takeSnapshotFromUi());
	chip(hist, t('See history'), false, t('Every saved version of this map'), () => plugin.openSnapshotHistory());
}

/**
 * La tarjeta muestra una imagen, un video o una pagina? Los estilos no pintan
 * encima de eso: solo le ponen un marco. (En CSS se haria con :has(), que obliga
 * al navegador a revisar mucho de mas cada vez que algo cambia.) El iframe con
 * el que Obsidian edita el texto de la tarjeta no cuenta.
 */
function hasMedia(el) {
	try {
		return !!el.querySelector('.canvas-node-content img, .canvas-node-content video, .canvas-node-content iframe:not(.is-controlled)');
	} catch (e) {
		return false;
	}
}

/** Pone (o saca, con null) un atributo solo si cambia. */
function setData(el, name, value) {
	if (!el || typeof el.getAttribute !== 'function') return;
	const cur = el.getAttribute(name);
	if (value === null || value === undefined) {
		if (cur !== null) el.removeAttribute(name);
		return;
	}
	if (cur !== value) el.setAttribute(name, value);
}

/**
 * Estas escribiendo de verdad en ese nodo: tiene la marca de edicion Y el
 * cursor esta dentro de su editor. Obsidian a veces deja la marca puesta
 * despues de salir, y si solo miraramos la marca, Enter no haria nada.
 */
/**
 * Mete un salto de linea donde esta el cursor, dentro del editor que tiene el foco.
 * Primero por CodeMirror (el editor de Obsidian); si no se lo encuentra, como texto tipeado.
 */
function insertNewline(target, app) {
	const view = cmViewFrom(target);
	if (view && view.state && typeof view.dispatch === 'function') {
		try {
			view.dispatch(view.state.replaceSelection('\n'), { scrollIntoView: true, userEvent: 'input.type' });
			return true;
		} catch (e) { /* probamos la otra via */ }
	}
	// el editor de Obsidian que tiene el foco (las cajas del canvas lo registran como editor activo)
	try {
		const ed = app && app.workspace && app.workspace.activeEditor && app.workspace.activeEditor.editor;
		const dom = ed && ed.cm && ed.cm.contentDOM;
		if (ed && typeof ed.replaceSelection === 'function' && (!dom || !target || dom === target || (typeof dom.contains === 'function' && dom.contains(target)))) {
			ed.replaceSelection('\n');
			return true;
		}
	} catch (e) { /* noop */ }
	try {
		const doc = (target && target.ownerDocument) || document;
		if (typeof doc.execCommand === 'function' && doc.execCommand('insertText', false, '\n')) return true;
	} catch (e) { /* noop */ }
	return false;
}

/**
 * La vista de CodeMirror duena de un elemento. Las versiones nuevas (Obsidian 1.13)
 * la cuelgan de el.cmTile.root.view; las anteriores, de el.cmView.rootView.view.
 */
/**
 * La caja del canvas que contiene un elemento. En Obsidian 1.13 el editor de cada
 * caja vive dentro de un iframe, asi que si no aparece directo se busca desde el iframe.
 */
function canvasNodeElOf(el) {
	try {
		if (!el || typeof el.closest !== 'function') return null;
		const direct = el.closest('.canvas-node');
		if (direct) return direct;
		const doc = el.ownerDocument;
		const frame = doc && doc.defaultView && doc.defaultView.frameElement;
		return frame && typeof frame.closest === 'function' ? frame.closest('.canvas-node') : null;
	} catch (e) {
		return null;
	}
}

function cmViewFrom(target) {
	try {
		if (!target || typeof target.closest !== 'function') return null;
		const content = target.closest('.cm-content');
		const editor = target.closest('.cm-editor');
		const candidatos = [content, editor && typeof editor.querySelector === 'function' ? editor.querySelector('.cm-content') : null, editor];
		for (const el of candidatos) {
			if (!el) continue;
			const tile = el.cmTile;
			if (tile && tile.root && tile.root.view) return tile.root.view;
			const cv = el.cmView;
			if (cv && cv.rootView && cv.rootView.view) return cv.rootView.view;
		}
	} catch (e) { /* noop */ }
	return null;
}

function isTyping(node) {
	if (!node || !node.isEditing) return false;
	try {
		const a = document.activeElement;
		if (!a || !node.nodeEl || a === node.nodeEl || typeof node.nodeEl.contains !== 'function') return false;
		if (!node.nodeEl.contains(a)) return false;
		if (a.tagName === 'IFRAME') {
			const inner = a.contentDocument && a.contentDocument.activeElement;
			return !!(inner && (inner.isContentEditable || /^(TEXTAREA|INPUT)$/.test(inner.tagName || '')));
		}
		return !!(a.isContentEditable || /^(TEXTAREA|INPUT)$/.test(a.tagName || ''));
	} catch (e) {
		return !!node.isEditing;
	}
}

/** Nodo que se esta editando en este momento, si hay alguno. */
function editingNode(canvas) {
	let found = null;
	try { canvas.nodes.forEach((n) => { if (n.isEditing) found = n; }); } catch (e) { /* noop */ }
	return found;
}

/** Hay un sugeridor, un aviso modal o un buscador abierto por encima. */
function overlayOpen() {
	try {
		return !!document.querySelector('.suggestion-container, .prompt, .modal-container');
	} catch (e) {
		return false;
	}
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Mueve los nodos hasta sus posiciones finales con una animacion corta.
 * `done` corre al terminar (o de inmediato si no hay nada que animar).
 */
function animateNodes(canvas, targets, duration, done) {
	const moves = [];
	for (const t of targets) {
		const node = canvas.nodes.get(t.id);
		if (!node) continue;
		if (node.x === t.x && node.y === t.y) continue;
		moves.push({ node, fromX: node.x, fromY: node.y, x: t.x, y: t.y });
	}
	if (!moves.length) { done(); return null; }
	const start = performance.now();
	let frame = null;
	const step = () => {
		const k = Math.min(1, (performance.now() - start) / duration);
		const e = easeOutCubic(k);
		for (const m of moves) {
			moveNodeTo(m.node, Math.round(m.fromX + (m.x - m.fromX) * e), Math.round(m.fromY + (m.y - m.fromY) * e));
		}
		try { if (typeof canvas.requestFrame === 'function') canvas.requestFrame(); } catch (err) { /* noop */ }
		if (k < 1) frame = window.requestAnimationFrame(step);
		else done();
	};
	frame = window.requestAnimationFrame(step);
	return () => { if (frame !== null) window.cancelAnimationFrame(frame); };
}

function moveNodeTo(node, x, y) {
	try {
		if (typeof node.moveTo === 'function') { node.moveTo({ x, y }); return; }
	} catch (e) { /* fallthrough */ }
	node.x = x;
	node.y = y;
	try { if (typeof node.render === 'function') node.render(); } catch (e) { /* noop */ }
}

/* ------------------------------------------------------------------ */
/* Modelo de grafo (padres / hijos)                                    */
/* ------------------------------------------------------------------ */

/**
 * Decide cual de las flechas que llegan a cada nodo es la de su madre.
 *
 * Un nodo puede recibir varias flechas, pero en el arbol tiene una sola madre;
 * las demas son conexiones cruzadas. Si eso se decidiera solo por el orden en
 * que estan guardadas las flechas ("la primera gana"), cualquier cosa que cambie
 * ese orden -- colapsar y expandir, rehacer una flecha -- le cambiaria la madre
 * a un nodo sin que nadie lo pida. Por eso las cruzadas quedan marcadas en el
 * propio canvas (clave mmLink) y la decision se toma asi:
 *
 *   1. Flechas sin marca, en orden: la primera que llega a un nodo es su madre.
 *      Las que llegan a un nodo que ya tiene madre son cruzadas; las que
 *      cerrarian un ciclo (una flecha "de vuelta" hacia un ancestro) tambien.
 *   2. Flechas marcadas como cruzadas: siguen siendolo siempre. Nunca pasan a
 *      ser madre por su cuenta, aunque el nodo se quede sin madre: asi la
 *      jerarquia no cambia sola al mover, colapsar o expandir. Para convertir
 *      una en madre esta el clic derecho sobre la flecha ("Usar esta flecha
 *      como rama"), o enganchar el nodo a ese mismo padre.
 *
 * La flecha madre siempre esta guardada junto a su hija (las dos a la vista, o
 * las dos en el mismo paquete colapsado), asi que una flecha guardada en otro
 * lado es cruzada por construccion.
 *
 * `items`: Map id -> { parent, home }. `edges`: [{ data, home }] en orden.
 * `onParent(child, parent, edge, reversed)` engancha. Devuelve las cruzadas,
 * cada una con su `reason`: 'cruzada' o 'vuelta'.
 */
function assignParents(items, edges, settings, onParent) {
	const links = [];
	const hecho = new Set();
	const extremos = (e) => {
		const inv = !!(settings.useArrowDirection && e.data.fromEnd === 'arrow' && e.data.toEnd !== 'arrow');
		return {
			parent: items.get(inv ? e.data.toNode : e.data.fromNode),
			child: items.get(inv ? e.data.fromNode : e.data.toNode),
			reversed: inv,
		};
	};
	const cierraCiclo = (parent, child) => {
		let cur = parent;
		let guard = 0;
		while (cur && guard++ < 10000) {
			if (cur === child) return true;
			cur = cur.parent;
		}
		return false;
	};
	const cruzada = (e, x, reason) => links.push({ from: x.parent.id, to: x.child.id, edge: e, reason });

	for (const e of edges) {
		if (e.data[LINK_KEY]) continue;
		hecho.add(e);
		const x = extremos(e);
		if (!x.parent || !x.child || x.parent === x.child) continue;
		if (x.child.home !== e.home || x.child.parent) { cruzada(e, x, 'cruzada'); continue; }
		if (cierraCiclo(x.parent, x.child)) { cruzada(e, x, 'vuelta'); continue; }
		x.child.parent = x.parent;
		onParent(x.child, x.parent, e, x.reversed);
	}
	for (const e of edges) {
		if (hecho.has(e)) continue;
		const x = extremos(e);
		if (!x.parent || !x.child || x.parent === x.child) continue;
		cruzada(e, x, e.data[LINK_KEY] === 'vuelta' ? 'vuelta' : 'cruzada');
	}
	return links;
}

function buildGraph(canvas, settings) {
	const nodes = new Map();
	canvas.nodes.forEach((node, id) => {
		const d = safeData(node);
		if (!d) return;
		if (d.type === 'group') return; // los grupos no participan del arbol
		nodes.set(id, {
			id,
			node,
			data: d,
			x: d.x || 0,
			y: d.y || 0,
			w: d.width || 250,
			h: d.height || 60,
			children: [],
			parent: null,
			parentEdge: null,
			parentReversed: false,
			collapsed: !!d[COLLAPSED_KEY],
		});
	});

	const edgeList = [];
	canvas.edges.forEach((edge, id) => {
		const d = safeData(edge);
		if (!d) return;
		edgeList.push({ id: d.id || id, edge, data: d });
	});

	assignParents(nodes, edgeList, settings, (child, parent, e, reversed) => {
		child.parentEdge = e;
		child.parentReversed = reversed;
		parent.children.push(child);
	});

	const roots = [];
	nodes.forEach((n) => { if (!n.parent) roots.push(n); });
	return { nodes, roots, edges: edgeList };
}

function subtreeOf(entry, includeSelf) {
	const out = [];
	const seen = new Set();
	const walk = (n) => {
		if (seen.has(n.id)) return;
		seen.add(n.id);
		if (n !== entry || includeSelf) out.push(n);
		n.children.forEach(walk);
	};
	walk(entry);
	return out;
}

function countDescendants(entry) {
	return subtreeOf(entry, false).length;
}

/* ------------------------------------------------------------------ */
/* Auto-organizacion (tidy tree layout)                                */
/* ------------------------------------------------------------------ */

const SIDE_BY_DIR = {
	right: { from: 'right', to: 'left' },
	left: { from: 'left', to: 'right' },
	down: { from: 'bottom', to: 'top' },
	up: { from: 'top', to: 'bottom' },
};

/**
 * Calcula posiciones para el subarbol de `root`.
 * Devuelve { positions: Map<id,{x,y}>, sides: Map<edgeId,{fromSide,toSide}>, bounds }
 * El nodo raiz conserva su posicion actual (ancla).
 */
/**
 * Lado de cada rama, como en iThoughts: una rama principal (hija directa de una
 * raiz) mira hacia el lado de la raiz en el que esta -- el umbral es el centro
 * de la caja raiz -- y todos sus descendientes heredan ese lado. Los nietos no
 * se dan vuelta por su cuenta. Devuelve id -> +1 (derecha/abajo) o -1.
 */
function branchSides(graph, dir) {
	const horiz = !(dir === 'down' || dir === 'up' || dir === 'both-v');
	const fallback = (dir === 'left' || dir === 'up') ? -1 : 1;
	const sides = new Map();
	const inherit = (n, sgn) => {
		sides.set(n.id, sgn);
		for (const c of n.children) if (!sides.has(c.id)) inherit(c, sgn);
	};
	for (const root of graph.roots) {
		sides.set(root.id, fallback);
		const rc = horiz ? root.x + root.w / 2 : root.y + root.h / 2;
		for (const kid of root.children) {
			const kc = horiz ? kid.x + kid.w / 2 : kid.y + kid.h / 2;
			inherit(kid, kc > rc ? 1 : (kc < rc ? -1 : fallback));
		}
	}
	return sides;
}

/** Eje, sentido y lados de flecha para una rama que mira hacia `signum`. */
function sideInfo(dir, signum) {
	const horiz = !(dir === 'down' || dir === 'up' || dir === 'both-v');
	const key = horiz ? (signum < 0 ? 'left' : 'right') : (signum < 0 ? 'up' : 'down');
	return { horiz, back: signum < 0, sides: SIDE_BY_DIR[key], key };
}

/** Da vuelta una rama: sus descendientes pasan al otro lado de ella, con sus flechas. */
function mirrorBranch(data, entry, dir, signum) {
	const info = sideInfo(dir, signum);
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const self = byId.get(entry.id);
	if (!self) return;
	const c = info.horiz ? self.x + (self.width || 0) / 2 : self.y + (self.height || 0) / 2;
	const desc = subtreeOf(entry, false);
	for (const d of desc) {
		const n = byId.get(d.id);
		if (!n) continue;
		if (info.horiz) n.x = Math.round(2 * c - n.x - (n.width || 0));
		else n.y = Math.round(2 * c - n.y - (n.height || 0));
	}
	for (const d of desc) {
		if (!d.parentEdge) continue;
		const e = (data.edges || []).find((x) => x.id === d.parentEdge.id);
		if (!e) continue;
		if (d.parentReversed) { e.fromSide = info.sides.to; e.toSide = info.sides.from; }
		else { e.fromSide = info.sides.from; e.toSide = info.sides.to; }
	}
}

function computeLayout(root, dir, settings, bySide) {
	const horiz = dir === 'right' || dir === 'left' || dir === 'both-h';
	const twoSided = !!bySide || dir === 'both-h' || dir === 'both-v';
	const bsz = (n) => (horiz ? n.h : n.w);   // tamano transversal
	const dsz = (n) => (horiz ? n.w : n.h);   // tamano en profundidad

	// Los hijos se ordenan segun su disposicion visual actual, para no barajar el mapa.
	const childrenOf = (n) => {
		if (n.collapsed) return [];
		const kids = n.children.slice();
		kids.sort((a, b) => (horiz ? a.y - b.y : a.x - b.x));
		return kids;
	};

	// 1. Profundidad de cada nivel: ancho (o alto) maximo por nivel.
	const levelSize = [];
	(function walk(n, lvl) {
		levelSize[lvl] = Math.max(levelSize[lvl] || 0, dsz(n));
		childrenOf(n).forEach((c) => walk(c, lvl + 1));
	})(root, 0);
	const depthPos = [0];
	for (let i = 1; i < levelSize.length; i++) {
		depthPos[i] = depthPos[i - 1] + levelSize[i - 1] + settings.levelGap;
	}

	// 2. Extension transversal de cada subarbol.
	const extents = new Map();
	const extent = (n) => {
		if (extents.has(n.id)) return extents.get(n.id);
		const kids = childrenOf(n);
		let total = 0;
		if (kids.length) {
			for (const c of kids) total += extent(c);
			total += settings.siblingGap * (kids.length - 1);
		}
		const value = Math.max(bsz(n), total);
		extents.set(n.id, value);
		return value;
	};

	// 3. Posicion transversal (coordenada del borde inicial) por nodo.
	const breadth = new Map();
	const place = (n, start) => {
		const kids = childrenOf(n);
		const ext = extent(n);
		if (!kids.length) {
			breadth.set(n.id, start + (ext - bsz(n)) / 2);
			return;
		}
		let childTotal = 0;
		for (const c of kids) childTotal += extent(c);
		childTotal += settings.siblingGap * (kids.length - 1);
		let cursor = start + Math.max(0, (ext - childTotal) / 2);
		for (const c of kids) {
			place(c, cursor);
			cursor += extent(c) + settings.siblingGap;
		}
		const first = kids[0];
		const last = kids[kids.length - 1];
		const center = ((breadth.get(first.id) + bsz(first) / 2) + (breadth.get(last.id) + bsz(last) / 2)) / 2;
		breadth.set(n.id, center - bsz(n) / 2);
	};

	const anchorDepthStart = horiz ? root.x : root.y;
	const anchorDepthEnd = anchorDepthStart + dsz(root);
	const anchorBreadthCenter = (horiz ? root.y : root.x) + bsz(root) / 2;

	const positions = new Map();
	const sides = new Map();
	const sideDirs = twoSided
		? (horiz ? [SIDE_BY_DIR.right, SIDE_BY_DIR.left] : [SIDE_BY_DIR.down, SIDE_BY_DIR.up])
		: [SIDE_BY_DIR[dir]];

	const commit = (n, lvl, signum, sideCfg) => {
		const d = signum > 0
			? anchorDepthStart + depthPos[lvl]
			: anchorDepthEnd - depthPos[lvl] - dsz(n);
		const b = breadth.get(n.id);
		positions.set(n.id, horiz ? { x: d, y: b } : { x: b, y: d });
		if (n.parentEdge && sideCfg) {
			// El extremo "padre" siempre sale por el lado de avance.
			const cfg = n.parentReversed
				? { fromSide: sideCfg.to, toSide: sideCfg.from }
				: { fromSide: sideCfg.from, toSide: sideCfg.to };
			sides.set(n.parentEdge.id, cfg);
		}
		childrenOf(n).forEach((c) => commit(c, lvl + 1, signum, sideCfg));
	};

	if (!twoSided) {
		place(root, 0);
		const shift = (anchorBreadthCenter - bsz(root) / 2) - breadth.get(root.id);
		breadth.forEach((v, k) => breadth.set(k, v + shift));
		const signum = (dir === 'left' || dir === 'up') ? -1 : 1;
		commit(root, 0, signum, settings.setEdgeSides ? sideDirs[0] : null);
	} else {
		const kids = childrenOf(root);
		let groups;
		if (bySide) {
			// cada rama se queda del lado de la raiz en el que esta (como iThoughts)
			const rc = horiz ? root.x + root.w / 2 : root.y + root.h / 2;
			const primero = !(dir === 'left' || dir === 'up');
			const pos = [];
			const neg = [];
			for (const c of kids) {
				const cc = horiz ? c.x + c.w / 2 : c.y + c.h / 2;
				if (cc > rc || (cc === rc && primero)) pos.push(c); else neg.push(c);
			}
			groups = [pos, neg];
		}
		// si no, reparto parejo en dos lados, conservando el orden
		const totals = kids.map((c) => extent(c));
		const sum = totals.reduce((a, b) => a + b, 0);
		let acc = 0;
		let cut = kids.length;
		for (let i = 0; i < kids.length; i++) {
			acc += totals[i];
			if (acc >= sum / 2) { cut = i + 1; break; }
		}
		if (!groups) groups = [kids.slice(0, cut), kids.slice(cut)];
		positions.set(root.id, horiz
			? { x: root.x, y: anchorBreadthCenter - root.h / 2 }
			: { x: anchorBreadthCenter - root.w / 2, y: root.y });
		groups.forEach((group, gi) => {
			if (!group.length) return;
			let groupTotal = 0;
			for (const c of group) groupTotal += extent(c);
			groupTotal += settings.siblingGap * (group.length - 1);
			let cursor = anchorBreadthCenter - groupTotal / 2;
			for (const c of group) {
				place(c, cursor);
				cursor += extent(c) + settings.siblingGap;
			}
			const signum = gi === 0 ? 1 : -1;
			const sideCfg = settings.setEdgeSides ? sideDirs[gi] : null;
			group.forEach((c) => commit(c, 1, signum, sideCfg));
		});
	}

	return { positions, sides };
}

/** Nodos contenidos dentro de cada grupo (antes de mover nada). */
function groupMembership(data) {
	const members = new Map();
	for (const g of data.nodes) {
		if (g.type !== 'group') continue;
		const ids = [];
		for (const n of data.nodes) {
			if (n === g || n.type === 'group') continue;
			const w = n.width || 0;
			const h = n.height || 0;
			if (n.x >= g.x && n.y >= g.y && n.x + w <= g.x + g.width && n.y + h <= g.y + g.height) ids.push(n.id);
		}
		if (ids.length) members.set(g.id, ids);
	}
	return members;
}

/** Vuelve a encuadrar cada grupo alrededor de los nodos que contenia. */
function refitGroups(data, members, pad) {
	const byId = new Map(data.nodes.map((n) => [n.id, n]));
	const label = 34; // espacio para el titulo del grupo
	members.forEach((ids, gid) => {
		const g = byId.get(gid);
		if (!g) return;
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, found = 0;
		for (const id of ids) {
			const n = byId.get(id);
			if (!n) continue; // puede estar oculto dentro de una rama colapsada
			found++;
			minX = Math.min(minX, n.x);
			minY = Math.min(minY, n.y);
			maxX = Math.max(maxX, n.x + (n.width || 0));
			maxY = Math.max(maxY, n.y + (n.height || 0));
		}
		if (!found) return;
		g.x = Math.round(minX - pad);
		g.y = Math.round(minY - pad - label);
		g.width = Math.round((maxX - minX) + pad * 2);
		g.height = Math.round((maxY - minY) + pad * 2 + label);
	});
}

/** Reacomodos que todavia se estan animando, por canvas. */
const pendingLayouts = new WeakMap();

/** Si hay un reacomodo a medio animar, lo termina ya (salta al final y guarda). */
function flushLayout(canvas) {
	const fin = canvas ? pendingLayouts.get(canvas) : null;
	if (fin) fin();
}

function layoutBox(positions, sizeOf) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	positions.forEach((pos, id) => {
		const sz = sizeOf.get(id);
		if (!sz) return;
		minX = Math.min(minX, pos.x);
		minY = Math.min(minY, pos.y);
		maxX = Math.max(maxX, pos.x + sz.w);
		maxY = Math.max(maxY, pos.y + sz.h);
	});
	return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

/**
 * Aplica el layout a una lista de raices y guarda. Devuelve cuantos nodos
 * cambian de lugar.
 *
 * `stack` = true: si dos mapas quedarian encimados, el segundo se corre lo justo
 * para no pisar al primero. Cada mapa queda anclado en su raiz y lo que no es
 * parte de ningun mapa no se mueve.
 *
 * Lo que se guarda al terminar la animacion son SOLO las posiciones y los lados
 * de las flechas calculados aca, aplicados sobre el estado del canvas de ese
 * momento. Nunca se vuelve a escribir una foto vieja del canvas: si mientras
 * tanto escribiste, creaste o borraste algo, eso queda como esta.
 */
function runLayout(canvas, entries, dir, settings, stack, onDone, bySide) {
	if (!entries.length) return 0;
	flushLayout(canvas);
	const data = safeData(canvas);
	if (!data) return 0;
	const horiz = dir === 'right' || dir === 'left' || dir === 'both-h';
	const sizeOf = new Map(data.nodes.map((n) => [n.id, { w: n.width || 250, h: n.height || 60 }]));
	const actual = new Map(data.nodes.map((n) => [n.id, n]));
	const members = settings.refitGroups ? groupMembership(data) : null;
	const pad = Math.max(20, Math.round(settings.siblingGap / 2));

	const finalPos = new Map();
	const finalSides = new Map();
	const placed = [];
	for (const root of entries) {
		const { positions, sides } = computeLayout(root, dir, settings, bySide);
		let box = layoutBox(positions, sizeOf);
		let shift = 0;
		if (stack && box) {
			const m = 40;
			let guard = 0;
			let again = true;
			while (again && guard++ < 200) {
				again = false;
				for (const o of placed) {
					const lo = (horiz ? box.minY : box.minX) + shift;
					const hi = (horiz ? box.maxY : box.maxX) + shift;
					const cruzaProf = horiz
						? (box.minX < o.maxX + m && box.maxX + m > o.minX)
						: (box.minY < o.maxY + m && box.maxY + m > o.minY);
					const oLo = horiz ? o.minY : o.minX;
					const oHi = horiz ? o.maxY : o.maxX;
					if (cruzaProf && lo < oHi + m && hi + m > oLo) {
						shift = oHi + settings.treeGap - (horiz ? box.minY : box.minX);
						again = true;
					}
				}
			}
		}
		positions.forEach((pos, id) => {
			if (!sizeOf.has(id)) return;
			finalPos.set(id, {
				x: Math.round(pos.x + (horiz ? 0 : shift)),
				y: Math.round(pos.y + (horiz ? shift : 0)),
			});
		});
		sides.forEach((cfg, edgeId) => finalSides.set(edgeId, cfg));
		if (box) {
			placed.push(horiz
				? { minX: box.minX, maxX: box.maxX, minY: box.minY + shift, maxY: box.maxY + shift }
				: { minX: box.minX + shift, maxX: box.maxX + shift, minY: box.minY, maxY: box.maxY });
		}
	}

	let moved = 0;
	finalPos.forEach((pos, id) => {
		const n = actual.get(id);
		if (n && (n.x !== pos.x || n.y !== pos.y)) moved++;
	});

	let terminado = false;
	let cancelar = null;
	const finish = () => {
		if (terminado) return;
		terminado = true;
		if (pendingLayouts.get(canvas) === finishNow) pendingLayouts.delete(canvas);
		const fresh = safeData(canvas);
		if (fresh) {
			let touched = false;
			for (const n of fresh.nodes) {
				const pos = finalPos.get(n.id);
				if (pos && (n.x !== pos.x || n.y !== pos.y)) { n.x = pos.x; n.y = pos.y; touched = true; }
			}
			for (const e of fresh.edges || []) {
				const cfg = finalSides.get(e.id);
				if (cfg && (e.fromSide !== cfg.fromSide || e.toSide !== cfg.toSide)) {
					e.fromSide = cfg.fromSide;
					e.toSide = cfg.toSide;
					touched = true;
				}
			}
			if (members) {
				const firma = () => fresh.nodes.filter((n) => n.type === 'group')
					.map((g) => [g.id, g.x, g.y, g.width, g.height].join(',')).join(';');
				const antes = firma();
				refitGroups(fresh, members, pad);
				if (firma() !== antes) touched = true;
			}
			if (touched) applyCanvasData(canvas, fresh);
			else { try { canvas.requestSave(); } catch (e) { /* noop */ } }
		}
		if (onDone) onDone();
	};
	const finishNow = () => {
		if (cancelar) cancelar();
		finish();
	};

	// Con pocos nodos el movimiento se anima; con muchos se aplica de una.
	const targets = [];
	finalPos.forEach((pos, id) => targets.push({ id, x: pos.x, y: pos.y }));
	if (settings.animate && targets.length <= 300) {
		pendingLayouts.set(canvas, finishNow);
		cancelar = animateNodes(canvas, targets, 240, finish);
	} else finish();
	return moved;
}

/* ------------------------------------------------------------------ */
/* Colapsar / expandir ramas                                           */
/* ------------------------------------------------------------------ */

/**
 * Saca del canvas el subarbol de `entry` y lo guarda dentro del propio nodo
 * (clave mmCollapsedData del JSON del canvas). Muta `data`.
 * Devuelve el payload guardado o null.
 */
function collapseInData(data, entry) {
	const descendants = subtreeOf(entry, false);
	if (!descendants.length) return null;
	const ids = new Set(descendants.map((n) => n.id));

	const keptNodes = [];
	const takenNodes = [];
	for (const n of data.nodes) (ids.has(n.id) ? takenNodes : keptNodes).push(n);
	if (!takenNodes.length) return null;

	const keptEdges = [];
	const takenEdges = [];
	for (const e of (data.edges || [])) {
		if (ids.has(e.fromNode) || ids.has(e.toNode)) takenEdges.push(e);
		else keptEdges.push(e);
	}

	data.nodes = keptNodes;
	data.edges = keptEdges;

	const holder = data.nodes.find((n) => n.id === entry.id);
	if (!holder) return null;
	const payload = { nodes: takenNodes, edges: takenEdges };
	holder[COLLAPSED_KEY] = true;
	holder[PAYLOAD_KEY] = payload;
	return payload;
}

/** Devuelve al canvas el subarbol guardado en el nodo. Muta `data`. */
function expandInData(data, nodeId) {
	const holder = data.nodes.find((n) => n.id === nodeId);
	if (!holder) return 0;
	const payload = holder[PAYLOAD_KEY];
	delete holder[COLLAPSED_KEY];
	delete holder[PAYLOAD_KEY];
	if (!payload || !Array.isArray(payload.nodes)) return 0;

	const nodeIds = new Set(data.nodes.map((n) => n.id));
	let restored = 0;
	for (const n of payload.nodes) {
		if (nodeIds.has(n.id)) continue;
		data.nodes.push(n);
		nodeIds.add(n.id);
		restored++;
	}
	if (!data.edges) data.edges = [];
	const edgeIds = new Set(data.edges.map((e) => e.id));
	for (const e of (payload.edges || [])) {
		if (edgeIds.has(e.id)) continue;
		if (!nodeIds.has(e.fromNode) || !nodeIds.has(e.toNode)) {
			// Una flecha cruzada cuyo otro extremo sigue guardado en otra rama
			// colapsada: no se puede dibujar todavia, pero tampoco se pierde. Se
			// muda a esa otra rama y vuelve cuando la abras.
			const falta = !nodeIds.has(e.fromNode) ? e.fromNode : e.toNode;
			const otro = payloadHolding(data, falta);
			if (otro) {
				if (!Array.isArray(otro.edges)) otro.edges = [];
				if (!otro.edges.some((x) => x.id === e.id)) otro.edges.push(e);
			}
			continue;
		}
		data.edges.push(e);
		edgeIds.add(e.id);
	}
	return restored;
}

/** El paquete (de una rama colapsada, a cualquier profundidad) que guarda ese nodo. */
function payloadHolding(data, nodeId) {
	const walk = (nodes) => {
		for (const n of nodes || []) {
			const pl = n[PAYLOAD_KEY];
			if (!pl || !Array.isArray(pl.nodes)) continue;
			if (pl.nodes.some((x) => x.id === nodeId)) return pl;
			const deep = walk(pl.nodes);
			if (deep) return deep;
		}
		return null;
	};
	return walk(data.nodes);
}

function depthOf(entry) {
	let d = 0;
	let cur = entry;
	let guard = 0;
	while (cur.parent && guard++ < 10000) { cur = cur.parent; d++; }
	return d;
}

/* ------------------------------------------------------------------ */
/* Lineas: por que lado salen y como se curvan                         */
/* ------------------------------------------------------------------ */

const OPPOSITE_SIDE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };

// Margenes, en px del canvas, para decidir cuando una linea deja de salir por
// los costados del eje del mapa (y pasa a salir por arriba o por abajo) y
// cuando vuelve. Son distintos a proposito: asi, mientras arrastras, la linea
// no salta de un lado al otro cuando la caja pasa justo por el limite.
const SIDE_LEAVE_GAP = 12;
const SIDE_RETURN_GAP = 36;

/** Caja de un nodo vivo del canvas. */
function boxOf(node) {
	return { x: node.x, y: node.y, w: node.width || 0, h: node.height || 0 };
}

/**
 * Por que lados conviene que salga y llegue una flecha para que su curva se lea
 * limpia. `a` y `b` son las cajas {x, y, w, h} de donde sale y adonde llega;
 * `horizMap` dice si el mapa crece hacia los costados; `current` son los lados
 * que tiene ahora, para no cambiarlos de mas. Devuelve { fromSide, toSide }, o
 * null si no hay un lado mejor que otro.
 *
 * Mientras haya aire entre las dos cajas en el eje del mapa, la flecha sale por
 * las caras que se miran en ese eje, como en iThoughts, aunque una caja este
 * mucho mas arriba que la otra. Si una queda encima o debajo de la otra, sale
 * por arriba o por abajo. Si las cajas se pisan, se queda como estaba.
 */
function edgeSidesFor(a, b, horizMap, current) {
	const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
	const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
	const gapMain = horizMap ? gapX : gapY;
	const gapCross = horizMap ? gapY : gapX;
	const isHoriz = (side) => side === 'left' || side === 'right';
	const valid = !!(current && OPPOSITE_SIDE[current.fromSide] === current.toSide);
	const onMain = valid ? isHoriz(current.fromSide) === horizMap : true;
	let main;
	if (gapMain < 0 && gapCross < 0) {
		if (valid) return null; // encimadas: no hay un lado mejor que otro
		main = true;
	} else if (onMain) {
		main = !(gapMain < SIDE_LEAVE_GAP && gapCross >= SIDE_LEAVE_GAP);
	} else {
		main = gapMain >= SIDE_RETURN_GAP || gapCross < SIDE_LEAVE_GAP;
	}
	const horiz = main ? horizMap : !horizMap;
	const lo = horiz ? 'x' : 'y';
	const size = horiz ? 'w' : 'h';
	let forward;
	if (b[lo] >= a[lo] + a[size]) forward = true;
	else if (b[lo] + b[size] <= a[lo]) forward = false;
	else forward = (b[lo] + b[size] / 2) >= (a[lo] + a[size] / 2);
	if (horiz) return forward ? { fromSide: 'right', toSide: 'left' } : { fromSide: 'left', toSide: 'right' };
	return forward ? { fromSide: 'bottom', toSide: 'top' } : { fromSide: 'top', toSide: 'bottom' };
}

/**
 * Reacomoda en vivo los lados de las flechas que tocan a esos nodos, sobre los
 * objetos del canvas y sin reimportarlo: se puede llamar en cada cuadro de un
 * arrastre. No guarda el archivo. Devuelve cuantas flechas cambiaron.
 */
function fitEdgesLive(canvas, ids, horizMap) {
	if (!canvas || !canvas.edges || typeof canvas.edges.forEach !== 'function') return 0;
	const set = ids instanceof Set ? ids : new Set(ids);
	if (!set.size) return 0;
	const isGroup = (node) => !!(node.unknownData && node.unknownData.type === 'group');
	let changed = 0;
	canvas.edges.forEach((edge) => {
		const from = edge.from;
		const to = edge.to;
		if (!from || !to || !from.node || !to.node) return;
		if (!set.has(from.node.id) && !set.has(to.node.id)) return;
		if (isGroup(from.node) || isGroup(to.node)) return;
		const next = edgeSidesFor(boxOf(from.node), boxOf(to.node), horizMap, { fromSide: from.side, toSide: to.side });
		if (!next || (next.fromSide === from.side && next.toSide === to.side)) return;
		try {
			const d = edge.getData();
			d.fromSide = next.fromSide;
			d.toSide = next.toSide;
			edge.setData(d); // solo cambian los lados: Obsidian la redibuja en el proximo cuadro
			changed++;
		} catch (e) { /* noop */ }
	});
	return changed;
}

/**
 * Curva suave. Obsidian estira los dos brazos de cada curva la mitad de la
 * distancia entre los extremos, entre 70 y 150 px: entre cajas cercanas, o muy
 * desfasadas, eso hace ganchos y eses muy cerradas. Aca el brazo depende solo
 * de cuanto avanza la flecha en el sentido en que sale: sale y llega derecha, y
 * en el medio cruza en diagonal, como en iThoughts. Los extremos, las puntas y
 * los lados no cambian. Devuelve null cuando conviene dejar la de Obsidian.
 */
function smoothBezier(from, fromSide, to, toSide) {
	if (!from || !to || OPPOSITE_SIDE[fromSide] !== toSide) return null;
	const horiz = fromSide === 'left' || fromSide === 'right';
	const sign = (fromSide === 'right' || fromSide === 'bottom') ? 1 : -1;
	const ahead = (horiz ? to.x - from.x : to.y - from.y) * sign;
	if (!(ahead > 0)) return null; // la otra caja quedo atras: la de Obsidian la rodea mejor
	const arm = Math.max(12, Math.min(150, ahead / 2));
	const cp1 = horiz ? { x: from.x + sign * arm, y: from.y } : { x: from.x, y: from.y + sign * arm };
	const cp2 = horiz ? { x: to.x - sign * arm, y: to.y } : { x: to.x, y: to.y - sign * arm };
	const path = 'M' + from.x + ',' + from.y + ' C' + cp1.x + ',' + cp1.y + ' ' + cp2.x + ',' + cp2.y + ' ' + to.x + ',' + to.y;
	return { from, to, cp1, cp2, path };
}

/** Cambia el tramo curvo de una flecha ya dibujada por Obsidian por la curva suave. */
function smoothEdge(edge) {
	const bz = edge && edge.bezier;
	if (!bz || !bz.from || !bz.to || typeof bz.path !== 'string' || !edge.path || !edge.from || !edge.to) return false;
	const next = smoothBezier(bz.from, edge.from.side, bz.to, edge.to.side);
	if (!next) return false;
	let done = false;
	for (const el of [edge.path.display, edge.path.interaction]) {
		if (!el || typeof el.getAttribute !== 'function') continue;
		const d = el.getAttribute('d');
		if (typeof d !== 'string' || d.indexOf(bz.path) === -1) continue;
		el.setAttribute('d', d.replace(bz.path, next.path));
		done = true;
	}
	// la etiqueta de la flecha se ubica sobre esta curva
	if (done) edge.bezier = next;
	return done;
}

/**
 * Engancha la curva suave en el dibujo de las flechas. Envuelve un metodo
 * interno de Obsidian (updatePath, de la clase de las flechas): primero dibuja
 * Obsidian y despues, si corresponde, se cambia solo el tramo curvo. Si algo no
 * encaja (otra version de Obsidian), la linea queda como la dibujo Obsidian.
 */
function installCurvePatch(plugin, canvas) {
	if (plugin.curvePatch) return true;
	let sample = null;
	if (canvas && canvas.edges && typeof canvas.edges.forEach === 'function') canvas.edges.forEach((e) => { if (!sample) sample = e; });
	if (!sample) return false;
	const proto = Object.getPrototypeOf(sample);
	if (!proto || typeof proto.updatePath !== 'function') return false;
	const original = proto.updatePath;
	proto.updatePath = function () {
		const out = original.apply(this, arguments);
		if (plugin.settings.smoothCurves) {
			try { smoothEdge(this); } catch (e) { /* queda la de Obsidian */ }
		}
		return out;
	};
	plugin.curvePatch = { proto, original };
	redrawEdges(canvas);
	return true;
}

function removeCurvePatch(plugin) {
	const patch = plugin.curvePatch;
	if (!patch) return;
	patch.proto.updatePath = patch.original;
	plugin.curvePatch = null;
}

/** Pide que se vuelvan a dibujar todas las flechas del canvas. */
function redrawEdges(canvas) {
	if (!canvas || !canvas.edges || typeof canvas.markDirty !== 'function') return;
	try { canvas.edges.forEach((e) => canvas.markDirty(e)); } catch (e) { /* noop */ }
}

/* ------------------------------------------------------------------ */
/* Esquema (outline) del mapa                                          */
/* ------------------------------------------------------------------ */

const OUTLINE_VIEW = 'mm-outline';

/**
 * Todos los nodos del canvas, incluidos los que estan guardados dentro de
 * ramas colapsadas (marcados como `hidden`).
 */
function flattenCanvasData(data) {
	const nodes = [];
	const edges = [];
	const walk = (ns, es, hidden) => {
		for (const n of ns || []) {
			nodes.push({ data: n, hidden });
			const payload = n[PAYLOAD_KEY];
			if (payload) walk(payload.nodes, payload.edges, true);
		}
		for (const e of es || []) edges.push(e);
	};
	walk(data.nodes, data.edges, false);
	return { nodes, edges };
}

/** Busca el JSON de un nodo, este a la vista o dentro de una rama colapsada. */
function findNodeData(data, id) {
	const walk = (ns) => {
		for (const n of ns || []) {
			if (n.id === id) return n;
			const payload = n[PAYLOAD_KEY];
			if (payload) {
				const deep = walk(payload.nodes);
				if (deep) return deep;
			}
		}
		return null;
	};
	return walk(data.nodes);
}

/**
 * Como flattenCanvasData, pero anotando donde vive cada cosa: `home` es null
 * para lo que esta a la vista, o el id del nodo colapsado que lo guarda.
 * Las flechas a la vista van primero.
 */
function flattenWithHome(data) {
	const nodes = [];
	const edges = [];
	for (const e of data.edges || []) edges.push({ data: e, home: null });
	const walk = (ns, home) => {
		for (const n of ns || []) {
			nodes.push({ data: n, hidden: home !== null, home });
			const payload = n[PAYLOAD_KEY];
			if (!payload) continue;
			for (const e of payload.edges || []) edges.push({ data: e, home: n.id });
			walk(payload.nodes, n.id);
		}
	};
	walk(data.nodes, null);
	return { nodes, edges };
}

/** Arbol completo del mapa para el esquema. */
function outlineTree(data, settings, dir) {
	const horiz = dir === 'right' || dir === 'left' || dir === 'both-h';
	const flat = flattenWithHome(data);
	const items = new Map();
	for (const f of flat.nodes) {
		if (f.data.type === 'group') continue;
		items.set(f.data.id, {
			id: f.data.id,
			data: f.data,
			hidden: f.hidden,
			home: f.home,
			collapsed: !!f.data[COLLAPSED_KEY],
			children: [],
			parent: null,
			parentEdge: null,
		});
	}
	// las que no son madre-hija quedan como conexiones cruzadas
	const links = assignParents(items, flat.edges, settings, (child, parent, e) => {
		child.parentEdge = e.data;
		parent.children.push(child);
	}).map((l) => ({ from: l.from, to: l.to, edge: l.edge.data, ref: l.edge, reason: l.reason }));
	const order = (a, b) => (horiz
		? (a.data.y - b.data.y) || (a.data.x - b.data.x)
		: (a.data.x - b.data.x) || (a.data.y - b.data.y));
	items.forEach((it) => it.children.sort(order));
	const roots = [];
	items.forEach((it) => { if (!it.parent) roots.push(it); });
	roots.sort(order);

	// recorrido en profundidad, que es el orden en que se dibuja el esquema
	const rows = [];
	const walk = (it, depth) => {
		rows.push({ item: it, depth });
		for (const c of it.children) walk(c, depth + 1);
	};
	for (const r of roots) walk(r, 0);
	return { roots, items, rows, links, edges: flat.edges };
}

/** Huella barata de las flechas a la vista: cambia si se agrega, saca o reconecta alguna. */
function linkSignature(canvas) {
	const parts = [];
	canvas.edges.forEach((edge, id) => {
		const f = edge.from || {};
		const t = edge.to || {};
		const mark = edge.unknownData ? edge.unknownData[LINK_KEY] : undefined;
		parts.push(id + ':' + (f.node ? f.node.id : '') + '>' + (t.node ? t.node.id : '') + ':' + (f.end || '') + (t.end || '') + (mark || ''));
	});
	return parts.join('|');
}

/**
 * Deja marcadas en el canvas las flechas que son conexiones cruzadas (y saca la
 * marca de la que paso a ser madre). Trabaja sobre los objetos vivos, sin
 * reimportar nada, y es barato: se puede llamar todo el tiempo.
 */
function stampLinks(canvas, settings) {
	if (!canvas || !canvas.edges || !canvas.nodes || canvas.readonly) return 0;
	if (canvas.nodes.size > 3000) return 0;
	const data = safeData(canvas);
	if (!data || !Array.isArray(data.nodes)) return 0;
	const tree = outlineTree(data, settings, 'right');
	const cruzadas = new Map(tree.links.map((l) => [l.ref, l.reason]));
	let cambios = 0;
	for (const e of tree.edges) {
		const actual = e.data[LINK_KEY];
		// una marca que ya esta y sigue valiendo no se toca
		let quiero;
		if (!cruzadas.has(e)) quiero = undefined;
		else if (actual) quiero = actual;
		else quiero = cruzadas.get(e) === 'vuelta' ? 'vuelta' : true;
		if (quiero === actual) continue;
		let destino = e.data; // dentro de una rama colapsada: es el objeto guardado
		if (e.home === null) {
			// a la vista: la marca va en la flecha viva
			const live = canvas.edges.get(e.data.id);
			if (!live || !live.unknownData || typeof live.unknownData !== 'object') continue;
			destino = live.unknownData;
		}
		if (quiero === undefined) delete destino[LINK_KEY]; else destino[LINK_KEY] = quiero;
		cambios++;
	}
	if (cambios) { try { canvas.requestSave(false); } catch (err) { /* noop */ } }
	return cambios;
}

/* ------------------------------------------------------------------ */
/* Exportar: FreeMind (.mm), OPML y Markdown                           */
/* ------------------------------------------------------------------ */

/** Esta marca va dentro de cada archivo exportado: asi sabemos que es nuestro. */
const EXPORT_MARK = 'Othoughts';

/** El plugin se llamaba asi antes: sus exportaciones tambien se reconocen como propias. */
const OLD_EXPORT_MARK = 'Canvas ' + 'Mindmap ' + 'Tools';

/** Los seis colores del Canvas, como los pinta Obsidian. */
const PRESET_HEX = { '1': '#fb464c', '2': '#e9973f', '3': '#e0de71', '4': '#44cf6e', '5': '#53dfdd', '6': '#a882ff' };

function colorHex(c) {
	if (!c) return null;
	const v = String(c);
	if (PRESET_HEX[v]) return PRESET_HEX[v];
	return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

/**
 * Texto seguro para un atributo XML. Con `ascii`, todo lo que no es ASCII va
 * como referencia numerica (&#233;): el archivo se lee igual en cualquier
 * programa, adivine la codificacion que adivine.
 */
function xmlAttr(value, ascii) {
	let out = '';
	for (const ch of String(value === null || value === undefined ? '' : value)) {
		const c = ch.codePointAt(0);
		if (ch === '&') out += '&amp;';
		else if (ch === '<') out += '&lt;';
		else if (ch === '>') out += '&gt;';
		else if (ch === '"') out += '&quot;';
		else if (ch === '\n') out += '&#10;';
		else if (ch === '\t') out += ' ';
		else if (c < 32 || (c >= 0xD800 && c <= 0xDFFF) || c === 0xFFFE || c === 0xFFFF) continue;
		else if (ascii && c > 126) out += '&#' + c + ';';
		else out += ch;
	}
	return out;
}

/**
 * El mapa completo como arbol, listo para exportar: incluye lo que esta guardado
 * dentro de ramas colapsadas. Un canvas puede tener varios mapas y nodos
 * sueltos: cada uno es una raiz.
 */
function exportModel(data, settings, dir, title, vaultName) {
	const tree = outlineTree(data, settings, dir);
	const horiz = dir === 'right' || dir === 'left' || dir === 'both-h';
	const centro = (d) => (d.x || 0) + (d.width || 0) / 2;
	const conv = (it, root) => {
		const d = it.data;
		const n = {
			id: it.id,
			kind: d.type || 'text',
			text: '',
			link: null,
			file: null,
			color: colorHex(d.color),
			edgeColor: it.parentEdge ? colorHex(it.parentEdge.color) : null,
			folded: !!it.collapsed,
			side: null,
			children: [],
		};
		if (d.type === 'file') {
			const path = String(d.file || '');
			n.file = path;
			n.text = (path.split('/').pop() || path).replace(/\.md$/i, '');
			n.link = 'obsidian://open?vault=' + encodeURIComponent(vaultName || '') + '&file=' + encodeURIComponent(path);
		} else if (d.type === 'link') {
			n.text = String(d.url || '');
			n.link = n.text || null;
		} else {
			n.text = String(d.text || '');
		}
		if (horiz && it !== root && it.parent === root) n.side = centro(d) < centro(root.data) ? 'left' : 'right';
		n.children = it.children.map((c) => conv(c, root));
		return n;
	};
	const roots = tree.roots.map((r) => conv(r, r));
	const links = tree.links.map((l) => ({ from: l.from, to: l.to, color: colorHex(l.edge.color) }));
	return { title: title || t('Map'), roots, links, count: tree.rows.length };
}

/**
 * FreeMind (.mm): el formato de intercambio que abren casi todos los programas
 * de mapas mentales. Viajan el arbol, el texto, los colores, de que lado va
 * cada rama, que ramas estan plegadas, los enlaces y las conexiones cruzadas.
 */
function toFreeMind(model) {
	const out = [];
	out.push('<map version="1.0.1">');
	out.push('<!-- ' + t('Exported by {plugin} (Obsidian). FreeMind format: opens in iThoughts, XMind, Freeplane, MindManager, MindNode and SimpleMind.', { plugin: EXPORT_MARK }) + ' -->');
	const ids = new Set();
	(function collect(ns) { for (const n of ns) { ids.add(n.id); collect(n.children); } })(model.roots);
	const linksFrom = new Map();
	for (const l of model.links) {
		if (!ids.has(l.from) || !ids.has(l.to)) continue;
		if (!linksFrom.has(l.from)) linksFrom.set(l.from, []);
		linksFrom.get(l.from).push(l);
	}
	const walk = (n, depth, top) => {
		const pad = '\t'.repeat(Math.min(depth, 40));
		let a = ' ID="ID_' + xmlAttr(n.id, true) + '" TEXT="' + xmlAttr(n.text, true) + '"';
		if (top && n.side) a += ' POSITION="' + n.side + '"';
		if (n.folded && n.children.length) a += ' FOLDED="true"';
		if (n.link) a += ' LINK="' + xmlAttr(n.link, true) + '"';
		if (n.color) a += ' BACKGROUND_COLOR="' + n.color + '"';
		const inner = [];
		if (n.edgeColor) inner.push(pad + '\t<edge COLOR="' + n.edgeColor + '"/>');
		for (const l of linksFrom.get(n.id) || []) {
			inner.push(pad + '\t<arrowlink DESTINATION="ID_' + xmlAttr(l.to, true) + '"'
				+ (l.color ? ' COLOR="' + l.color + '"' : '') + ' STARTARROW="None" ENDARROW="Default"/>');
		}
		if (!inner.length && !n.children.length) { out.push(pad + '<node' + a + '/>'); return; }
		out.push(pad + '<node' + a + '>');
		for (const line of inner) out.push(line);
		for (const c of n.children) walk(c, depth + 1, false);
		out.push(pad + '</node>');
	};
	const cabeza = (root) => {
		let a = ' ID="ID_' + xmlAttr(root.id, true) + '" TEXT="' + xmlAttr(root.text, true) + '"';
		if (root.link) a += ' LINK="' + xmlAttr(root.link, true) + '"';
		if (root.color) a += ' BACKGROUND_COLOR="' + root.color + '"';
		out.push('<node' + a + '>');
		for (const l of linksFrom.get(root.id) || []) {
			out.push('	<arrowlink DESTINATION="ID_' + xmlAttr(l.to, true) + '"'
				+ (l.color ? ' COLOR="' + l.color + '"' : '') + ' STARTARROW="None" ENDARROW="Default"/>');
		}
	};
	// FreeMind admite una sola raiz. Un canvas puede tener un mapa y ademas
	// nodos sueltos (apuntes, imagenes), o varios mapas.
	const mapas = model.roots.filter((r) => r.children.length);
	const sueltos = model.roots.filter((r) => !r.children.length);
	if (mapas.length === 1) {
		// un mapa: su raiz es la raiz del archivo y las ramas conservan su lado.
		// Lo suelto no se pierde: va en una rama aparte, plegada.
		const root = mapas[0];
		cabeza(root);
		for (const c of root.children) walk(c, 1, true);
		if (sueltos.length) {
			out.push('\t<node ID="ID_sueltos" TEXT="' + xmlAttr(t('Loose cards'), true) + '" POSITION="right" FOLDED="true">');
			for (const r of sueltos) walk(r, 2, false);
			out.push('	</node>');
		}
		out.push('</node>');
	} else if (model.roots.length === 1) {
		cabeza(model.roots[0]);
		out.push('</node>');
	} else {
		// varios mapas (o ninguno, solo nodos sueltos): cuelgan todos de un nodo
		// con el nombre del canvas
		out.push('<node ID="ID_mapa" TEXT="' + xmlAttr(model.title, true) + '">');
		for (const r of model.roots) walk(r, 1, false);
		out.push('</node>');
	}
	out.push('</map>');
	return out.join('\n') + '\n';
}

/** OPML: el formato universal de esquemas. */
function toOpml(model) {
	const out = [];
	out.push('<?xml version="1.0" encoding="UTF-8"?>');
	out.push('<opml version="2.0">');
	out.push('\t<!-- ' + t('Exported by {plugin} (Obsidian).', { plugin: EXPORT_MARK }) + ' -->');
	out.push('\t<head>');
	out.push('\t\t<title>' + xmlAttr(model.title) + '</title>');
	out.push('\t</head>');
	out.push('\t<body>');
	const walk = (n, depth) => {
		const pad = '\t'.repeat(Math.min(depth, 40));
		let a = ' text="' + xmlAttr(n.text) + '"';
		if (n.kind === 'link' && n.link) a += ' type="link" url="' + xmlAttr(n.link) + '"';
		if (n.kind === 'file' && n.file) a += ' _note="' + xmlAttr(t('Obsidian note: {path}', { path: n.file })) + '"';
		if (!n.children.length) { out.push(pad + '<outline' + a + '/>'); return; }
		out.push(pad + '<outline' + a + '>');
		for (const c of n.children) walk(c, depth + 1);
		out.push(pad + '</outline>');
	};
	for (const r of model.roots) walk(r, 2);
	out.push('\t</body>');
	out.push('</opml>');
	return out.join('\n') + '\n';
}

/**
 * El esquema como lista de Markdown con sangrias. Las notas van como
 * [[enlaces]] y los links como <url>. `bare` = sin la linea final que marca el
 * archivo como exportado (para copiar al portapapeles).
 */
function toMarkdown(model, bare) {
	const lines = [];
	const walk = (n, depth) => {
		const pad = '\t'.repeat(Math.min(depth, 40));
		let body;
		if (n.kind === 'file') body = '[[' + String(n.file || n.text).replace(/\.md$/i, '') + ']]';
		else if (n.kind === 'link') body = n.text ? '<' + n.text + '>' : '';
		else body = n.text;
		const partes = String(body || '').replace(/\r/g, '').split('\n').map((x) => x.trim()).filter((x) => x.length);
		if (!partes.length) partes.push(t('(no text)'));
		// el renglon del item no puede empezar con una marca de titulo o de lista
		partes[0] = partes[0].replace(/^(#{1,6}|>+|[-*+]|\d+[.)])\s+/, '');
		lines.push(pad + '- ' + partes[0]);
		for (let i = 1; i < partes.length; i++) lines.push(pad + '  ' + partes[i]);
		for (const c of n.children) walk(c, depth + 1);
	};
	for (const r of model.roots) walk(r, 0);
	let text = lines.join('\n') + '\n';
	if (!bare) {
		text += '\n<!-- ' + t('Outline exported by {plugin} from "{name}.canvas". Exporting again replaces this file.', { plugin: EXPORT_MARK, name: model.title }) + ' -->\n';
	}
	return text;
}

const EXPORT_FORMATS = lazyLabels({
	mm: { label: 'FreeMind (.mm)', short: L('Map .mm'), hint: L('mind map: opens in iThoughts, XMind, Freeplane, MindManager, MindNode'), ext: '.mm', suffix: '', build: toFreeMind },
	opml: { label: 'OPML', short: 'OPML', hint: L('universal outline: iThoughts, OmniOutliner, Logseq, Workflowy, Word'), ext: '.opml', suffix: '', build: toOpml },
	md: { label: 'Markdown', short: 'Markdown', hint: L('the outline as an indented list, in a note next to the canvas'), ext: '.md', suffix: '', build: (m) => toMarkdown(m, false) },
});
// el nombre del archivo del esquema tambien va en el idioma elegido: "Mapa (esquema).md"
Object.defineProperty(EXPORT_FORMATS.md, 'suffix', { enumerable: true, get: () => ' (' + t('outline') + ')' });

/* ------------------------------------------------------------------ */
/* Estilos de flecha + decoraciones                                    */
/* ------------------------------------------------------------------ */

const EDGE_STYLE_CLASSES = {
	solid: null,
	dashed: 'mm-edge-dashed',
	dotted: 'mm-edge-dotted',
	thick: 'mm-edge-thick',
};
const EDGE_STYLE_ORDER = ['solid', 'dashed', 'dotted', 'thick'];
const EDGE_STYLE_LABELS = lazyLabels({
	solid: L('Solid line'),
	dashed: L('Dashed line'),
	dotted: L('Dotted line'),
	thick: L('Thick line'),
}, true);
const ARROW_PRESETS = lazyLabels({
	forward: { fromEnd: 'none', toEnd: 'arrow', label: L('One arrowhead  ->') },
	backward: { fromEnd: 'arrow', toEnd: 'none', label: L('Reversed arrowhead  <-') },
	both: { fromEnd: 'arrow', toEnd: 'arrow', label: L('Two arrowheads  <->') },
	none: { fromEnd: 'none', toEnd: 'none', label: L('No arrowheads  --') },
});
const ALL_EDGE_CLASSES = ['mm-edge-dashed', 'mm-edge-dotted', 'mm-edge-thick'];

function edgeElements(edge) {
	const els = [];
	const push = (el) => { if (el && el.classList) els.push(el); };
	// Solo el grupo de la linea: el grupo de la punta de flecha se deja intacto.
	if (edge.lineGroupEl) push(edge.lineGroupEl);
	else push(edge.el);
	if (edge.path) { push(edge.path.display); push(edge.path.interaction); }
	return els;
}

/** Hacia donde estan los hijos: define de que lado va el boton. */
function childrenDirection(entry) {
	const pts = [];
	if (entry.children.length) {
		for (const c of entry.children) pts.push({ x: c.x + c.w / 2, y: c.y + c.h / 2 });
	} else {
		const payload = entry.data[PAYLOAD_KEY];
		if (payload && Array.isArray(payload.nodes)) {
			for (const n of payload.nodes) pts.push({ x: n.x + (n.width || 0) / 2, y: n.y + (n.height || 0) / 2 });
		}
	}
	if (!pts.length) return 'right';
	const cx = entry.x + entry.w / 2;
	const cy = entry.y + entry.h / 2;
	let dx = 0;
	let dy = 0;
	for (const p of pts) { dx += p.x - cx; dy += p.y - cy; }
	if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
	return dy >= 0 ? 'bottom' : 'top';
}

/** Boton de colapsar/expandir pegado al nodo. */
function updateToggle(plugin, node, el, entry, collapsed, count) {
	let btn = el.querySelector(':scope > .mm-toggle');
	if (!btn) {
		btn = document.createElement('div');
		btn.className = 'mm-toggle';
		btn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
		btn.addEventListener('click', (e) => {
			e.stopPropagation();
			e.preventDefault();
			plugin.toggleCollapse(node);
		});
		el.appendChild(btn);
	}
	const side = childrenDirection(entry);
	const cls = 'mm-toggle mm-toggle-' + side + (collapsed ? ' is-collapsed' : '');
	if (btn.className !== cls) btn.className = cls;
	const text = collapsed ? String(count) : '−';
	if (btn.textContent !== text) btn.textContent = text;
	const tip = collapsed ? t('Expand branch ({n} cards)', { n: count }) : t('Collapse branch');
	if (btn.getAttribute('aria-label') !== tip) {
		btn.setAttribute('aria-label', tip);
		btn.setAttribute('title', tip);
	}
}

/**
 * Tamano de letra base, en px. Obsidian no dibuja el texto a partir de
 * --font-text-size (eso es solo un token): le pone un font-size concreto al
 * elemento raiz y todo lo demas lo hereda. Asi que ese es el tamano real.
 */
function baseFontSize() {
	try {
		const raiz = parseFloat(getComputedStyle(document.documentElement).fontSize);
		if (raiz && isFinite(raiz)) return raiz;
	} catch (e) { /* noop */ }
	try {
		const raw = getComputedStyle(document.body).getPropertyValue('--font-text-size');
		const n = parseFloat(raw);
		if (n && isFinite(n)) return n;
	} catch (e) { /* noop */ }
	return 16;
}

/**
 * Pone el tamano de letra de un nodo. Obsidian hereda el texto del font-size
 * del elemento raiz, asi que no alcanza con cambiar variables: le damos un
 * font-size concreto (via --mm-font-px, que usa styles.css) al contenido de la
 * caja, y lo mismo adentro del iframe donde Obsidian 1.15 dibuja ese texto.
 * Los titulos de markdown vienen en em, asi que acompanan solos.
 */
function applyFontScale(el, scale, base, bump) {
	const s = scale && scale > 0 ? scale : 1;
	const extra = Number(bump) || 0;
	const propio = s !== 1 || extra !== 0;
	const px = propio ? nodeFontPx(base, s, extra).toFixed(1) + 'px' : null;
	applyFontToFrames(el, px);
	if (propio) {
		el.classList.add('mm-font');
		el.style.setProperty('--mm-font-px', px);
		el.style.setProperty('--font-text-size', px);
	} else if (el.classList.contains('mm-font')) {
		el.classList.remove('mm-font');
		el.style.removeProperty('--mm-font-px');
		el.style.removeProperty('--font-text-size');
	}
	// mm-scaled solo marca "este nodo lo estiraste con el cuadradito"
	if (s !== 1) el.classList.add('mm-scaled');
	else if (el.classList.contains('mm-scaled')) el.classList.remove('mm-scaled');
}

/** Pone (o saca) el tamano de letra dentro de los iframes de una caja. */
function applyFontToFrames(el, px) {
	let frames;
	try {
		frames = typeof el.querySelectorAll === 'function' ? el.querySelectorAll('iframe') : null;
	} catch (e) { return; }
	if (!frames || !frames.length) return;
	for (const frame of frames) {
		try {
			const doc = frame.contentDocument;
			const body = doc && doc.body;
			if (!body || !body.style) continue;
			const raiz = doc.documentElement;
			if (px) {
				// el texto del iframe hereda del font-size de su raiz, igual que afuera
				if (raiz && raiz.style && raiz.style.getPropertyValue('font-size') !== px) raiz.style.setProperty('font-size', px);
				if (body.style.getPropertyValue('--font-text-size') !== px) body.style.setProperty('--font-text-size', px);
			} else {
				if (raiz && raiz.style && raiz.style.getPropertyValue('font-size')) raiz.style.removeProperty('font-size');
				if (body.style.getPropertyValue('--font-text-size')) body.style.removeProperty('--font-text-size');
			}
		} catch (e) { /* un iframe de otro origen: no es nuestro */ }
	}
}

/**
 * Cuanto mas grande va la letra segun el nivel del nodo, como en iThoughts
 * (sus estilos traen 36 px para la raiz, 24 para las ramas y 18 para abajo).
 * Aca es moderado, para que el texto no se salga de las cajas que ya tenes.
 */
const FONT_LEVEL = { '0': 1.35, '1': 1.15, '2': 1, x: 1, g: 1 };

/** Tamano de letra de un nodo: el del tema, mas los px de mas, por su escala. */
function nodeFontPx(base, scale, bump) {
	const s = scale && scale > 0 ? scale : 1;
	return Math.max(6, ((base || 16) + (Number(bump) || 0)) * s);
}

/** Punto de abajo a la izquierda: estira caja y letra a la vez. */
function updateGrip(node, el) {
	let grip = el.querySelector(':scope > .mm-grip');
	if (grip) return;
	grip = document.createElement('div');
	grip.className = 'mm-grip';
	const tip = t('Drag to scale the card and its text together');
	grip.setAttribute('aria-label', tip);
	grip.setAttribute('title', tip);
	el.appendChild(grip);
}

function removeGrip(el) {
	const grip = el.querySelector(':scope > .mm-grip');
	if (grip) grip.remove();
}

function removeToggle(el) {
	const btn = el.querySelector(':scope > .mm-toggle');
	if (btn) btn.remove();
}

function syncDecorations(canvas, settings, plugin) {
	if (!canvas) return;
	try {
		const conTema = !!(plugin && typeof plugin.themeOf === 'function' && plugin.themeOf(canvas) !== 'ninguno');
		const graph = (plugin && (settings.showBadge || conTema || settings.fontLevels) && canvas.nodes.size <= 600)
			? buildGraph(canvas, settings) : null;
		const base = baseFontSize();
		const niveles = (graph && settings.fontLevels) ? themeInfo(graph) : null;
		canvas.nodes.forEach((node) => {
			const el = node.nodeEl || node.containerEl;
			if (!el || !el.classList) return;
			const d = safeData(node);
			const collapsed = !!(d && d[COLLAPSED_KEY]);
			el.classList.toggle('mm-collapsed', collapsed);
			// mientras estas estirando el nodo mandan los valores en vivo
			if (!el.classList.contains('mm-gripping')) {
				const propia = Number(d && d[FONT_KEY]) || 1;
				const nivel = niveles && niveles.get(node.id);
				const porNivel = nivel ? (FONT_LEVEL[nivel.lvl] || 1) : 1;
				applyFontScale(el, propia * porNivel, base, settings.fontBump);
			}
			if (settings.sizeGrip && d && d.type !== 'group') updateGrip(node, el);
			else removeGrip(el);
			const entry = graph ? graph.nodes.get(node.id) : null;
			const hasBranch = settings.showBadge && entry && (collapsed || entry.children.length > 0);
			if (hasBranch) {
				const payload = d[PAYLOAD_KEY];
				const count = payload && Array.isArray(payload.nodes) ? payload.nodes.length : 0;
				updateToggle(plugin, node, el, entry, collapsed, count);
			} else {
				removeToggle(el);
			}
		});
		canvas.edges.forEach((edge) => {
			const d = safeData(edge);
			const style = (d && d[STYLE_KEY]) || 'solid';
			const cls = EDGE_STYLE_CLASSES[style] || null;
			for (const el of edgeElements(edge)) {
				for (const c of ALL_EDGE_CLASSES) {
					if (c !== cls && el.classList.contains(c)) el.classList.remove(c);
				}
				if (cls && !el.classList.contains(cls)) el.classList.add(cls);
			}
		});
		if (plugin && typeof plugin.applyTheme === 'function') plugin.applyTheme(canvas, graph);
	} catch (e) { /* el canvas puede estar re-renderizando */ }
}

function selectNodes(canvas, nodes) {
	try {
		if (typeof canvas.deselectAll === 'function') canvas.deselectAll();
		else if (canvas.selection && typeof canvas.selection.clear === 'function') canvas.selection.clear();
		for (const n of nodes) {
			if (typeof canvas.select === 'function') canvas.select(n);
			else if (canvas.selection) canvas.selection.add(n);
		}
		if (typeof canvas.requestFrame === 'function') canvas.requestFrame();
	} catch (e) { /* noop */ }
}

/* ------------------------------------------------------------------ */
/* Arrastre de rama completa                                           */
/* ------------------------------------------------------------------ */

const DROP_CLASSES = ['mm-drop-child', 'mm-drop-before', 'mm-drop-after', 'mm-drop-x'];

class BranchDrag {
	constructor(plugin) {
		this.plugin = plugin;
		this.canvas = null;
		this.moving = null;      // descendientes que viajan con la seleccion
		this.dragged = null;     // ids que se estan arrastrando (no pueden ser destino)
		this.anchor = null;
		this.graph = null;       // arbol al empezar el arrastre
		this.drop = null;        // { node, zone }
		this.frame = null;
		this.dirty = false;
		this.onPointerDown = this.onPointerDown.bind(this);
		this.onPointerUp = this.onPointerUp.bind(this);
		this.tick = this.tick.bind(this);
	}

	modifierOk(evt) {
		const mod = this.plugin.settings.dragModifier;
		if (mod === 'alt') return !!evt.altKey;
		if (mod === 'shift') return !!evt.shiftKey;
		if (mod === 'ctrl') return !!(evt.ctrlKey || evt.metaKey);
		return !evt.altKey; // 'none': activo siempre, salvo que se mantenga Alt
	}

	onPointerDown(evt) {
		const s = this.plugin.settings;
		if (!s.dragBranch && !s.dropToReparent) return;
		if (evt.button !== 0) return;
		const target = evt.target;
		if (!target || typeof target.closest !== 'function') return;
		if (!target.closest('.canvas-node')) return;
		if (target.closest('.canvas-node-resizer')) return;          // redimensionar
		if (target.closest('.canvas-node-connection-point')) return; // sacar una flecha
		if (target.closest('.mm-toggle')) return;                    // boton de colapsar
		if (target.closest('.mm-grip')) return;                      // punto de estirar
		if (target.closest('.canvas-node-content.is-editing')) return;
		if (!this.modifierOk(evt)) return;
		const canvas = getCanvas(this.plugin.app);
		if (!canvas) return;
		this.canvas = canvas;
		this.plugin.prepare(canvas); // si el mapa se estaba reacomodando, que termine antes de agarrar nada
		// el nodo que apretaste: si no estaba seleccionado, es el que manda
		this.pressedEl = target.closest('.canvas-node');
		// La seleccion se resuelve recien despues del pointerdown de Obsidian.
		window.setTimeout(() => this.begin(), 0);
		window.addEventListener('pointerup', this.onPointerUp, { once: true, capture: true });
	}

	begin() {
		const canvas = this.canvas;
		if (!canvas) return;
		const graph = buildGraph(canvas, this.plugin.settings);
		let sel = selectedNodes(canvas);
		// Si arrastras un nodo que no estaba seleccionado, Obsidian lo selecciona
		// recien cuando empieza a moverse: mandamos por el que apretaste.
		let pressed = null;
		if (this.pressedEl) canvas.nodes.forEach((n) => { if (n.nodeEl === this.pressedEl) pressed = n; });
		if (pressed && sel.indexOf(pressed) === -1) sel = [pressed];
		if (!sel.length) return;
		const selIds = new Set(sel.map((n) => n.id));
		const moving = new Map();
		const dragged = new Set(selIds);
		for (const id of selIds) {
			const entry = graph.nodes.get(id);
			if (!entry) continue;
			for (const d of subtreeOf(entry, false)) {
				dragged.add(d.id);
				if (selIds.has(d.id) || moving.has(d.id)) continue;
				moving.set(d.id, { node: d.node, sx: d.node.x, sy: d.node.y });
			}
		}
		const first = graph.nodes.get((pressed || sel[0]).id);
		if (!first) return;
		this.graph = graph;
		this.anchor = { node: first.node, sx: first.node.x, sy: first.node.y };
		this.moving = this.plugin.settings.dragBranch ? moving : new Map();
		this.dragged = dragged;
		this.selection = sel;
		this.dirty = false;
		this.frame = window.requestAnimationFrame(this.tick);
	}

	/**
	 * Nodo al que se va a enganchar la rama. Se decide por CERCANIA de las cajas,
	 * no por donde este el cursor: al arrastrar, la caja tapa al cursor y apuntar
	 * se vuelve imposible.
	 *   alineado con la caja  -> pasa a ser su hijo
	 *   por encima / debajo   -> queda como hermano
	 */
	findDropTarget() {
		const plugin = this.plugin;
		if (!plugin.settings.dropToReparent || !this.canvas || !this.anchor) return null;
		const dragged = this.anchor.node;
		const dx = dragged.x;
		const dy = dragged.y;
		const dw = dragged.width || 250;
		const dh = dragged.height || 60;
		const cx = dx + dw / 2;
		const cy = dy + dh / 2;
		const st = plugin.mapState(this.canvas);
		const vertical = st.dir === 'down' || st.dir === 'up' || st.dir === 'both-v';
		const tol = Math.max(70, plugin.settings.siblingGap * 2);
		// Dos tarjetas sueltas que quedan cerca no se enganchan solas: eso solo pasa
		// cuando hay un mapa de por medio (la que arrastras o la de destino ya
		// tienen madre o hijos). Asi el plugin no molesta en un canvas comun.
		const enMapa = (id) => {
			const e = this.graph ? this.graph.nodes.get(id) : null;
			return !!(e && (e.parent || e.children.length));
		};
		const arrastradaEnMapa = enMapa(dragged.id);
		let best = null;
		this.canvas.nodes.forEach((node) => {
			if (this.dragged && this.dragged.has(node.id)) return;
			if (!arrastradaEnMapa && !enMapa(node.id)) return;
			const d = safeData(node);
			if (!d || d.type === 'group') return;
			const nx = node.x;
			const ny = node.y;
			const nw = node.width || 250;
			const nh = node.height || 60;
			const gapX = Math.max(nx - (dx + dw), dx - (nx + nw), 0);
			const gapY = Math.max(ny - (dy + dh), dy - (ny + nh), 0);
			if (gapX > tol || gapY > tol) return;
			const score = gapX + gapY;
			if (best && score >= best.score) return;
			let zone;
			if (vertical) zone = (cx >= nx && cx <= nx + nw) ? 'child' : (cx < nx ? 'before' : 'after');
			else zone = (cy >= ny && cy <= ny + nh) ? 'child' : (cy < ny ? 'before' : 'after');
			best = { node, zone, score };
		});
		if (!best) return null;
		// si soltarlo ahi no cambia nada (ya cuelga de ese padre) no marcamos nada
		const entry = this.graph ? this.graph.nodes.get(dragged.id) : null;
		if (best.zone === 'child' && entry && entry.parent && entry.parent.id === best.node.id) return null;
		const el = best.node.nodeEl;
		if (!el || !el.classList) return null;
		return { node: best.node, el, zone: best.zone, vertical };
	}

	showDropHint(drop) {
		const prev = this.drop;
		if (prev && (!drop || prev.el !== drop.el || prev.zone !== drop.zone)) {
			prev.el.classList.remove.apply(prev.el.classList, DROP_CLASSES);
		}
		if (drop && (!prev || prev.el !== drop.el || prev.zone !== drop.zone)) {
			drop.el.classList.remove.apply(drop.el.classList, DROP_CLASSES);
			drop.el.classList.add('mm-drop-' + drop.zone);
			if (drop.vertical && drop.zone !== 'child') drop.el.classList.add('mm-drop-x');
		}
		this.drop = drop;
	}

	clearDropHint() {
		if (this.drop) this.drop.el.classList.remove.apply(this.drop.el.classList, DROP_CLASSES);
		this.drop = null;
	}

	tick() {
		if (!this.anchor) return;
		const dx = this.anchor.node.x - this.anchor.sx;
		const dy = this.anchor.node.y - this.anchor.sy;
		if (dx !== 0 || dy !== 0) {
			if (this.moving && this.moving.size) {
				this.moving.forEach((m) => moveNodeTo(m.node, m.sx + dx, m.sy + dy));
				try { if (this.canvas && typeof this.canvas.requestFrame === 'function') this.canvas.requestFrame(); } catch (e) { /* noop */ }
			}
			this.dirty = true;
			// un empujoncito para acomodar no tiene que reenganchar nada
			const lejos = Math.abs(dx) + Math.abs(dy) >= 25;
			this.showDropHint(lejos ? this.findDropTarget() : null);
		}
		this.frame = window.requestAnimationFrame(this.tick);
	}

	onPointerUp() {
		if (this.frame !== null) window.cancelAnimationFrame(this.frame);
		this.frame = null;
		const canvas = this.canvas;
		const drop = this.drop;
		const selection = this.selection;
		this.clearDropHint();
		if (this.dirty && canvas) {
			try { canvas.requestSave(); } catch (e) { /* noop */ }
			let reparented = false;
			if (drop && selection && selection.length) {
				try {
					reparented = this.plugin.reparentTo(canvas, selection.map((n) => n.id), drop.node.id, drop.zone);
				} catch (e) { console.error('[Othoughts] could not attach the branch', e); }
			}
			if (!reparented) {
				try { this.plugin.flipCrossedBranches(canvas, this.graph, selection); } catch (e) { /* noop */ }
				try { this.plugin.autoRelayout(canvas, 'move'); } catch (e) { /* noop */ }
			}
		}
		this.moving = null;
		this.dragged = null;
		this.anchor = null;
		this.graph = null;
		this.selection = null;
		this.pressedEl = null;
		this.dirty = false;
		this.canvas = null;
	}

	destroy() {
		if (this.frame !== null) window.cancelAnimationFrame(this.frame);
		this.frame = null;
		this.clearDropHint();
		window.removeEventListener('pointerup', this.onPointerUp, { capture: true });
	}
}

/* ------------------------------------------------------------------ */
/* Vista del esquema                                                   */
/* ------------------------------------------------------------------ */

class OutlineView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.signature = '';
		this.rows = new Map();
	}

	getViewType() { return OUTLINE_VIEW; }
	getDisplayText() { return t('Map outline'); }
	getIcon() { return 'list-tree'; }

	async onOpen() {
		this.contentEl.classList.add('mm-outline');
		this.contentEl.textContent = '';
		this.headerEl = document.createElement('div');
		this.headerEl.className = 'mm-outline-header';
		this.titleEl = document.createElement('div');
		this.titleEl.className = 'mm-outline-title';
		this.headerEl.appendChild(this.titleEl);
		const tools = document.createElement('div');
		tools.className = 'mm-outline-tools';
		const boton = (texto, tip, fn) => {
			const b = document.createElement('button');
			b.className = 'mm-outline-btn';
			b.type = 'button';
			b.textContent = texto;
			b.setAttribute('title', tip);
			b.setAttribute('aria-label', tip);
			b.addEventListener('click', (e) => { e.preventDefault(); fn(); });
			tools.appendChild(b);
		};
		boton(t('Copy'), t('Copy the outline as a Markdown list'), () => this.plugin.copyOutline());
		for (const k of ['md', 'opml', 'mm']) {
			boton(EXPORT_FORMATS[k].short, t('Export to {format}: {hint}', { format: EXPORT_FORMATS[k].label, hint: EXPORT_FORMATS[k].hint }), () => this.plugin.exportMap(k));
		}
		this.headerEl.appendChild(tools);
		this.listEl = document.createElement('div');
		this.listEl.className = 'mm-outline-list';
		this.contentEl.appendChild(this.headerEl);
		this.contentEl.appendChild(this.listEl);
		this.registerInterval(window.setInterval(() => this.refresh(), 600));
		this.refresh(true);
	}

	async onClose() {
		this.rows.clear();
	}

	/** No repintar mientras estas escribiendo dentro del esquema. */
	isEditingHere() {
		try {
			return this.contentEl.contains(document.activeElement)
				&& document.activeElement.classList.contains('mm-outline-text');
		} catch (e) {
			return false;
		}
	}

	refresh(force) {
		if (!this.listEl) return;
		if (!force && this.isEditingHere()) return;
		const canvas = getCanvas(this.plugin.app);
		if (!canvas) {
			if (this.signature === '__vacio__') return;
			this.signature = '__vacio__';
			this.titleEl.textContent = '';
			this.listEl.textContent = '';
			const empty = document.createElement('div');
			empty.className = 'mm-outline-empty';
			empty.textContent = t('Open a canvas to see its outline.');
			this.listEl.appendChild(empty);
			return;
		}
		const data = safeData(canvas);
		if (!data) return;
		const st = this.plugin.mapState(canvas);
		const model = outlineTree(data, this.plugin.settings, st.dir);
		const sign = canvasFilePath(canvas) + '|' + model.rows.map((r) =>
			r.item.id + ':' + r.depth + ':' + (r.item.collapsed ? 'c' : '') + (r.item.hidden ? 'h' : '')
			+ ':' + nodeLabel(r.item.data)).join('\n');
		if (!force && sign === this.signature) { this.markSelection(canvas); return; }
		this.signature = sign;
		this.render(canvas, model);
		this.markSelection(canvas);
	}

	render(canvas, model) {
		const path = canvasFilePath(canvas);
		this.titleEl.textContent = path ? path.split('/').pop().replace(/\.canvas$/, '') : 'Canvas';
		this.listEl.textContent = '';
		this.rows.clear();
		if (!model.rows.length) {
			const empty = document.createElement('div');
			empty.className = 'mm-outline-empty';
			empty.textContent = t('This canvas has no cards yet.');
			this.listEl.appendChild(empty);
			return;
		}
		for (const row of model.rows) this.listEl.appendChild(this.renderRow(canvas, row));
	}

	renderRow(canvas, row) {
		const it = row.item;
		const el = document.createElement('div');
		el.className = 'mm-outline-row';
		if (it.hidden) el.classList.add('is-hidden-branch');
		el.style.setProperty('--mm-depth', String(row.depth)); // la sangria la calcula styles.css
		el.setAttribute('data-id', it.id);

		const arrow = document.createElement('div');
		arrow.className = 'mm-outline-arrow';
		if (it.collapsed) arrow.textContent = '▸';
		else if (it.children.length) arrow.textContent = '▾';
		else arrow.textContent = '·';
		if (!it.hidden && (it.collapsed || it.children.length)) {
			arrow.classList.add('is-clickable');
			arrow.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const node = canvas.nodes.get(it.id);
				if (node) this.plugin.toggleCollapse(node);
				this.refresh(true);
			});
		}
		el.appendChild(arrow);

		const text = document.createElement('div');
		text.className = 'mm-outline-text';
		text.textContent = nodeLabel(it.data);
		const editable = it.data.type === 'text' && !it.hidden;
		if (editable) {
			text.setAttribute('contenteditable', 'true');
			text.spellcheck = false;
		} else {
			text.classList.add('is-readonly');
		}
		// A la vista va el texto limpio; al entrar a editar, el texto real del nodo
		// (con su Markdown). Al salir solo se guarda si de verdad lo cambiaste:
		// pasar por una fila, o recorrerlas con las flechas, no toca nada.
		text.addEventListener('focus', () => {
			const row = this.rows.get(it.id);
			if (editable && row && text.textContent !== row.raw) text.textContent = row.raw;
			this.select(canvas, it, false);
		});
		text.addEventListener('blur', () => this.commit(it.id, text));
		text.addEventListener('keydown', (e) => this.onRowKey(e, it, text));
		el.appendChild(text);

		if (it.collapsed) {
			const payload = it.data[PAYLOAD_KEY];
			const count = payload && Array.isArray(payload.nodes) ? payload.nodes.length : 0;
			const badge = document.createElement('div');
			badge.className = 'mm-outline-count';
			badge.textContent = '+' + count;
			el.appendChild(badge);
		}

		el.addEventListener('click', (e) => {
			if (e.target === text || e.target === arrow) return;
			this.select(canvas, it, true);
		});
		this.rows.set(it.id, { el, text, item: it, editable, raw: String(it.data.text || '') });
		return el;
	}

	/** Marca en el esquema lo que esta seleccionado en el canvas. */
	markSelection(canvas) {
		const selected = new Set(selectedNodes(canvas).map((n) => n.id));
		this.rows.forEach((row, id) => {
			row.el.classList.toggle('is-selected', selected.has(id));
		});
	}

	select(canvas, item, zoom) {
		if (item.hidden) {
			// esta guardado dentro de una rama colapsada: primero abrimos la rama
			let cur = item.parent;
			let target = null;
			while (cur) { if (cur.collapsed) target = cur; cur = cur.parent; }
			if (target) {
				const node = canvas.nodes.get(target.id);
				if (node) this.plugin.toggleCollapse(node);
				this.refresh(true);
			}
			return;
		}
		const node = canvas.nodes.get(item.id);
		if (!node) return;
		try { if (typeof canvas.selectOnly === 'function') canvas.selectOnly(node); } catch (e) { /* noop */ }
		if (zoom) {
			try { if (typeof canvas.zoomToSelection === 'function') canvas.zoomToSelection(); } catch (e) { /* noop */ }
		}
	}

	commit(id, textEl) {
		const row = this.rows.get(id);
		if (!row || !row.editable) return false;
		const leido = typeof textEl.innerText === 'string' ? textEl.innerText : textEl.textContent;
		const value = String(leido || '').replace(/\r/g, '').replace(/\u00a0/g, ' ').trim();
		if (value === row.raw.trim()) {
			// no cambio nada: vuelve a mostrarse limpio y el nodo queda como estaba
			const limpio = nodeLabel(row.item.data);
			if (textEl.textContent !== limpio) textEl.textContent = limpio;
			return false;
		}
		const canvas = getCanvas(this.plugin.app);
		if (!canvas) return false;
		if (!this.plugin.setNodeText(canvas, id, value)) return false;
		row.raw = value;
		this.signature = '';
		return true;
	}

	onRowKey(evt, item, textEl) {
		const canvas = getCanvas(this.plugin.app);
		if (!canvas) return;
		if (evt.key === 'Escape') {
			evt.preventDefault();
			textEl.blur();
			return;
		}
		if (evt.key === 'ArrowUp' || evt.key === 'ArrowDown') {
			const ids = Array.from(this.rows.keys());
			const i = ids.indexOf(item.id);
			const next = this.rows.get(ids[i + (evt.key === 'ArrowDown' ? 1 : -1)]);
			if (next) {
				evt.preventDefault();
				next.text.focus();
			}
			return;
		}
		if (evt.key === 'Enter' && !evt.shiftKey) {
			// Enter crea un hermano, igual que en el canvas
			evt.preventDefault();
			this.commit(item.id, textEl);
			const id = this.plugin.addNode('sibling', { baseId: item.id, edit: false });
			this.refresh(true);
			const row = id ? this.rows.get(id) : null;
			if (row) row.text.focus();
			return;
		}
		if (evt.key === 'Tab') {
			// Tab indenta (pasa a ser hijo del hermano de arriba); Shift+Tab desindenta
			evt.preventDefault();
			this.commit(item.id, textEl);
			const parent = item.parent;
			if (evt.shiftKey) {
				if (!parent) return;
				this.plugin.reparentTo(canvas, [item.id], parent.id, 'after');
			} else {
				const list = parent ? parent.children : [];
				const i = list.indexOf(item);
				const prev = i > 0 ? list[i - 1] : null;
				if (!prev) return;
				this.plugin.reparentTo(canvas, [item.id], prev.id, 'child');
			}
			this.refresh(true);
			const row = this.rows.get(item.id);
			if (row) row.text.focus();
		}
	}
}

/* ------------------------------------------------------------------ */
/* Instantaneas: el mapa como estaba en un momento dado                */
/* ------------------------------------------------------------------ */

/*
 * Cada instantanea es un canvas comun, guardado en
 *   <carpeta de instantaneas>/<ruta del canvas, sin .canvas>/<fecha y hora> — <nombre>.canvas
 * Asi se puede abrir como cualquier canvas (se abre en solo lectura), se ve en
 * el explorador de archivos y viaja con la boveda. El nombre del archivo lleva
 * la fecha: no hace falta ningun indice aparte que se pueda perder.
 */

const SNAPSHOTS_VIEW = 'mm-snapshots';
const SNAP_SEPARATOR = ' — ';
const SNAP_NAME = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})\.(\d{2})(?:\.(\d{2}))?(?: — (.*))?$/;

/** Fecha y hora para el nombre del archivo: 2026-11-22 14.30 (sin ":", que Windows no acepta). */
function snapshotStamp(date, withSeconds) {
	const p = (n) => String(n).padStart(2, '0');
	return date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate())
		+ ' ' + p(date.getHours()) + '.' + p(date.getMinutes()) + (withSeconds ? '.' + p(date.getSeconds()) : '');
}

/** Fecha y nombre de una instantanea, leidos del nombre de su archivo (o null). */
function parseSnapshotName(basename) {
	const m = SNAP_NAME.exec(basename);
	if (!m) return null;
	const date = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
	const stamp = basename.split(SNAP_SEPARATOR)[0];
	return { time: date.getTime(), label: m[7] || '', stamp };
}

/** Cuando se tomo una instantanea: la fecha de su nombre, o la del archivo. */
function parseSnapshotTime(file) {
	const info = file ? parseSnapshotName(file.basename) : null;
	if (info) return info.time;
	return file && file.stat ? file.stat.mtime : Date.now();
}

/** Toca una automatica? 'daily': si la ultima no es de hoy; 'weekly': si tiene 7 dias o mas. */
function snapshotDue(lastTime, now, mode) {
	if (mode === 'weekly') return now - lastTime >= 7 * 24 * 3600 * 1000;
	const a = new Date(lastTime);
	const b = new Date(now);
	return a.getFullYear() !== b.getFullYear() || a.getMonth() !== b.getMonth() || a.getDate() !== b.getDate();
}

/** Un nombre que puede ir dentro de un nombre de archivo. */
function cleanSnapshotLabel(label) {
	return String(label || '')
		.replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

/** Lo que identifica el contenido de un nodo, para saber si cambio. */
function nodeContent(d) {
	if (d.type === 'text') return 't:' + String(d.text || '');
	if (d.type === 'file') return 'f:' + String(d.file || '') + String(d.subpath || '');
	if (d.type === 'link') return 'l:' + String(d.url || '');
	return String(d.type || '') + ':';
}

/** Todos los nodos del mapa, tambien los guardados en ramas colapsadas: id -> contenido. */
function snapshotIndex(data) {
	const out = new Map();
	for (const f of flattenCanvasData(data).nodes) {
		if (f.data.type === 'group') continue;
		out.set(f.data.id, nodeContent(f.data));
	}
	return out;
}

/** Que cambio de una version a otra: nodos nuevos, quitados y con otro texto. */
function snapshotDiff(older, newer) {
	let added = 0;
	let removed = 0;
	let edited = 0;
	newer.forEach((v, id) => {
		if (!older.has(id)) added++;
		else if (older.get(id) !== v) edited++;
	});
	older.forEach((v, id) => { if (!newer.has(id)) removed++; });
	return { added, removed, edited };
}

/** JSON con las claves ordenadas, para comparar dos versiones sin que importe el orden. */
function canonicalJson(value) {
	if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
	if (value && typeof value === 'object') {
		return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
	}
	return JSON.stringify(value === undefined ? null : value);
}

/** Dos versiones del mapa son iguales (mismos nodos, lugares y flechas). */
function sameMap(a, b) {
	return canonicalJson({ nodes: a.nodes || [], edges: a.edges || [] }) === canonicalJson({ nodes: b.nodes || [], edges: b.edges || [] });
}

/** Fecha y hora legibles, en el idioma del plugin. */
function formatWhen(time) {
	try {
		return new Date(time).toLocaleString(LOCALE === 'es' ? 'es-AR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' });
	} catch (e) {
		return snapshotStamp(new Date(time));
	}
}

/** Un boton chico, con texto. */
function smallButton(parent, text, tip, fn, cls) {
	const b = document.createElement('button');
	b.type = 'button';
	b.className = 'mm-snap-btn' + (cls ? ' ' + cls : '');
	b.textContent = text;
	if (tip) { b.setAttribute('title', tip); b.setAttribute('aria-label', tip); }
	b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); fn(); });
	parent.appendChild(b);
	return b;
}

function textDiv(parent, cls, text) {
	const el = document.createElement('div');
	el.className = cls;
	if (text !== undefined) el.textContent = text;
	parent.appendChild(el);
	return el;
}

/** Pregunta si o no. Resuelve true solo si confirmas. */
class ConfirmModal extends Modal {
	constructor(app, opts, resolve) {
		super(app);
		this.opts = opts;
		this.resolve = resolve;
		this.answer = false;
	}

	onOpen() {
		const { contentEl, titleEl, opts } = this;
		if (titleEl) titleEl.textContent = opts.title || '';
		textDiv(contentEl, 'mm-modal-text', opts.message || '');
		const row = textDiv(contentEl, 'mm-modal-buttons');
		smallButton(row, opts.cancel || t('Cancel'), '', () => this.close());
		const ok = smallButton(row, opts.ok || t('OK'), '', () => { this.answer = true; this.close(); }, opts.warning ? 'mod-warning' : 'mod-cta');
		window.setTimeout(() => { try { ok.focus(); } catch (e) { /* noop */ } }, 0);
	}

	onClose() {
		this.contentEl.textContent = '';
		this.resolve(this.answer);
	}
}

/** Pide un texto. Resuelve el texto, o null si cancelas. */
class TextModal extends Modal {
	constructor(app, opts, resolve) {
		super(app);
		this.opts = opts;
		this.resolve = resolve;
		this.answer = null;
	}

	onOpen() {
		const { contentEl, titleEl, opts } = this;
		if (titleEl) titleEl.textContent = opts.title || '';
		if (opts.message) textDiv(contentEl, 'mm-modal-text', opts.message);
		const input = document.createElement('input');
		input.type = 'text';
		input.className = 'mm-modal-input';
		input.value = opts.value || '';
		if (opts.placeholder) input.setAttribute('placeholder', opts.placeholder);
		contentEl.appendChild(input);
		const send = () => { this.answer = input.value; this.close(); };
		input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
		const row = textDiv(contentEl, 'mm-modal-buttons');
		smallButton(row, t('Cancel'), '', () => this.close());
		smallButton(row, opts.ok || t('OK'), '', send, 'mod-cta');
		window.setTimeout(() => { try { input.focus(); input.select(); } catch (e) { /* noop */ } }, 0);
	}

	onClose() {
		this.contentEl.textContent = '';
		this.resolve(this.answer);
	}
}

/** Panel con la historia de un mapa: sus instantaneas, de la mas nueva a la mas vieja. */
class SnapshotsView extends ItemView {
	constructor(leaf, plugin) {
		super(leaf);
		this.plugin = plugin;
		this.indexCache = new Map(); // ruta -> { mtime, index }
		this.timer = null;
		this.rendering = 0;
	}

	getViewType() { return SNAPSHOTS_VIEW; }
	getDisplayText() { return t('Map history'); }
	getIcon() { return 'history'; }

	async onOpen() {
		this.contentEl.classList.add('mm-snapshots');
		this.contentEl.textContent = '';
		this.headerEl = textDiv(this.contentEl, 'mm-snap-header');
		this.listEl = textDiv(this.contentEl, 'mm-snap-list');
		const soon = () => this.refreshSoon();
		this.registerEvent(this.app.vault.on('create', soon));
		this.registerEvent(this.app.vault.on('delete', soon));
		this.registerEvent(this.app.vault.on('rename', soon));
		this.registerEvent(this.app.workspace.on('active-leaf-change', soon));
		await this.refresh();
	}

	async onClose() {
		if (this.timer) window.clearTimeout(this.timer);
		this.indexCache.clear();
	}

	refreshSoon() {
		if (this.timer) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => { this.timer = null; this.refresh(); }, 200);
	}

	/** Indice de nodos de una instantanea (se guarda mientras el archivo no cambie). */
	async indexOf(file) {
		const mtime = file.stat ? file.stat.mtime : 0;
		const hit = this.indexCache.get(file.path);
		if (hit && hit.mtime === mtime) return hit.index;
		const data = await this.plugin.readSnapshot(file);
		const index = data ? snapshotIndex(data) : null;
		this.indexCache.set(file.path, { mtime, index });
		return index;
	}

	async refresh() {
		if (!this.listEl) return;
		const turn = ++this.rendering;
		const plugin = this.plugin;
		const canvas = getCanvas(plugin.app);
		const openPath = canvasFilePath(canvas);
		const source = openPath ? plugin.sourceOfPath(openPath) : null;
		const header = document.createElement('div');
		const list = document.createElement('div');
		if (!source) {
			textDiv(list, 'mm-snap-empty', t('Open a canvas to see its history.'));
			return this.swap(turn, header, list);
		}
		const viewingSnapshot = openPath !== source;
		textDiv(header, 'mm-snap-title', source.split('/').pop().replace(/\.canvas$/i, ''));
		const tools = textDiv(header, 'mm-snap-tools');
		if (viewingSnapshot) {
			smallButton(tools, t('Open the current map'), t('Open the canvas this snapshot comes from'), () => plugin.openSourceOf(openPath), 'mod-cta');
		} else {
			smallButton(tools, t('Take snapshot'), t('Save how the map looks right now'), () => plugin.takeSnapshotFromUi(), 'mod-cta');
		}

		const entries = plugin.listSnapshots(source);
		const now = viewingSnapshot ? await plugin.readSourceData(source) : safeData(canvas);
		const nowIndex = now ? snapshotIndex(now) : null;
		if (nowIndex) {
			let line = t('Now: {n} cards', { n: nowIndex.size });
			if (entries.length) {
				const last = await this.indexOf(entries[0].file);
				if (last) {
					const d = snapshotDiff(last, nowIndex);
					line += ' · ' + (d.added || d.removed || d.edited
						? t('since the last snapshot: +{a} −{r} ~{e}', { a: d.added, r: d.removed, e: d.edited })
						: t('no changes since the last snapshot'));
				}
			}
			textDiv(header, 'mm-snap-now', line);
		}

		if (!entries.length) {
			textDiv(list, 'mm-snap-empty', t('This map has no snapshots yet. Take the first one with the button above, or turn on automatic snapshots in the settings.'));
			return this.swap(turn, header, list);
		}
		const indexes = [];
		for (const e of entries) indexes.push(await this.indexOf(e.file));
		entries.forEach((e, i) => {
			const row = textDiv(list, 'mm-snap-row');
			if (e.file.path === openPath) row.classList.add('is-open');
			const top = textDiv(row, 'mm-snap-when', formatWhen(e.time));
			if (e.label) textDiv(top, 'mm-snap-label', e.label);
			const idx = indexes[i];
			const older = indexes[i + 1];
			let stats = idx ? t('{n} cards', { n: idx.size }) : t('could not be read');
			if (idx && older) {
				const d = snapshotDiff(older, idx);
				stats += ' · ' + (d.added || d.removed || d.edited
					? t('+{a} −{r} ~{e} compared with the previous one', { a: d.added, r: d.removed, e: d.edited })
					: t('same as the previous one'));
			}
			textDiv(row, 'mm-snap-stats', stats);
			const actions = textDiv(row, 'mm-snap-actions');
			smallButton(actions, t('Open'), t('Open this snapshot in a new tab, read-only'), () => plugin.openSnapshot(e.file));
			if (!viewingSnapshot) {
				smallButton(actions, t('Restore'), t('Bring the map back to this version'), () => plugin.restoreSnapshotFromUi(e.file));
			}
			smallButton(actions, t('Rename'), t('Give this snapshot a name'), () => plugin.renameSnapshot(e.file));
			smallButton(actions, t('Delete'), t('Delete this snapshot'), () => plugin.deleteSnapshot(e.file), 'mod-warning');
		});
		return this.swap(turn, header, list);
	}

	/** Reemplaza el contenido de una vez, y solo si nadie pidio un repintado mas nuevo. */
	swap(turn, header, list) {
		if (turn !== this.rendering) return;
		this.headerEl.textContent = '';
		this.listEl.textContent = '';
		while (header.firstChild) this.headerEl.appendChild(header.firstChild);
		while (list.firstChild) this.listEl.appendChild(list.firstChild);
	}
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

let SUBMENU_SUPPORT = null;
function supportsSubmenu() {
	if (SUBMENU_SUPPORT === null) {
		SUBMENU_SUPPORT = false;
		try {
			const probe = new Menu();
			probe.addItem((item) => { SUBMENU_SUPPORT = typeof item.setSubmenu === 'function'; });
			if (typeof probe.close === 'function') probe.close();
		} catch (e) { SUBMENU_SUPPORT = false; }
	}
	return SUBMENU_SUPPORT;
}

/** Agrega un submenu, o una lista indentada si la version no los soporta. */
function subMenu(menu, title, icon, build) {
	if (supportsSubmenu()) {
		menu.addItem((item) => {
			item.setTitle(title).setIcon(icon);
			build(item.setSubmenu(), '');
		});
	} else {
		menu.addItem((item) => item.setTitle(title).setIsLabel(true));
		build(menu, '   ');
	}
}

function collectAllIds(data) {
	const ids = new Set();
	const walk = (nodes) => {
		for (const n of nodes || []) {
			ids.add(n.id);
			const p = n[PAYLOAD_KEY];
			if (p && Array.isArray(p.nodes)) walk(p.nodes);
		}
	};
	walk(data.nodes);
	return ids;
}

class CanvasMindmapTools extends Plugin {
	async onload() {
		await this.loadSettings();
		this.branchDrag = new BranchDrag(this);
		this.scopePatches = [];
		this.linkSignatures = new WeakMap();
		this.curvePatch = null;
		this.lockedSnapshots = new Set();  // instantaneas ya trabadas en esta sesion
		this.snapshotChecks = new Map();   // ruta -> cuando volver a mirar si toca una automatica
		this.snapshotBusy = new Set();
		this.registerDomEvent(document, 'pointerdown', (evt) => this.onGripPointerDown(evt), true);
		this.registerDomEvent(document, 'pointerdown', (evt) => this.branchDrag.onPointerDown(evt), true);
		this.registerDomEvent(document, 'pointerdown', (evt) => this.onMoveStart(evt), true);
		this.registerInterval(window.setInterval(() => {
			const canvas = getCanvas(this.app);
			if (canvas && canvas.view) this.patchCanvasScope(canvas.view);
			if (canvas) this.applyOpenZoom(canvas);
			if (canvas) this.lockSnapshot(canvas);
			if (canvas && this.settings.smoothCurves && !this.curvePatch) installCurvePatch(this, canvas);
			if (canvas) {
				// solo si cambio algo en las flechas desde la ultima vez
				try {
					const firma = linkSignature(canvas);
					if (this.linkSignatures.get(canvas) !== firma) {
						stampLinks(canvas, this.settings);
						this.linkSignatures.set(canvas, linkSignature(canvas));
					}
				} catch (e) { /* noop */ }
			}
			syncDecorations(canvas, this.settings, this);
		}, 400));
		this.registerInterval(window.setInterval(() => {
			const canvas = getCanvas(this.app);
			if (!canvas) return;
			this.updateZoomIndicator(canvas);
			this.updateToolPanel(canvas);
		}, 150));
		this.registerEvent(this.app.workspace.on('layout-change', () => {
			window.setTimeout(() => syncDecorations(getCanvas(this.app), this.settings, this), 50);
		}));
		this.registerView(OUTLINE_VIEW, (leaf) => new OutlineView(leaf, this));
		this.registerView(SNAPSHOTS_VIEW, (leaf) => new SnapshotsView(leaf, this));
		// instantaneas automaticas: al abrir un canvas, y cada tanto mientras lo usas
		const auto = () => {
			const canvas = getCanvas(this.app);
			if (canvas) this.autoSnapshot(canvas).catch((e) => console.error('[Othoughts] automatic snapshot failed', e));
		};
		this.registerEvent(this.app.workspace.on('file-open', () => window.setTimeout(auto, 1500)));
		this.registerInterval(window.setInterval(auto, 60 * 1000));
		this.registerDomEvent(document, 'keydown', (evt) => this.onCanvasKeyDown(evt), true);
		this.registerDomEvent(window, 'keydown', (evt) => this.onEscapeKey(evt), true);
		this.registerDomEvent(window, 'keydown', (evt) => this.onAltEnter(evt), true);
		this.registerDomEvent(document, 'focusin', (evt) => this.onFocusIn(evt), true);
		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.onFileRenamed(file, oldPath)));
		this.addCommands();
		this.registerMenus();
		this.addSettingTab(new MindmapSettingTab(this.app, this));
	}

	onunload() {
		if (this.branchDrag) this.branchDrag.destroy();
		this.releaseScopes();
		if (this.curvePatch) {
			removeCurvePatch(this);
			for (const leaf of this.app.workspace.getLeavesOfType('canvas')) redrawEdges(leaf.view && leaf.view.canvas);
		}
		try {
			document.querySelectorAll('.mm-toggle, .mm-grip').forEach((el) => el.remove());
			document.querySelectorAll('.mm-grid-line, .mm-zoom, .mm-tools').forEach((el) => el.remove());
			document.querySelectorAll('.canvas-wrapper').forEach((w) => {
				for (const k of Object.keys(THEMES)) w.classList.remove('mm-theme-' + k);
				for (const k of Object.keys(BACKGROUNDS)) w.classList.remove('mm-bg-' + k);
			});
			document.querySelectorAll('.mm-collapsed').forEach((el) => {
				el.classList.remove('mm-collapsed');
				el.removeAttribute('data-mm-count');
			});
			// la letra y las marcas de estilo vuelven a como las deja Obsidian
			document.querySelectorAll('.canvas-node').forEach((el) => {
				applyFontScale(el, 1, 16, 0);
				for (const a of ['data-mm-type', 'data-mm-media', 'data-mm-lvl', 'data-mm-branch']) el.removeAttribute(a);
			});
			document.querySelectorAll('.canvas-edges [data-mm-lvl], .canvas-edges [data-mm-branch]').forEach((el) => {
				el.removeAttribute('data-mm-lvl');
				el.removeAttribute('data-mm-branch');
				for (const c of ALL_EDGE_CLASSES) el.classList.remove(c);
			});
		} catch (e) { /* noop */ }
	}

	async loadSettings() {
		const raw = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, raw.settings || {});
		// Antes de tener idiomas, el plugin estaba solo en castellano: quien ya lo
		// usaba lo sigue viendo asi (se cambia en las opciones).
		if (raw.settings && raw.settings.language === undefined) this.settings.language = 'es';
		setLocale(this.settings.language);
		this.backups = Array.isArray(raw.backups) ? raw.backups : [];
		this.maps = (raw.maps && typeof raw.maps === 'object') ? raw.maps : {};
	}

	async saveSettings() {
		await this.saveData({ settings: this.settings, backups: this.backups, maps: this.maps });
	}

	/** Si mueven o renombran un canvas, su estado y sus copias lo siguen. */
	onFileRenamed(file, oldPath) {
		let touched = false;
		// la historia de un canvas lo sigue si lo moves o lo renombras
		if (file instanceof TFolder && oldPath === this.snapshotRoot()) {
			this.settings.snapshotFolder = file.path;
			touched = true;
		} else if ((file instanceof TFile && file.extension === 'canvas') || file instanceof TFolder) {
			// De a una por vez: al renombrar una carpeta, Obsidian avisa de la carpeta y
			// de cada archivo de adentro, y las mudanzas no se tienen que pisar.
			const isFolder = file instanceof TFolder;
			const newPath = file.path;
			this.renameQueue = (this.renameQueue || Promise.resolve())
				.then(() => this.moveSnapshotsFor(oldPath, newPath, isFolder))
				.catch((e) => console.error('[Othoughts] could not move the snapshots', e));
		}
		if (this.maps[oldPath]) {
			this.maps[file.path] = this.maps[oldPath];
			delete this.maps[oldPath];
			touched = true;
		}
		for (const b of this.backups) {
			if (b.file === oldPath) { b.file = file.path; touched = true; }
		}
		if (touched) this.saveSettings();
	}

	/** Direccion y modo de alineacion recordados para cada canvas. */
	mapState(canvas) {
		// una instantanea usa la direccion y el estilo de su canvas original
		const path = this.sourceOfPath(canvasFilePath(canvas)) || '__sin_archivo__';
		let st = this.maps[path];
		if (!st) { st = { dir: this.settings.defaultDirection, mode: this.settings.defaultAlign }; this.maps[path] = st; }
		if (!DIRECTIONS[st.dir]) st.dir = this.settings.defaultDirection;
		if (ALIGN_MODES.indexOf(st.mode) === -1) st.mode = this.settings.defaultAlign;
		if (!THEMES[st.theme]) st.theme = THEMES[this.settings.defaultTheme] ? this.settings.defaultTheme : 'ninguno';
		if (!BACKGROUNDS[st.bg]) st.bg = 'tema';
		return st;
	}

	/**
	 * Reacomoda el mapa solo si el canvas esta en modo Completa o Parcial.
	 * `reason` es 'collapse' (colapsar/expandir) o 'move' (soltar una rama).
	 */
	autoRelayout(canvas, reason) {
		if (!canvas || canvas.readonly) return false;
		this.prepare(canvas);
		const st = this.mapState(canvas);
		if (st.mode === 'manual') return false;
		if (reason === 'move' && st.mode !== 'full') return false;
		const graph = buildGraph(canvas, this.settings);
		const entries = graph.roots.filter((r) => r.children.length);
		if (!entries.length) return false;
		runLayout(canvas, entries, st.dir, this.settings, false, null, true);
		return true;
	}

	/**
	 * Antes de tocar un canvas: si se estaba reacomodando, que termine; y que
	 * las conexiones cruzadas queden marcadas, para que nada de lo que venga
	 * despues le cambie la madre a un nodo.
	 */
	prepare(canvas) {
		flushLayout(canvas);
		stampLinks(canvas, this.settings);
	}

	/**
	 * El canvas sobre el que actua un comando. Si esta en solo lectura (una
	 * instantanea, o un canvas que trabaste vos), solo pasan las acciones que
	 * no lo cambian: las que piden { readOnly: true }.
	 */
	requireCanvas(opts) {
		const canvas = getCanvas(this.app);
		if (!canvas) {
			new Notice(t('Open a canvas to use this action.'));
			return null;
		}
		if (canvas.readonly && !(opts && opts.readOnly)) {
			new Notice(this.isSnapshotPath(canvasFilePath(canvas))
				? t('This is a snapshot, so it is read-only. To go back to this version, restore it from the map history.')
				: t('This canvas is read-only. Unlock it from the canvas controls to change it.'));
			return null;
		}
		this.prepare(canvas);
		return canvas;
	}

	/** Nodos seleccionados como entradas del grafo, sin descendientes redundantes. */
	selectionRoots(canvas, graph) {
		const sel = selectedNodes(canvas)
			.map((n) => graph.nodes.get(n.id))
			.filter(Boolean);
		const selIds = new Set(sel.map((n) => n.id));
		return sel.filter((entry) => {
			let cur = entry.parent;
			let guard = 0;
			while (cur && guard++ < 10000) {
				if (selIds.has(cur.id)) return false;
				cur = cur.parent;
			}
			return true;
		});
	}

	pushBackup(canvas, nodeId, payload) {
		this.backups.push({ file: canvasFilePath(canvas), nodeId, ts: Date.now(), payload });
		const max = Math.max(1, this.settings.maxBackups | 0);
		if (this.backups.length > max) this.backups.splice(0, this.backups.length - max);
		this.saveSettings();
	}

	/**
	 * Aplica cambios sobre el JSON del canvas verificando que las claves
	 * propias del plugin sobrevivan; si no, revierte y avisa.
	 */
	applyVerified(canvas, data, snapshot, checkNodeIds) {
		if (!applyCanvasData(canvas, data)) return false;
		if (!checkNodeIds || !checkNodeIds.length) return true;
		const after = safeData(canvas);
		if (!after) return true;
		const byId = new Map(after.nodes.map((n) => [n.id, n]));
		for (const id of checkNodeIds) {
			const n = byId.get(id);
			// Si el nodo ya no esta en el primer nivel es porque quedo dentro de
			// otro colapso; en ese caso lo verifica el payload de su ancestro.
			if (!n) continue;
			if (!n[COLLAPSED_KEY] || !n[PAYLOAD_KEY]) {
				applyCanvasData(canvas, snapshot);
				new Notice(t('Othoughts: this version of Obsidian does not keep the collapse data. The change was reverted.'));
				return false;
			}
		}
		return true;
	}

	toggleCollapse(target) {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		let entries;
		if (target) {
			const e = graph.nodes.get(target.id);
			entries = e ? [e] : [];
		} else {
			entries = this.selectionRoots(canvas, graph);
		}
		if (!entries.length) {
			new Notice(t('Select at least one card.'));
			return;
		}
		const data = safeData(canvas);
		if (!data) return;
		const snapshot = JSON.parse(JSON.stringify(data));
		const checkIds = [];
		const pending = [];
		let collapsed = 0;
		let expanded = 0;
		for (const entry of entries) {
			if (entry.collapsed) {
				expanded += expandInData(data, entry.id);
			} else {
				const payload = collapseInData(data, entry);
				if (payload) {
					collapsed += payload.nodes.length;
					checkIds.push(entry.id);
					pending.push({ id: entry.id, payload });
				}
			}
		}
		if (!collapsed && !expanded) {
			new Notice(t('That card has no branches to collapse.'));
			return;
		}
		if (!this.applyVerified(canvas, data, snapshot, checkIds)) return;
		for (const p of pending) this.pushBackup(canvas, p.id, p.payload);
		this.autoRelayout(canvas, 'collapse');
		new Notice(collapsed ? t('Branch collapsed: {n} cards hidden.', { n: collapsed }) : t('Branch expanded: {n} cards.', { n: expanded }));
	}

	collapseAll() {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const data = safeData(canvas);
		if (!data) return;
		const snapshot = JSON.parse(JSON.stringify(data));
		const candidates = [];
		graph.nodes.forEach((n) => { if (!n.collapsed && n.children.length) candidates.push(n); });
		candidates.sort((a, b) => depthOf(b) - depthOf(a)); // de las hojas hacia la raiz
		const checkIds = [];
		const pending = [];
		let total = 0;
		for (const entry of candidates) {
			const payload = collapseInData(data, entry);
			if (payload) {
				total += payload.nodes.length;
				checkIds.push(entry.id);
				pending.push({ id: entry.id, payload });
			}
		}
		if (!total) { new Notice(t('There are no branches to collapse.')); return; }
		if (!this.applyVerified(canvas, data, snapshot, checkIds)) return;
		for (const p of pending) this.pushBackup(canvas, p.id, p.payload);
		new Notice(t('All branches collapsed: {n} cards hidden.', { n: total }));
	}

	expandAll(silent) {
		const canvas = this.requireCanvas();
		if (!canvas) return 0;
		const data = safeData(canvas);
		if (!data) return;
		let total = 0;
		let guard = 0;
		while (guard++ < 1000) {
			const next = data.nodes.find((n) => n[COLLAPSED_KEY] || n[PAYLOAD_KEY]);
			if (!next) break;
			total += expandInData(data, next.id);
		}
		if (!total) {
			if (!silent) new Notice(t('There are no collapsed branches.'));
			return 0;
		}
		applyCanvasData(canvas, data);
		if (!silent) {
			this.autoRelayout(canvas, 'collapse');
			new Notice(t('Branches expanded: {n} cards.', { n: total }));
		}
		return total;
	}

	layout(dir, forceAll) {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const sel = forceAll ? [] : this.selectionRoots(canvas, graph);
		const horiz = dir === 'right' || dir === 'left' || dir === 'both-h';
		let entries;
		let stack;
		if (sel.length) {
			entries = sel;
			stack = false;
		} else {
			// Sin seleccion se organizan los mapas: lo que tiene ramas. Los nodos
			// sueltos (imagenes, notas, apuntes) se quedan donde los pusiste. Cada
			// mapa queda anclado en su raiz; si dos se encimarian, el de mas abajo
			// se corre lo justo.
			entries = graph.roots.filter((r) => r.children.length)
				.sort((a, b) => (horiz ? (a.y - b.y) || (a.x - b.x) : (a.x - b.x) || (a.y - b.y)));
			stack = true;
		}
		if (!entries.length) {
			new Notice(t('Nothing to arrange: connect the cards with arrows first.'));
			return;
		}
		const st = this.mapState(canvas);
		// la direccion queda como la del mapa solo si organizaste un mapa entero
		if (!sel.length || sel.some((e) => !e.parent)) {
			st.dir = dir;
			this.saveSettings();
		}
		const moved = runLayout(canvas, entries, dir, this.settings, stack);
		new Notice(moved
			? t('{direction}: {n} cards rearranged.', { direction: DIRECTIONS[dir], n: moved })
			: t('The map was already tidy.'));
	}

	selectBranch() {
		const canvas = this.requireCanvas({ readOnly: true });
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const entries = this.selectionRoots(canvas, graph);
		if (!entries.length) { new Notice(t('Select at least one card.')); return; }
		const nodes = [];
		const seen = new Set();
		for (const e of entries) {
			for (const n of subtreeOf(e, true)) {
				if (seen.has(n.id)) continue;
				seen.add(n.id);
				nodes.push(n.node);
			}
		}
		selectNodes(canvas, nodes);
		new Notice(t('Branch selected: {n} cards.', { n: nodes.length }));
	}

	/* ---------------- teclado y creacion de nodos ---------------- */

	/** Sale del modo edicion dejando el nodo seleccionado. */
	exitEditing(canvas, node) {
		try {
			const active = document.activeElement;
			if (active && typeof active.blur === 'function') active.blur();
		} catch (e) { /* noop */ }
		try { if (node && typeof node.blur === 'function') node.blur(); } catch (e) { /* noop */ }
		try { if (node && typeof node.setIsEditing === 'function') node.setIsEditing(false); } catch (e) { /* noop */ }
		try { if (node && typeof canvas.selectOnly === 'function') canvas.selectOnly(node); } catch (e) { /* noop */ }
		try {
			const el = canvas.wrapperEl || canvas.canvasEl;
			if (el && typeof el.focus === 'function') el.focus();
		} catch (e) { /* noop */ }
		try { canvas.requestSave(); } catch (e) { /* noop */ }
	}

	/**
	 * Arrastre del punto: agranda o achica la caja y la letra en la misma
	 * proporcion, dejando fija la esquina de arriba a la derecha.
	 *
	 * Se engancha desde `document` en fase de captura porque el canvas se queda
	 * con el pointerdown antes de que llegue al elemento. El zoom se mide con el
	 * propio nodo (ancho en pantalla / ancho real), sin depender de APIs internas.
	 */
	onGripPointerDown(evt) {
		if (!this.settings.sizeGrip || evt.button !== 0) return;
		const t = evt.target;
		if (!t || typeof t.closest !== 'function') return;
		const canvas = getCanvas(this.app);
		if (!canvas) return;
		let hit = null;
		const direct = t.closest('.mm-grip');
		if (direct) {
			const nodeEl = direct.closest('.canvas-node');
			canvas.nodes.forEach((n) => { if (n.nodeEl === nodeEl) hit = { node: n, el: nodeEl }; });
		} else if (t.closest('.canvas-wrapper')) {
			// El cuadradito vive en la esquina, debajo de la capa de tiradores de
			// Obsidian (que se dibuja por encima de los nodos): el clic le llega al
			// tirador y no a nosotros. Por eso lo reconocemos por posicion.
			hit = this.gripAt(canvas, evt.clientX, evt.clientY);
		}
		if (!hit) return;
		evt.preventDefault();
		evt.stopPropagation();
		if (typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
		this.startGripDrag(evt, canvas, hit.node, hit.el);
	}

	/** Cuadradito que esta debajo de ese punto de la pantalla, si hay alguno. */
	gripAt(canvas, x, y) {
		let hit = null;
		canvas.nodes.forEach((node) => {
			if (hit) return;
			const el = node.nodeEl;
			if (!el || typeof el.querySelector !== 'function') return;
			const grip = el.querySelector(':scope > .mm-grip');
			if (!grip) return;
			const r = grip.getBoundingClientRect();
			if (!r || !r.width) return;
			const pad = 3; // un poco de margen para que sea facil de agarrar
			if (x >= r.left - pad && x <= r.left + r.width + pad && y >= r.top - pad && y <= r.top + r.height + pad) {
				hit = { node, el };
			}
		});
		return hit;
	}

	startGripDrag(evt, canvas, node, el) {
		if (canvas.readonly) return;
		const x0 = node.x;
		const y0 = node.y;
		const w0 = node.width || 250;
		const h0 = node.height || 60;
		const d0 = safeData(node) || {};
		const scale0 = Number(d0[FONT_KEY]) || 1;
		const diag = Math.hypot(w0, h0) || 1;
		const startX = evt.clientX;
		const startY = evt.clientY;
		let zoom = 1;
		try {
			const rect = el.getBoundingClientRect();
			if (rect && rect.width && w0) zoom = rect.width / w0;
		} catch (e) { /* noop */ }
		if (!zoom || !isFinite(zoom)) zoom = 1;
		let scale = scale0;
		const base = baseFontSize();
		el.classList.add('mm-gripping');

		const move = (e) => {
			const dx = (e.clientX - startX) / zoom;
			const dy = (e.clientY - startY) / zoom;
			// avance sobre la diagonal hacia abajo-izquierda
			const proj = (-dx + dy) / Math.SQRT2;
			let f = (diag + proj) / diag;
			const maxF = Math.min(4 / scale0, 2400 / w0, 1600 / h0);
			const minF = Math.max(0.5 / scale0, 60 / w0, 30 / h0);
			f = Math.min(maxF, Math.max(minF, f));
			const w = Math.round(w0 * f);
			const h = Math.round(h0 * f);
			const x = Math.round(x0 + w0 - w); // la esquina de arriba a la derecha no se mueve
			try {
				if (typeof node.moveAndResize === 'function') node.moveAndResize({ x, y: y0, width: w, height: h });
				else { node.x = x; node.width = w; node.height = h; }
			} catch (err) { /* noop */ }
			scale = Math.min(4, Math.max(0.5, Math.round(scale0 * f * 100) / 100));
			applyFontScale(el, scale, base, this.settings.fontBump);
			try { if (typeof canvas.requestFrame === 'function') canvas.requestFrame(); } catch (err) { /* noop */ }
		};

		const done = () => {
			window.removeEventListener('pointermove', move, true);
			window.removeEventListener('pointerup', done, true);
			window.removeEventListener('pointercancel', done, true);
			el.classList.remove('mm-gripping');
			const data = safeData(canvas);
			if (!data) return;
			const n = findNodeData(data, node.id);
			if (!n) return;
			n.x = node.x;
			n.y = node.y;
			n.width = node.width;
			n.height = node.height;
			if (Math.abs(scale - 1) < 0.03) delete n[FONT_KEY];
			else n[FONT_KEY] = scale;
			applyCanvasData(canvas, data);
			syncDecorations(canvas, this.settings, this);
		};

		window.addEventListener('pointermove', move, true);
		window.addEventListener('pointerup', done, true);
		window.addEventListener('pointercancel', done, true);
	}

	/** Salta la seleccion al nodo vecino en esa direccion. */
	navigate(key) {
		const canvas = getCanvas(this.app);
		if (!canvas) return false;
		if (isTyping(editingNode(canvas))) return false;
		const graph = buildGraph(canvas, this.settings);
		const sel = selectedNodes(canvas);
		let target = null;
		if (!sel.length) {
			// sin nada seleccionado, empezamos por la raiz del primer mapa. Si el
			// canvas no tiene ningun mapa, las flechas quedan como en Obsidian.
			const roots = graph.roots.filter((r) => r.children.length).sort((a, b) => (a.y - b.y) || (a.x - b.x));
			target = roots[0] || null;
		} else {
			const entry = graph.nodes.get(sel[0].id);
			if (!entry) return false;
			// una tarjeta suelta no es parte de ningun mapa: las flechas la mueven, como siempre
			if (!entry.parent && !entry.children.length) return false;
			const st = this.mapState(canvas);
			target = navByTree(entry, key, st.dir, branchSides(graph, st.dir)) || navByGeometry(graph, entry, key);
		}
		if (!target) return false;
		const node = canvas.nodes.get(target.id);
		if (!node) return false;
		try { if (typeof canvas.selectOnly === 'function') canvas.selectOnly(node); } catch (e) { /* noop */ }
		try {
			if (typeof canvas.panIntoView === 'function') {
				canvas.panIntoView({
					minX: node.x - 60,
					minY: node.y - 60,
					maxX: node.x + (node.width || 250) + 60,
					maxY: node.y + (node.height || 60) + 60,
				});
			}
		} catch (e) { /* noop */ }
		return true;
	}

	/**
	 * Crea un nodo nuevo. En los dos casos va DEBAJO del ultimo del grupo,
	 * alineado con la columna de ese nivel, y sin mover nada de lo que ya estaba:
	 *  'child'   -> hijo del nodo elegido, debajo de sus hijos (y de sus ramas)
	 *  'sibling' -> hermano, debajo del ultimo hermano
	 */
	addNode(kind, opts) {
		const options = opts || {};
		const canvas = this.requireCanvas();
		if (!canvas) return null;
		const editing = editingNode(canvas);
		const typing = isTyping(editing);
		const seleccion = selectedNodes(canvas);
		if (editing && typing) this.exitEditing(canvas, editing);
		else if (editing) { try { editing.setIsEditing(false); } catch (e) { /* noop */ } }
		const graph = buildGraph(canvas, this.settings);
		const elegido = options.baseId
			|| (typing ? editing.id : (seleccion[0] ? seleccion[0].id : (editing ? editing.id : null)));
		const base = elegido ? graph.nodes.get(elegido) : null;
		if (!base) { new Notice(t('Select a card first.')); return null; }

		const st = this.mapState(canvas);
		// El lado lo decide la rama, no el canvas: un hijo nuevo de una rama que
		// mira a la izquierda nace a la izquierda. Una rama principal nueva va
		// del lado por defecto del mapa.
		const ladoDe = branchSides(graph, st.dir);
		const fallback = (st.dir === 'left' || st.dir === 'up') ? -1 : 1;
		const signum = (kind === 'child' && !base.parent) ? fallback : (ladoDe.get(base.id) || fallback);
		const info = sideInfo(st.dir, signum);
		const horiz = info.horiz;
		const back = info.back;
		const sides = info.sides;

		// Un hijo cuelga del nodo elegido; un hermano, del mismo padre que el.
		// En los dos casos el nodo nuevo va DEBAJO del ultimo del grupo, nunca
		// en el medio, y nada de lo que ya estaba se mueve de lugar.
		const parent = kind === 'child' ? base : base.parent;
		// solo cuentan los hermanos de ESTE lado: "debajo del ultimo" es del ultimo de aca
		const siblings = (parent ? parent.children.slice() : [])
			.filter((c) => (ladoDe.get(c.id) || fallback) === signum)
			.sort((a, b) => (horiz ? a.y - b.y : a.x - b.x));

		// tamano: el del ultimo del grupo, o el del nodo de referencia
		const model = siblings.length ? siblings[siblings.length - 1] : base;
		const width = model.w || 250;
		const height = (kind === 'child' && !siblings.length)
			? Math.min(base.h || 60, 60)
			: (model.h || 60);

		const slot = placementFor({
			parent,
			siblings,
			ref: parent ? null : base,        // un hermano sin padre se guia por el propio nodo
			zone: parent ? 'end' : 'after',
			size: { w: width, h: height },
			horiz,
			back,
			settings: this.settings,
		});

		const data = safeData(canvas);
		if (!data) return null;
		if (!data.edges) data.edges = [];
		const id = randomCanvasId();
		data.nodes.push({
			id,
			type: 'text',
			text: '',
			x: Math.round(horiz ? slot.depth : slot.breadth),
			y: Math.round(horiz ? slot.breadth : slot.depth),
			width: Math.round(width),
			height: Math.round(height),
		});
		if (parent) {
			data.edges.push({
				id: randomCanvasId(),
				fromNode: parent.id,
				fromSide: sides.from,
				toNode: id,
				toSide: sides.to,
			});
		}
		applyCanvasData(canvas, data);
		this.autoRelayout(canvas, 'collapse');

		const node = canvas.nodes.get(id);
		if (node) {
			// que no nazca fuera de la pantalla: acercamos la vista sin cambiar el zoom
			try {
				if (typeof canvas.panIntoView === 'function') {
					canvas.panIntoView({
						minX: node.x - 60,
						minY: node.y - 60,
						maxX: node.x + (node.width || width) + 60,
						maxY: node.y + (node.height || height) + 60,
					});
				}
			} catch (e) { /* noop */ }
		}
		if (options.edit !== false) {
			// El nodo queda listo para escribir sin tocar el mouse. Hay que
			// buscarlo de nuevo y esperar un tick: al guardar, el canvas puede
			// rehacer el objeto y todavia no tiene su editor montado.
			const focus = () => {
				const fresh = canvas.nodes.get(id);
				if (!fresh || fresh.isEditing) return;
				try { if (typeof canvas.selectOnly === 'function') canvas.selectOnly(fresh); } catch (e) { /* noop */ }
				try { if (typeof fresh.startEditing === 'function') fresh.startEditing(); } catch (e) { /* noop */ }
			};
			focus();
			window.setTimeout(focus, 0);
			window.setTimeout(focus, 50);
		}
		return id;
	}

	/**
	 * Registra Tab y Enter en el scope del canvas, que es el mismo sistema que
	 * usa Obsidian (y otros plugins de mapas). Los dejamos PRIMEROS en la lista
	 * para que no se dispare tambien el atajo de otro plugin y se creen dos
	 * nodos. Devolver false hace que Obsidian corte la tecla ahi.
	 */
	patchCanvasScope(view) {
		if (!this.scopePatches) this.scopePatches = [];
		if (!view || view.mmScopePatched) return false;
		const scope = view.scope;
		if (!scope || typeof scope.register !== 'function' || !Array.isArray(scope.keys)) return false;
		const entries = [];
		const add = (key) => {
			const entry = scope.register([], key, (evt) => this.onMapKey(evt, key));
			entries.push(entry);
			const i = scope.keys.indexOf(entry);
			if (i > 0) {
				scope.keys.splice(i, 1);
				scope.keys.unshift(entry);
			}
		};
		add('Enter');
		add('Tab');
		for (const a of ARROWS) add(a);
		view.mmScopePatched = true;
		this.scopePatches.push({ view, scope, entries });
		return true;
	}

	releaseScopes() {
		for (const patch of this.scopePatches || []) {
			try {
				for (const e of patch.entries) patch.scope.unregister(e);
			} catch (err) { /* noop */ }
			try { patch.view.mmScopePatched = false; } catch (err) { /* noop */ }
		}
		this.scopePatches = [];
	}

	/** Tab y Enter dentro de un canvas. `undefined` = que sigan los demas. */
	onMapKey(evt, key) {
		const s = this.settings;
		if (evt && (evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey)) return;
		const canvas = getCanvas(this.app);
		if (!canvas) return;
		if (overlayOpen()) return;
		const editing = editingNode(canvas);
		const escribiendo = isTyping(editing);
		if (key === 'Enter') {
			// escribiendo, Enter es un salto de linea; para salir esta Escape
			if (escribiendo) return;
			if (!s.createWithKeys) return;
			// si quedo la marca de edicion puesta sin cursor, ese nodo cuenta como elegido
			const elegido = selectedNodes(canvas)[0] || editing;
			if (!elegido) return;
			const entry = buildGraph(canvas, s).nodes.get(elegido.id);
			if (!entry) return;
			if (entry.parent) this.addNode('sibling');
			// la raiz de un mapa no tiene hermanos: Enter le agrega una rama (como iThoughts)
			else if (entry.children.length) this.addNode('child');
			// una tarjeta suelta no es un mapa: Enter queda como en Obsidian
			else return;
			return false;
		}
		if (ARROWS.indexOf(key) > -1) {
			if (escribiendo) return;
			if (s.arrowNavigation && this.navigate(key)) return false;
			// si no hay a donde saltar, dejamos lo de siempre: mover el nodo
			try {
				if (typeof canvas.nudgeSelection === 'function') {
					canvas.nudgeSelection(evt, key.replace('Arrow', '').toLowerCase());
					const ids = selectedNodes(canvas).map((n) => n.id);
					window.setTimeout(() => this.fitEdgeSides(canvas, ids), 0);
					return false;
				}
			} catch (e) { /* noop */ }
			return;
		}
		if (key === 'Tab') {
			if (!s.createWithKeys) return;
			if (!editing && !selectedNodes(canvas).length) return;
			this.addNode('child');
			return false;
		}
		return undefined;
	}

	/**
	 * Alt+Enter escribiendo en una caja: parrafo nuevo en la misma caja, sin crear nodos.
	 * El editor de la caja vive en un iframe y Obsidian reenvia sus teclas a window
	 * (ya marcadas como atendidas), por eso se escucha ahi y no se mira defaultPrevented.
	 */
	onAltEnter(evt) {
		if (evt.key !== 'Enter' || !evt.altKey || evt.ctrlKey || evt.metaKey || evt.shiftKey || evt.isComposing) return;
		const t = evt.target;
		if (!t || typeof t.closest !== 'function') return;
		if (!(t.isContentEditable || t.closest('.cm-editor'))) return;
		const nodeEl = canvasNodeElOf(t);
		if (!nodeEl || typeof nodeEl.closest !== 'function' || !nodeEl.closest('.canvas-wrapper')) return;
		if (this.lastAltEnter === evt) return; // el mismo evento, visto dos veces
		this.lastAltEnter = evt;
		evt.preventDefault();
		evt.stopPropagation();
		insertNewline(t, this.app);
	}

	onCanvasKeyDown(evt) {
		if (evt.defaultPrevented || evt.isComposing) return;
		const key = evt.key;
		if (key !== 'Enter' && key !== 'Tab' && ARROWS.indexOf(key) === -1) return;
		if (evt.ctrlKey || evt.metaKey || evt.altKey || evt.shiftKey) return;
		const canvas = getCanvas(this.app);
		if (!canvas) return;
		if (overlayOpen()) return; // sugeridor de enlaces, paleta, modal...
		const t = evt.target;
		const inCanvas = t && typeof t.closest === 'function' ? !!t.closest('.canvas-wrapper') : false;
		const loose = !t || t === document.body || t === document.documentElement;
		if (!inCanvas && !loose) return;
		// Si el scope del canvas atendio la tecla, Obsidian corto la propagacion y
		// esto ni se ejecuta. Si llega hasta aca es porque el foco quedo fuera del
		// canvas (por ejemplo al salir de edicion con Escape): la atendemos igual.
		if (this.onMapKey(evt, key) === false) {
			evt.preventDefault();
			evt.stopPropagation();
		}
	}

	/**
	 * Al salir de edicion con Escape, el foco queda fuera del canvas y Obsidian
	 * deja de mandarle las teclas. Dejamos el nodo seleccionado y devolvemos el
	 * foco al canvas, para seguir con flechas, Enter y Tab sin tocar el mouse.
	 */
	onEscapeKey(evt) {
		if (evt.key !== 'Escape') return;
		const t = evt.target;
		const nodeEl = t && typeof t.closest === 'function' ? t.closest('.canvas-node') : null;
		if (!nodeEl) return; // Escape en otro lado (un menu, un modal): no es cosa nuestra
		const canvas = getCanvas(this.app);
		if (!canvas) return;
		let id = null;
		canvas.nodes.forEach((n) => { if (n.nodeEl === nodeEl) id = n.id; });
		if (!id) return;
		window.setTimeout(() => {
			const c = getCanvas(this.app);
			if (!c) return;
			const node = c.nodes.get(id);
			if (!node) return;
			if (isTyping(node)) return; // si todavia estas escribiendo, no tocamos nada
			if (node.isEditing) { try { node.setIsEditing(false); } catch (e) { /* noop */ } }
			try { if (typeof c.selectOnly === 'function') c.selectOnly(node); } catch (e) { /* noop */ }
			try {
				const el = c.wrapperEl || c.canvasEl;
				if (el && typeof el.focus === 'function') el.focus({ preventScroll: true });
			} catch (e) { /* noop */ }
		}, 0);
	}

	/** Cambia el texto de un nodo, este a la vista o dentro de una rama colapsada. */
	setNodeText(canvas, id, text) {
		if (!canvas || canvas.readonly) return false;
		const data = safeData(canvas);
		if (!data) return false;
		const target = findNodeData(data, id);
		if (!target || target.type !== 'text') return false;
		if ((target.text || '') === text) return false;
		target.text = text;
		applyCanvasData(canvas, data);
		return true;
	}

	async openOutline() {
		const workspace = this.app.workspace;
		let leaf = workspace.getLeavesOfType(OUTLINE_VIEW)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) { new Notice(t('Could not open the outline panel.')); return; }
			await leaf.setViewState({ type: OUTLINE_VIEW, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	/* ---------------- enganchar ramas ---------------- */

	/**
	 * Engancha los nodos arrastrados al destino.
	 *  zone 'child'  -> pasan a ser hijos del destino
	 *  zone 'before' -> hermanos, justo antes del destino
	 *  zone 'after'  -> hermanos, justo despues del destino
	 */
	reparentTo(canvas, draggedIds, targetId, zone) {
		if (!canvas || canvas.readonly) return false;
		this.prepare(canvas);
		const graph = buildGraph(canvas, this.settings);
		const target = graph.nodes.get(targetId);
		if (!target) return false;
		const st = this.mapState(canvas);
		const ladoDe = branchSides(graph, st.dir);
		const fallbackSide = (st.dir === 'left' || st.dir === 'up') ? -1 : 1;
		const newParent = zone === 'child' ? target : target.parent;
		const newParentId = newParent ? newParent.id : null;

		const data = safeData(canvas);
		if (!data) return false;
		if (!data.edges) data.edges = [];
		let done = 0;
		let cambioDePadre = false;
		const movedIds = new Set(draggedIds);
		let prev = null; // ultimo nodo ubicado, para encadenar varios

		for (const id of draggedIds) {
			const entry = graph.nodes.get(id);
			if (!entry || id === newParentId) continue;
			// Lado: si la madre nueva es una raiz, el lado donde la soltaste; si no,
			// el de la rama de la madre (los nietos heredan, como en iThoughts).
			let signum = fallbackSide;
			if (newParent && !newParent.parent) {
				const h = sideInfo(st.dir, 1).horiz;
				const rc = h ? newParent.x + newParent.w / 2 : newParent.y + newParent.h / 2;
				const ec = h ? entry.x + entry.w / 2 : entry.y + entry.h / 2;
				signum = ec > rc ? 1 : (ec < rc ? -1 : fallbackSide);
			} else if (newParent) {
				signum = ladoDe.get(newParent.id) || fallbackSide;
			}
			const lado = sideInfo(st.dir, signum);
			const sides = lado.sides;
			const horiz = lado.horiz;
			const back = lado.back;
			// nunca colgar un nodo de su propia rama
			if (newParent) {
				let cur = newParent;
				let cycle = false;
				let guard = 0;
				while (cur && guard++ < 10000) {
					if (cur.id === id) { cycle = true; break; }
					cur = cur.parent;
				}
				if (cycle) continue;
			}
			const antes = entry.parent ? entry.parent.id : null;
			if (antes === newParentId && zone === 'child') continue; // ya colgaba de ahi
			if (antes === newParentId && newParent && zone !== 'child') {
				// mismo padre: es un reordenamiento, y solo vale si cambia el orden
				const orden = newParent.children.slice()
					.sort((a, b) => (horiz ? a.y - b.y : a.x - b.x))
					.map((c) => c.id);
				const iMovido = orden.indexOf(id);
				const iDestino = orden.indexOf(targetId);
				if (iMovido >= 0 && iDestino >= 0) {
					if (zone === 'after' && iMovido === iDestino + 1) continue;
					if (zone === 'before' && iMovido === iDestino - 1) continue;
				}
			}

			// 1. la flecha que lo une a su padre
			const pe = entry.parentEdge;
			if (pe) {
				const e = data.edges.find((x) => x.id === pe.id);
				if (e) {
					if (!newParentId) {
						data.edges = data.edges.filter((x) => x.id !== e.id); // pasa a ser raiz
					} else if (entry.parentReversed) {
						e.toNode = newParentId;
						e.toSide = sides.from;
						e.fromSide = sides.to;
					} else {
						e.fromNode = newParentId;
						e.fromSide = sides.from;
						e.toSide = sides.to;
					}
				}
			} else if (newParentId) {
				// si ya los une una conexion cruzada en ese sentido, esa pasa a ser la
				// flecha madre: no hace falta dibujar otra encima
				const inv = (x) => this.settings.useArrowDirection && x.fromEnd === 'arrow' && x.toEnd !== 'arrow';
				const ya = data.edges.find((x) => x[LINK_KEY] && x[LINK_KEY] !== 'vuelta'
					&& (inv(x) ? (x.toNode === newParentId && x.fromNode === id) : (x.fromNode === newParentId && x.toNode === id)));
				if (ya) {
					delete ya[LINK_KEY];
					if (inv(ya)) { ya.fromSide = sides.to; ya.toSide = sides.from; }
					else { ya.fromSide = sides.from; ya.toSide = sides.to; }
				} else {
					data.edges.push({
						id: randomCanvasId(),
						fromNode: newParentId,
						fromSide: sides.from,
						toNode: id,
						toSide: sides.to,
					});
				}
			}
			if (antes !== newParentId) cambioDePadre = true;

			// 2. lo acomodamos en su lugar nuevo, con toda su rama
			if (newParent) {
				const siblings = newParent.children
					.filter((c) => !movedIds.has(c.id) && (ladoDe.get(c.id) || fallbackSide) === signum)
					.sort((a, b) => (horiz ? a.y - b.y : a.x - b.x));
				const slot = placementFor({
					parent: newParent,
					siblings,
					ref: prev || (zone === 'child' ? null : target),
					zone: prev ? 'after' : (zone === 'child' ? 'end' : zone),
					size: { w: entry.w, h: entry.h },
					horiz, back,
					settings: this.settings,
				});
				if (slot.pushFrom !== null) {
					pushSiblings(data, siblings, slot.pushFrom, slot.pushDelta, horiz, movedIds);
				}
				const destX = horiz ? slot.depth : slot.breadth;
				const destY = horiz ? slot.breadth : slot.depth;
				translateBranch(data, entry, Math.round(destX - entry.x), Math.round(destY - entry.y));
				// si cambio de lado, la rama se da vuelta entera
				if ((ladoDe.get(id) || fallbackSide) !== signum) mirrorBranch(data, entry, st.dir, signum);
				prev = {
					x: destX, y: destY, w: entry.w, h: entry.h,
					children: [], id: entry.id,
				};
			}
			done++;
		}

		if (!done) return false;
		applyCanvasData(canvas, data);
		this.autoRelayout(canvas, 'collapse');
		if (cambioDePadre) {
			const where = shortLabel(target.data);
			let msg;
			if (zone === 'child') {
				msg = done > 1
					? t('{n} branches now hang from {target}.', { n: done, target: where })
					: t('The branch now hangs from {target}.', { target: where });
			} else {
				msg = done > 1
					? t('{n} branches are now siblings of {target}.', { n: done, target: where })
					: t('The branch is now a sibling of {target}.', { target: where });
			}
			new Notice(msg);
		}
		return true;
	}

	/**
	 * Si soltaste una rama principal del otro lado de su raiz (pasando el centro
	 * de la caja), se da vuelta entera: hijos y flechas. Como en iThoughts, y
	 * tambien en modo Manual. Los nietos no se dan vuelta por su cuenta.
	 */
	flipCrossedBranches(canvas, before, moved) {
		if (!before || !moved || !moved.length) return false;
		this.prepare(canvas);
		const st = this.mapState(canvas);
		const antes = branchSides(before, st.dir);
		const graph = buildGraph(canvas, this.settings);
		const ahora = branchSides(graph, st.dir);
		const data = safeData(canvas);
		if (!data) return false;
		let n = 0;
		for (const m of moved) {
			const entry = graph.nodes.get(m.id);
			if (!entry || !entry.parent || entry.parent.parent) continue; // solo ramas principales
			const a = antes.get(entry.id);
			const b = ahora.get(entry.id);
			if (!a || !b || a === b) continue;
			const s2 = sideInfo(st.dir, b).sides;
			if (entry.parentEdge) {
				const e = (data.edges || []).find((x) => x.id === entry.parentEdge.id);
				if (e && entry.parentReversed) { e.fromSide = s2.to; e.toSide = s2.from; }
				else if (e) { e.fromSide = s2.from; e.toSide = s2.to; }
			}
			mirrorBranch(data, entry, st.dir, b);
			n++;
		}
		if (!n) return false;
		applyCanvasData(canvas, data);
		return true;
	}

	/**
	 * Cada vez que termina un movimiento (arrastrando, con las flechas del
	 * teclado, como sea), las flechas que tocan a los nodos que se movieron se
	 * reacomodan para salir por el lado que mira al otro extremo: si un nodo
	 * pasa a la izquierda de su madre, la flecha sale por la izquierda de la
	 * madre y entra por la derecha del nodo. Es solo geometria, asi que correrlo
	 * de mas no rompe nada ni se pisa con el que da vuelta ramas.
	 */
	onMoveStart(evt) {
		if (evt.button !== 0 || !this.settings.setEdgeSides) return;
		const t = evt.target;
		if (!t || typeof t.closest !== 'function' || !t.closest('.canvas-wrapper')) return;
		const canvas = getCanvas(this.app);
		if (!canvas || canvas.readonly) return;
		const before = new Map();
		canvas.nodes.forEach((n) => before.set(n.id, { x: n.x, y: n.y }));
		const horiz = this.mapIsHorizontal(canvas);
		// Mientras arrastras, cada cuadro las lineas de lo que se movio cambian de
		// lado si hace falta, para que se vean bien todo el tiempo y no solo al soltar.
		let frame = null;
		let liveChanged = 0;
		const live = () => {
			frame = null;
			const moved = [];
			canvas.nodes.forEach((n) => {
				const b = before.get(n.id);
				if (b && (b.x !== n.x || b.y !== n.y)) moved.push(n.id);
			});
			if (moved.length) liveChanged += fitEdgesLive(canvas, moved, horiz);
			frame = window.requestAnimationFrame(live);
		};
		frame = window.requestAnimationFrame(live);
		const done = () => {
			window.removeEventListener('pointerup', done, true);
			window.removeEventListener('pointercancel', done, true);
			if (frame !== null) window.cancelAnimationFrame(frame);
			frame = null;
			// esperamos a que terminen el arrastre de rama y el reacomodo animado
			window.setTimeout(() => {
				const n = this.fitMoved(canvas, before);
				// si las lineas ya cambiaron de lado durante el arrastre, que quede guardado
				if (!n && liveChanged && !canvas.readonly) { try { canvas.requestSave(); } catch (e) { /* noop */ } }
			}, 350);
		};
		window.addEventListener('pointerup', done, true);
		window.addEventListener('pointercancel', done, true);
	}

	/** El mapa crece hacia los costados (y no hacia arriba o abajo). */
	mapIsHorizontal(canvas) {
		const dir = this.mapState(canvas).dir;
		return !(dir === 'down' || dir === 'up' || dir === 'both-v');
	}

	fitMoved(canvas, before) {
		const moved = [];
		canvas.nodes.forEach((n) => {
			const b = before.get(n.id);
			if (b && (b.x !== n.x || b.y !== n.y)) moved.push(n.id);
		});
		return moved.length ? this.fitEdgeSides(canvas, moved) : 0;
	}

	/**
	 * Pone cada flecha que toca a esos nodos saliendo por el lado que mejor se
	 * ve (ver edgeSidesFor) y guarda. Trabaja sobre las flechas vivas, sin
	 * reimportar el canvas.
	 */
	fitEdgeSides(canvas, ids) {
		if (!this.settings.setEdgeSides || !canvas || canvas.readonly) return 0;
		this.prepare(canvas);
		const changed = fitEdgesLive(canvas, ids, this.mapIsHorizontal(canvas));
		if (changed) { try { canvas.requestSave(); } catch (e) { /* noop */ } }
		return changed;
	}

	/* ---------------- zoom de lectura e indicador ---------------- */

	/** Zoom actual en %: 100 % es la letra a su tamano real. */
	zoomPct(canvas) {
		const z = typeof canvas.zoom === 'number' ? canvas.zoom : 0;
		return Math.round(Math.pow(2, z) * 100);
	}

	/** Lleva la vista a un zoom (en %), centrada en cx, cy o donde esta. */
	setZoomPct(canvas, pct, cx, cy) {
		if (!canvas || typeof canvas.markViewportChanged !== 'function') return false;
		canvas.tx = typeof cx === 'number' ? cx : canvas.x;
		canvas.ty = typeof cy === 'number' ? cy : canvas.y;
		canvas.tZoom = Math.log2(Math.max(0.1, pct / 100));
		canvas.zoomCenter = null;
		canvas.markViewportChanged();
		return true;
	}

	/**
	 * Al abrir un canvas, Obsidian encuadra todo el mapa y nunca pasa del 100 %.
	 * Si hay un zoom de apertura elegido, cuando Obsidian termina ese encuadre
	 * llevamos la vista a ese zoom: centrada en el mapa principal, pero sin que
	 * su raiz quede afuera. Una sola vez por pestana abierta.
	 */
	applyOpenZoom(canvas) {
		const pct = Number(this.settings.openZoom) || 0;
		if (!pct || !canvas || !canvas.view) return false;
		if (!this.openZoomed) this.openZoomed = new WeakSet();
		if (this.openZoomed.has(canvas.view)) return false;
		if (canvas.zoomToFitQueued || !canvas.nodes || !canvas.nodes.size) return false; // todavia abriendo
		this.openZoomed.add(canvas.view);
		const graph = buildGraph(canvas, this.settings);
		let raiz = null;
		let mayor = -1;
		for (const r of graph.roots) {
			const n = subtreeOf(r, true).length;
			if (n > mayor) { mayor = n; raiz = r; }
		}
		if (!raiz) return false;
		let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		for (const n of subtreeOf(raiz, true)) {
			x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y);
			x1 = Math.max(x1, n.x + n.w); y1 = Math.max(y1, n.y + n.h);
		}
		const escala = pct / 100;
		const rect = canvas.canvasRect || {};
		const vw = (rect.width || 1200) / escala;
		const vh = (rect.height || 700) / escala;
		let cx = (x0 + x1) / 2;
		let cy = (y0 + y1) / 2;
		const m = 60;
		if (raiz.x - m < cx - vw / 2) cx = raiz.x - m + vw / 2;
		if (raiz.x + raiz.w + m > cx + vw / 2) cx = raiz.x + raiz.w + m - vw / 2;
		if (raiz.y - m < cy - vh / 2) cy = raiz.y - m + vh / 2;
		if (raiz.y + raiz.h + m > cy + vh / 2) cy = raiz.y + raiz.h + m - vh / 2;
		return this.setZoomPct(canvas, pct, cx, cy);
	}

	/* ---------------- panel de herramientas ---------------- */

	/** La ruedita abajo a la izquierda, al lado del zoom, y su panel. */
	updateToolPanel(canvas) {
		const wrap = canvas && canvas.wrapperEl;
		if (!wrap || typeof wrap.querySelector !== 'function') return;
		let host = wrap.querySelector(':scope > .mm-tools');
		if (!this.settings.toolPanel) {
			if (host) host.remove();
			return;
		}
		if (host) return;
		host = document.createElement('div');
		host.className = 'mm-tools';
		const btn = document.createElement('button');
		btn.className = 'mm-tools-btn';
		btn.type = 'button';
		btn.textContent = '\u2699';
		const tip = t('Map tools: style, background, text size, map type, alignment');
		btn.setAttribute('title', tip);
		btn.setAttribute('aria-label', tip);
		const panel = document.createElement('div');
		panel.className = 'mm-panel';
		panel.hidden = true;
		host.appendChild(btn);
		host.appendChild(panel);
		host.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			const c = getCanvas(this.app) || canvas;
			if (panel.hidden) {
				paintToolPanel(this, c, panel);
				panel.hidden = false;
				host.classList.add('is-open');
			} else {
				panel.hidden = true;
				host.classList.remove('is-open');
			}
		});
		wrap.appendChild(host);
		if (!this.panelCerrarListo) {
			this.panelCerrarListo = true;
			const cerrar = (evt) => {
				const t = evt && evt.target;
				document.querySelectorAll('.mm-tools.is-open').forEach((h) => {
					if (t && typeof h.contains === 'function' && h.contains(t)) return;
					h.classList.remove('is-open');
					const pn = h.querySelector(':scope > .mm-panel');
					if (pn) pn.hidden = true;
				});
			};
			this.registerDomEvent(document, 'pointerdown', cerrar, true);
			this.registerDomEvent(document, 'keydown', (evt) => { if (evt.key === 'Escape') cerrar(null); }, true);
		}
	}

	/** Abre el panel desde un comando, sin tener que buscar la ruedita. */
	openToolPanel() {
		const canvas = this.requireCanvas({ readOnly: true });
		if (!canvas) return;
		this.settings.toolPanel = true;
		this.updateToolPanel(canvas);
		const host = canvas.wrapperEl && canvas.wrapperEl.querySelector(':scope > .mm-tools');
		const btn = host && host.querySelector(':scope > .mm-tools-btn');
		if (btn) btn.click();
	}

	/** px de mas para la letra de los nodos (0 a 6). */
	setFontBump(px) {
		const v = Math.max(0, Math.min(6, Math.round((Number(px) || 0) * 2) / 2));
		this.settings.fontBump = v;
		this.saveSettings();
		const canvas = getCanvas(this.app);
		if (canvas) syncDecorations(canvas, this.settings, this);
		return v;
	}

	setFontLevels(on) {
		this.settings.fontLevels = !!on;
		this.saveSettings();
		const canvas = getCanvas(this.app);
		if (canvas) syncDecorations(canvas, this.settings, this);
	}

	/** Tipo de mapa: deja esa direccion para el canvas y lo reorganiza. */
	setMapDirection(dir) {
		const canvas = this.requireCanvas();
		if (!canvas || !DIRECTIONS[dir]) return;
		this.mapState(canvas).dir = dir;
		this.saveSettings();
		this.layout(dir, true);
	}

	/** Pastilla con el nivel de zoom; un clic vuelve al zoom de lectura. */
	updateZoomIndicator(canvas) {
		const wrap = canvas && canvas.wrapperEl;
		if (!wrap || typeof wrap.querySelector !== 'function') return;
		let el = wrap.querySelector(':scope > .mm-zoom');
		if (!this.settings.zoomIndicator) {
			if (el) el.remove();
			return;
		}
		const lectura = Number(this.settings.openZoom) || 100;
		if (!el) {
			el = document.createElement('div');
			el.className = 'mm-zoom';
			el.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
			el.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const c = getCanvas(this.app);
				if (c) this.setZoomPct(c, Number(this.settings.openZoom) || 100);
			});
			wrap.appendChild(el);
		}
		const txt = this.zoomPct(canvas) + ' %';
		if (el.textContent !== txt) el.textContent = txt;
		const tip = t('Zoom level. Click: back to {pct} %', { pct: lectura });
		if (el.getAttribute('title') !== tip) {
			el.setAttribute('title', tip);
			el.setAttribute('aria-label', tip);
		}
	}

	/* ---------------- letra legible al escribir ---------------- */

	/**
	 * Al abrir un canvas, Obsidian lo encuadra para que entre todo, y ese
	 * encuadre nunca pasa del 100%: en un mapa ancho la letra queda chiquita.
	 * Cuando empezas a escribir en un nodo, si su letra se veria mas chica que
	 * `readablePx` en pantalla, acercamos la vista a ese nodo. Nunca aleja.
	 */
	ensureReadable(canvas, node, force) {
		if (!canvas || !node) return false;
		if (!force && !this.settings.zoomOnEdit) return false;
		const target = Math.max(8, Number(this.settings.readablePx) || 14);
		const d = safeData(node) || {};
		const letra = nodeFontPx(baseFontSize(), Number(d[FONT_KEY]) || 1, this.settings.fontBump);
		const zoom = typeof canvas.zoom === 'number' ? canvas.zoom : 0;
		const escala = typeof canvas.scale === 'number' && canvas.scale > 0 ? canvas.scale : Math.pow(2, zoom);
		if (letra * escala >= target - 0.25) return false;
		const nuevo = Math.min(2, Math.log2(target / letra));
		if (typeof canvas.markViewportChanged !== 'function') return false;
		canvas.tx = node.x + (node.width || 0) / 2;
		canvas.ty = node.y + (node.height || 0) / 2;
		canvas.tZoom = nuevo;
		canvas.zoomCenter = null;
		canvas.markViewportChanged();
		return true;
	}

	/** Cuando el editor de un nodo toma el foco, que la letra se lea. */
	onFocusIn(evt) {
		if (!this.settings.zoomOnEdit) return;
		const t = evt.target;
		if (!t || typeof t.closest !== 'function') return;
		const nodeEl = t.closest('.canvas-node');
		if (!nodeEl) return;
		const canvas = getCanvas(this.app);
		if (!canvas) return;
		let node = null;
		canvas.nodes.forEach((n) => { if (n.nodeEl === nodeEl) node = n; });
		if (node) this.ensureReadable(canvas, node);
	}

	/* ---------------- estilos del mapa ---------------- */

	themeOf(canvas) {
		const t = this.mapState(canvas).theme;
		return THEMES[t] ? t : 'ninguno';
	}

	/** El fondo del canvas, independiente del estilo. */
	setBackground(key) {
		const canvas = this.requireCanvas();
		if (!canvas || !BACKGROUNDS[key]) return;
		this.mapState(canvas).bg = key;
		this.saveSettings();
		syncDecorations(canvas, this.settings, this);
		new Notice(t('Canvas background: {name}.', { name: BACKGROUNDS[key].label }));
	}

	backgroundOf(canvas) {
		const b = this.mapState(canvas).bg;
		return BACKGROUNDS[b] ? b : 'tema';
	}

	setTheme(key) {
		const canvas = this.requireCanvas();
		if (!canvas || !THEMES[key]) return;
		this.mapState(canvas).theme = key;
		this.saveSettings();
		syncDecorations(canvas, this.settings, this);
		new Notice(t('Map style: {name}.', { name: THEMES[key].label }));
	}

	/**
	 * Aplica el estilo del canvas: una clase en el contenedor y, en cada nodo y
	 * flecha, su nivel y su rama. Lo que pintaste a mano no recibe rama y
	 * conserva tu color. Imagenes, notas y links no se tocan: el estilo viste el
	 * marco, nunca el contenido.
	 */
	applyTheme(canvas, graph) {
		const tema = this.themeOf(canvas);
		const fondo = this.backgroundOf(canvas);
		const wrap = canvas.wrapperEl;
		if (wrap && wrap.classList) {
			for (const k of Object.keys(THEMES)) {
				const on = k === tema && k !== 'ninguno';
				if (wrap.classList.contains('mm-theme-' + k) !== on) wrap.classList.toggle('mm-theme-' + k, on);
			}
			for (const k of Object.keys(BACKGROUNDS)) {
				const on = k === fondo && k !== 'tema';
				if (wrap.classList.contains('mm-bg-' + k) !== on) wrap.classList.toggle('mm-bg-' + k, on);
			}
		}
		if (tema === 'ninguno' || !graph) return;
		this.ensureGrid(canvas);
		const info = themeInfo(graph);
		canvas.nodes.forEach((node) => {
			const el = node.nodeEl;
			if (!el) return;
			const d = safeData(node) || {};
			const i = info.get(node.id);
			setData(el, 'data-mm-type', d.type || 'text');
			setData(el, 'data-mm-media', hasMedia(el) ? '1' : null);
			setData(el, 'data-mm-lvl', d.type === 'group' ? 'g' : (i ? i.lvl : 'x'));
			setData(el, 'data-mm-branch', i && i.br !== null && !d.color ? String(i.br) : null);
		});
		const porFlecha = new Map();
		graph.nodes.forEach((n) => { if (n.parentEdge) porFlecha.set(n.parentEdge.id, info.get(n.id)); });
		canvas.edges.forEach((edge) => {
			const d = safeData(edge) || {};
			const i = porFlecha.get(d.id || edge.id);
			for (const el of [edge.lineGroupEl, edge.lineEndGroupEl]) {
				setData(el, 'data-mm-lvl', i ? i.lvl : 'x');
				setData(el, 'data-mm-branch', i && i.br !== null && !d.color ? String(i.br) : null);
			}
		});
	}

	/**
	 * Cuadriculado para "Cuaderno": una linea horizontal y una vertical dentro
	 * del patron del fondo. El patron recorta cada baldosa, asi que la grilla
	 * acompana sola cualquier zoom y desplazamiento. En los demas queda oculta.
	 */
	ensureGrid(canvas) {
		const pat = canvas.backgroundPatternEl;
		if (!pat || typeof pat.querySelector !== 'function' || pat.querySelector('.mm-grid-line')) return;
		if (typeof document.createElementNS !== 'function') return;
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.classList.add('mm-grid-line');
		path.setAttribute('d', 'M0 0.5H99999M0.5 0V99999');
		pat.appendChild(path);
	}

	/* ---------------- color y forma (estilo iThoughts) ---------------- */

	/** Pinta toda la rama (nodos y flechas internas) con un color de la paleta. */
	colorBranch(color, targets) {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const entries = targets
			? targets.map((n) => graph.nodes.get(n.id)).filter(Boolean)
			: this.selectionRoots(canvas, graph);
		if (!entries.length) { new Notice(t('Select at least one card.')); return; }
		const ids = new Set();
		for (const e of entries) for (const n of subtreeOf(e, true)) ids.add(n.id);
		const data = safeData(canvas);
		if (!data) return;
		this.paintIds(data, ids, color);
		applyCanvasData(canvas, data);
		new Notice(color ? t('Branch colored ({n} cards).', { n: ids.size }) : t('Color removed from the branch.'));
	}

	paintIds(data, ids, color) {
		for (const n of data.nodes) {
			if (!ids.has(n.id)) continue;
			if (color) n.color = color; else delete n.color;
		}
		for (const e of (data.edges || [])) {
			if (!ids.has(e.fromNode) || !ids.has(e.toNode)) continue;
			if (color) e.color = color; else delete e.color;
		}
	}

	/** Un color distinto por rama principal, como los mapas de iThoughts. */
	autoColorBranches() {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const data = safeData(canvas);
		if (!data) return;
		let i = 0;
		let painted = 0;
		for (const root of graph.roots) {
			const kids = root.children.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
			for (const kid of kids) {
				const color = CANVAS_COLORS[i++ % CANVAS_COLORS.length].id;
				const ids = new Set(subtreeOf(kid, true).map((n) => n.id));
				ids.add(root.id); // para pintar tambien la flecha que sale del centro
				this.paintIds(data, ids, color);
				// el nodo central queda neutro
				const center = data.nodes.find((n) => n.id === root.id);
				if (center) delete center.color;
				painted += ids.size - 1;
			}
		}
		if (!painted) { new Notice(t('There are no branches to color.')); return; }
		applyCanvasData(canvas, data);
		new Notice(t('Branches colored: {n} cards.', { n: painted }));
	}

	/** Acerca la vista a la rama seleccionada. */
	focusBranch() {
		const canvas = this.requireCanvas({ readOnly: true });
		if (!canvas) return;
		this.selectBranch();
		try {
			if (typeof canvas.zoomToSelection === 'function') canvas.zoomToSelection();
			else if (typeof canvas.zoomToFit === 'function') canvas.zoomToFit();
		} catch (e) { /* noop */ }
	}

	/** Ordena alfabeticamente los hijos del nodo seleccionado y reacomoda. */
	sortSiblings(desc) {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const entries = this.selectionRoots(canvas, graph);
		if (!entries.length) { new Notice(t('Select the card whose children you want to sort.')); return; }
		const st = this.mapState(canvas);
		const horiz = st.dir === 'right' || st.dir === 'left' || st.dir === 'both-h';
		let touched = 0;
		for (const e of entries) {
			const kids = e.children.slice();
			if (kids.length < 2) continue;
			const coords = kids.map((k) => (horiz ? k.y : k.x)).sort((a, b) => a - b);
			const sorted = kids.slice().sort((a, b) =>
				nodeLabel(a.data).localeCompare(nodeLabel(b.data), 'es', { sensitivity: 'base', numeric: true }));
			if (desc) sorted.reverse();
			sorted.forEach((k, i) => { if (horiz) k.y = coords[i]; else k.x = coords[i]; });
			touched += kids.length;
		}
		if (!touched) { new Notice(t('The card has no children to sort.')); return; }
		runLayout(canvas, entries, st.dir, this.settings, false, null, true);
		new Notice(desc ? t('Siblings sorted ({n}) from Z to A.', { n: touched }) : t('Siblings sorted ({n}) from A to Z.', { n: touched }));
	}

	/** Iguala el tamano de todos los nodos de la rama. */
	equalizeSize() {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const entries = this.selectionRoots(canvas, graph);
		if (!entries.length) { new Notice(t('Select at least one card.')); return; }
		const nodes = [];
		const seen = new Set();
		for (const e of entries) {
			for (const n of subtreeOf(e, true)) {
				if (seen.has(n.id)) continue;
				seen.add(n.id);
				nodes.push(n);
			}
		}
		let w = 0;
		let h = 0;
		for (const n of nodes) { w = Math.max(w, n.w); h = Math.max(h, n.h); }
		const data = safeData(canvas);
		if (!data) return;
		for (const n of data.nodes) {
			if (!seen.has(n.id) || n.type === 'group') continue;
			n.width = Math.round(w);
			n.height = Math.round(h);
		}
		applyCanvasData(canvas, data);
		const st = this.mapState(canvas);
		// el reacomodo tiene que medir las cajas con su tamano nuevo
		const fresh = buildGraph(canvas, this.settings);
		const again = entries.map((e) => fresh.nodes.get(e.id)).filter(Boolean);
		runLayout(canvas, again, st.dir, this.settings, false, null, true);
		new Notice(t('Size evened out on {n} cards ({w} x {h}).', { n: nodes.length, w: Math.round(w), h: Math.round(h) }));
	}

	/** Deja a la vista solo los primeros `level` niveles del mapa. */
	collapseToLevel(level) {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		this.expandAll(true);
		const graph = buildGraph(canvas, this.settings);
		const data = safeData(canvas);
		if (!data) return;
		const snapshot = JSON.parse(JSON.stringify(data));
		const targets = [];
		graph.nodes.forEach((n) => { if (n.children.length && depthOf(n) === level - 1) targets.push(n); });
		const checkIds = [];
		const pending = [];
		let total = 0;
		for (const entry of targets) {
			const payload = collapseInData(data, entry);
			if (payload) {
				total += payload.nodes.length;
				checkIds.push(entry.id);
				pending.push({ id: entry.id, payload });
			}
		}
		if (!total) { new Notice(t('The map already fits in {n} level(s).', { n: level })); return; }
		if (!this.applyVerified(canvas, data, snapshot, checkIds)) return;
		for (const p of pending) this.pushBackup(canvas, p.id, p.payload);
		this.autoRelayout(canvas, 'collapse');
		new Notice(t('Showing {n} level(s): {hidden} cards hidden.', { n: level, hidden: total }));
	}

	setAlignMode(mode) {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const st = this.mapState(canvas);
		st.mode = mode;
		this.saveSettings();
		new Notice(t('Automatic alignment: {mode} ({hint}).', { mode: ALIGN_LABEL[mode], hint: ALIGN_HINT[mode] }));
		if (mode !== 'manual') this.autoRelayout(canvas, 'collapse');
	}

	setEdgeProps(props, targetEdge) {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const targets = targetEdge ? [targetEdge] : selectedEdges(canvas);
		if (!targets.length) { new Notice(t('Select one or more arrows.')); return; }
		const ids = new Set(targets.map((e) => e.id));
		const data = safeData(canvas);
		if (!data) return;
		let n = 0;
		for (const e of (data.edges || [])) {
			if (!ids.has(e.id)) continue;
			for (const key of Object.keys(props)) {
				if (props[key] === null) delete e[key];
				else e[key] = props[key];
			}
			n++;
		}
		applyCanvasData(canvas, data);
		window.setTimeout(() => syncDecorations(getCanvas(this.app), this.settings, this), 30);
		new Notice(t('{n} arrow(s) updated.', { n }));
	}

	cycleEdgeStyle() {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const edges = selectedEdges(canvas);
		if (!edges.length) { new Notice(t('Select one or more arrows.')); return; }
		const cur = (safeData(edges[0]) || {})[STYLE_KEY] || 'solid';
		const next = EDGE_STYLE_ORDER[(EDGE_STYLE_ORDER.indexOf(cur) + 1) % EDGE_STYLE_ORDER.length];
		const props = {};
		props[STYLE_KEY] = next;
		this.setEdgeProps(props);
	}

	restoreLost() {
		const canvas = this.requireCanvas();
		if (!canvas) return;
		const data = safeData(canvas);
		if (!data) return;
		const path = canvasFilePath(canvas);
		const present = collectAllIds(data);
		const nodeIds = new Set(data.nodes.map((n) => n.id));
		if (!data.edges) data.edges = [];
		const edgeIds = new Set(data.edges.map((e) => e.id));
		let restored = 0;
		for (const b of this.backups) {
			if (b.file !== path || !b.payload || !Array.isArray(b.payload.nodes)) continue;
			for (const n of b.payload.nodes) {
				if (present.has(n.id) || nodeIds.has(n.id)) continue;
				data.nodes.push(n);
				nodeIds.add(n.id);
				present.add(n.id);
				restored++;
			}
			for (const e of (b.payload.edges || [])) {
				if (edgeIds.has(e.id)) continue;
				if (!nodeIds.has(e.fromNode) || !nodeIds.has(e.toNode)) continue;
				data.edges.push(e);
				edgeIds.add(e.id);
			}
		}
		if (!restored) { new Notice(t('There are no lost collapsed branches for this canvas.')); return; }
		applyCanvasData(canvas, data);
		new Notice(t('{n} cards restored from the backup.', { n: restored }));
	}

	/* ---------------- exportar ---------------- */

	exportInfo(canvas) {
		const data = safeData(canvas);
		if (!data) return null;
		const path = canvasFilePath(canvas);
		const stem = path ? path.replace(/\.canvas$/i, '') : t('Map');
		const title = stem.split('/').pop();
		let vault = '';
		try { vault = this.app.vault.getName(); } catch (e) { /* noop */ }
		const model = exportModel(data, this.settings, this.mapState(canvas).dir, title, vault);
		return { model, stem, title };
	}

	/**
	 * Donde escribir. Nunca pisa un archivo tuyo: si ya existe uno con ese nombre
	 * y no es una exportacion anterior de este plugin, usa "nombre 2", "nombre 3"...
	 * Devuelve { path, file } (file = el archivo a actualizar, o null si es nuevo).
	 */
	async exportTarget(stem, ext) {
		const vault = this.app.vault;
		for (let i = 1; i <= 50; i++) {
			const path = normalizePath(stem + (i === 1 ? '' : ' ' + i) + ext);
			const file = vault.getAbstractFileByPath(path);
			if (!file) return { path, file: null };
			if (!(file instanceof TFile)) continue; // una carpeta con ese nombre
			try {
				const prev = await vault.cachedRead(file);
				if (typeof prev === 'string' && (prev.indexOf(EXPORT_MARK) > -1 || prev.indexOf(OLD_EXPORT_MARK) > -1)) return { path, file };
			} catch (e) { /* no se pudo leer: probamos con otro nombre */ }
		}
		return null;
	}

	/** Exporta el mapa entero (tambien lo que esta dentro de ramas colapsadas). */
	async exportMap(format) {
		const canvas = this.requireCanvas({ readOnly: true });
		if (!canvas) return null;
		const def = EXPORT_FORMATS[format];
		if (!def) return null;
		const info = this.exportInfo(canvas);
		if (!info || !info.model.count) {
			new Notice(t('This canvas has no cards to export.'));
			return null;
		}
		try {
			const target = await this.exportTarget(info.stem + def.suffix, def.ext);
			if (!target) {
				new Notice(t('Could not export: there are already too many files with that name.'));
				return null;
			}
			const content = def.build(info.model);
			if (target.file) await this.app.vault.process(target.file, () => content);
			else await this.app.vault.create(target.path, content);
			new Notice(t('Exported to {format} ({n} cards):', { format: def.label, n: info.model.count }) + '\n' + target.path, 9000);
			if (format !== 'md' && this.settings.revealExport) {
				// Mostrar el archivo en el explorador: solo existe en la app de escritorio.
				try { if (typeof this.app.showInFolder === 'function') this.app.showInFolder(target.path); } catch (e) { /* noop */ }
			}
			return target.path;
		} catch (e) {
			console.error('[Othoughts] export failed', e);
			new Notice(t('Othoughts: export failed (see the console).'));
			return null;
		}
	}

	/** Copia el esquema al portapapeles como lista de Markdown. */
	async copyOutline() {
		const canvas = this.requireCanvas({ readOnly: true });
		if (!canvas) return false;
		const info = this.exportInfo(canvas);
		if (!info || !info.model.count) {
			new Notice(t('This canvas has no cards to copy.'));
			return false;
		}
		try {
			await navigator.clipboard.writeText(toMarkdown(info.model, true));
			new Notice(t('Outline copied: {n} cards.', { n: info.model.count }));
			return true;
		} catch (e) {
			console.error('[Othoughts] copy failed', e);
			new Notice(t('Could not copy to the clipboard.'));
			return false;
		}
	}

	/* ---------------- instantaneas ---------------- */

	/** Carpeta donde van todas las instantaneas. */
	snapshotRoot() {
		const raw = normalizePath(this.settings.snapshotFolder || t('Map snapshots'));
		return raw && raw !== '/' ? raw : 'Map snapshots';
	}

	isSnapshotPath(path) {
		return !!path && path.indexOf(this.snapshotRoot() + '/') === 0;
	}

	/** Carpeta de las instantaneas de un canvas: <raiz>/<ruta del canvas sin .canvas>. */
	snapshotFolderFor(canvasPath) {
		return normalizePath(this.snapshotRoot() + '/' + String(canvasPath).replace(/\.canvas$/i, ''));
	}

	/** El canvas original de una instantanea; para un canvas comun, el mismo. */
	sourceOfPath(path) {
		if (!path || !this.isSnapshotPath(path)) return path || null;
		const rest = path.slice(this.snapshotRoot().length + 1);
		const i = rest.lastIndexOf('/');
		return i > 0 ? rest.slice(0, i) + '.canvas' : null;
	}

	async ensureFolder(path) {
		const vault = this.app.vault;
		let cur = '';
		for (const part of normalizePath(path).split('/')) {
			if (!part) continue;
			cur = cur ? cur + '/' + part : part;
			const f = vault.getAbstractFileByPath(cur);
			if (f instanceof TFolder) continue;
			if (f) throw new Error('A file is in the way: ' + cur);
			try { await vault.createFolder(cur); } catch (e) {
				if (!(vault.getAbstractFileByPath(cur) instanceof TFolder)) throw e;
			}
		}
	}

	/** Instantaneas de un canvas, de la mas nueva a la mas vieja. */
	listSnapshots(canvasPath) {
		if (!canvasPath) return [];
		const folder = this.app.vault.getAbstractFileByPath(this.snapshotFolderFor(canvasPath));
		if (!(folder instanceof TFolder)) return [];
		const out = [];
		for (const f of folder.children || []) {
			if (!(f instanceof TFile) || f.extension !== 'canvas') continue;
			const info = parseSnapshotName(f.basename);
			out.push({
				file: f,
				time: info ? info.time : (f.stat ? f.stat.mtime : 0),
				label: info ? info.label : f.basename,
			});
		}
		out.sort((a, b) => (b.time - a.time) || (a.file.path < b.file.path ? 1 : -1));
		return out;
	}

	async readSnapshot(file) {
		try {
			const d = JSON.parse(await this.app.vault.cachedRead(file));
			return d && Array.isArray(d.nodes) ? d : null;
		} catch (e) {
			return null;
		}
	}

	/** Como esta ahora el canvas original de una instantanea (abierto o no). */
	async readSourceData(sourcePath) {
		for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
			const c = leaf.view && leaf.view.canvas;
			if (c && canvasFilePath(c) === sourcePath) return safeData(c);
		}
		const f = this.app.vault.getAbstractFileByPath(sourcePath);
		return f instanceof TFile ? this.readSnapshot(f) : null;
	}

	/**
	 * Guarda una instantanea: una copia del canvas tal como esta ahora, incluido
	 * lo que esta dentro de ramas colapsadas. Devuelve el archivo, o null.
	 * `opts.quiet`: sin avisos (para las automaticas); `opts.now`: la hora.
	 */
	async takeSnapshot(canvas, label, opts) {
		const o = opts || {};
		const path = canvasFilePath(canvas);
		if (!path || this.isSnapshotPath(path)) {
			if (!o.quiet) new Notice(t('This is a snapshot: take snapshots from the original canvas.'));
			return null;
		}
		flushLayout(canvas);
		const data = safeData(canvas);
		if (!data || !Array.isArray(data.nodes)) return null;
		if (!this.settings.snapshotFolder) {
			// la carpeta queda fija desde la primera: si despues cambia el idioma, no se pierde
			this.settings.snapshotFolder = this.snapshotRoot();
			await this.saveSettings();
		}
		try {
			const folder = this.snapshotFolderFor(path);
			await this.ensureFolder(folder);
			const clean = cleanSnapshotLabel(label);
			const when = new Date(o.now || Date.now());
			const vault = this.app.vault;
			let target = null;
			for (const stamp of [snapshotStamp(when), snapshotStamp(when, true)]) {
				const candidate = normalizePath(folder + '/' + stamp + (clean ? SNAP_SEPARATOR + clean : '') + '.canvas');
				if (!vault.getAbstractFileByPath(candidate)) { target = candidate; break; }
			}
			if (!target) {
				if (!o.quiet) new Notice(t('There is already a snapshot from this very second. Try again in a moment.'));
				return null;
			}
			const content = JSON.stringify({ nodes: data.nodes, edges: data.edges || [] }, null, '\t');
			const file = await vault.create(target, content);
			if (!o.quiet) new Notice(t('Snapshot saved: {name}', { name: formatWhen(when.getTime()) + (clean ? SNAP_SEPARATOR + clean : '') }));
			this.refreshSnapshotViews();
			return file;
		} catch (e) {
			console.error('[Othoughts] could not save the snapshot', e);
			if (!o.quiet) new Notice(t('Could not save the snapshot (see the console).'));
			return null;
		}
	}

	/** Boton o comando: pide un nombre (opcional) y guarda. */
	async takeSnapshotFromUi() {
		const canvas = this.requireCanvas({ readOnly: true });
		if (!canvas) return null;
		if (this.isSnapshotPath(canvasFilePath(canvas))) {
			new Notice(t('This is a snapshot: take snapshots from the original canvas.'));
			return null;
		}
		const label = await this.askText({
			title: t('Take snapshot'),
			message: t('A copy of the map as it is now. You can give it a name, or leave it blank.'),
			placeholder: t('For example: before the conference'),
			ok: t('Save'),
		});
		if (label === null) return null;
		return this.takeSnapshot(canvas, label);
	}

	/**
	 * Instantanea automatica: como mucho una por dia (o por semana), y solo si el
	 * mapa cambio desde la ultima. Se toma la primera vez que lo abris o lo usas
	 * en el dia, asi queda guardado como estaba antes de lo que hagas despues.
	 */
	async autoSnapshot(canvas, now) {
		const mode = this.settings.autoSnapshot;
		if (mode !== 'daily' && mode !== 'weekly') return null;
		if (!canvas || canvas.readonly) return null;
		const path = canvasFilePath(canvas);
		if (!path || this.isSnapshotPath(path) || this.snapshotBusy.has(path)) return null;
		const t0 = now || Date.now();
		const wait = this.snapshotChecks.get(path);
		if (wait && t0 < wait) return null;
		this.snapshotChecks.set(path, t0 + 10 * 60 * 1000); // no volver a mirar en 10 minutos
		this.snapshotBusy.add(path);
		try {
			const data = safeData(canvas);
			if (!data || !Array.isArray(data.nodes) || !data.nodes.length) return null;
			const last = this.listSnapshots(path)[0];
			if (last && !snapshotDue(last.time, t0, mode)) return null;
			if (last) {
				const prev = await this.readSnapshot(last.file);
				if (prev && sameMap(prev, data)) return null; // no cambio nada
			}
			return await this.takeSnapshot(canvas, t('automatic'), { quiet: true, now: t0 });
		} finally {
			this.snapshotBusy.delete(path);
		}
	}

	/** Abre una instantanea en una pestana nueva (se traba en solo lectura al abrirse). */
	async openSnapshot(file) {
		if (!file) return;
		await this.app.workspace.getLeaf('tab').openFile(file);
	}

	async openSourceOf(snapshotPath) {
		const source = this.sourceOfPath(snapshotPath);
		const f = source ? this.app.vault.getAbstractFileByPath(source) : null;
		if (!(f instanceof TFile)) { new Notice(t('The original canvas is not there anymore.')); return; }
		await this.app.workspace.getLeaf(false).openFile(f);
	}

	/**
	 * Una instantanea se abre en solo lectura, para que la historia no se toque
	 * por accidente. Se traba una vez por sesion: si la destrabas a proposito
	 * desde los controles del canvas, queda destrabada.
	 */
	lockSnapshot(canvas) {
		const path = canvasFilePath(canvas);
		if (!path || !this.isSnapshotPath(path) || this.lockedSnapshots.has(path)) return false;
		this.lockedSnapshots.add(path);
		if (canvas.readonly || typeof canvas.setReadonly !== 'function') return false;
		try {
			canvas.setReadonly(true);
			if (canvas.view && typeof canvas.view.saveLocalData === 'function') canvas.view.saveLocalData();
		} catch (e) { /* noop */ }
		return true;
	}

	/** Vuelve el canvas a como estaba en una instantanea. Antes guarda como esta ahora. */
	async restoreSnapshot(canvas, file) {
		if (!canvas || !file || canvas.readonly) return false;
		const path = canvasFilePath(canvas);
		if (this.sourceOfPath(file.path) !== path || this.isSnapshotPath(path)) return false;
		const data = await this.readSnapshot(file);
		if (!data) { new Notice(t('That snapshot could not be read.')); return false; }
		const current = safeData(canvas);
		if (current && Array.isArray(current.nodes) && current.nodes.length) {
			const before = await this.takeSnapshot(canvas, t('before restoring'), { quiet: true });
			if (!before) {
				new Notice(t('Could not save the current version first, so nothing was restored.'));
				return false;
			}
		}
		flushLayout(canvas);
		if (!applyCanvasData(canvas, { nodes: data.nodes, edges: data.edges || [] })) return false;
		syncDecorations(canvas, this.settings, this);
		new Notice(t('Map restored to {when}. The previous version was saved as a snapshot.', { when: formatWhen(parseSnapshotTime(file)) }));
		this.refreshSnapshotViews();
		return true;
	}

	async restoreSnapshotFromUi(file) {
		const canvas = this.requireCanvas();
		if (!canvas) return false;
		const ok = await this.askConfirm({
			title: t('Restore snapshot'),
			message: t('The map will go back to how it was on {when}. Before that, how it is now is saved as another snapshot, so you can undo this.', { when: formatWhen(parseSnapshotTime(file)) }),
			ok: t('Restore'),
		});
		if (!ok) return false;
		return this.restoreSnapshot(canvas, file);
	}

	async renameSnapshot(file) {
		const info = parseSnapshotName(file.basename);
		const label = await this.askText({
			title: t('Rename snapshot'),
			value: info ? info.label : file.basename,
			placeholder: t('For example: before the conference'),
			ok: t('Rename'),
		});
		if (label === null) return false;
		const clean = cleanSnapshotLabel(label);
		const base = info ? info.stamp + (clean ? SNAP_SEPARATOR + clean : '') : (clean || file.basename);
		const parent = file.parent ? file.parent.path : file.path.slice(0, file.path.lastIndexOf('/'));
		const target = normalizePath(parent + '/' + base + '.canvas');
		if (target === file.path) return false;
		if (this.app.vault.getAbstractFileByPath(target)) { new Notice(t('There is already a snapshot with that name.')); return false; }
		await this.app.fileManager.renameFile(file, target);
		this.refreshSnapshotViews();
		return true;
	}

	async deleteSnapshot(file) {
		const ok = await this.askConfirm({
			title: t('Delete snapshot'),
			message: t('Delete the snapshot of {when}? It goes to the trash, as set in your Obsidian settings.', { when: formatWhen(parseSnapshotTime(file)) }),
			ok: t('Delete'),
			warning: true,
		});
		if (!ok) return false;
		await this.app.fileManager.trashFile(file);
		this.refreshSnapshotViews();
		return true;
	}

	/** Si moves o renombras un canvas (o una carpeta con canvas), su historia lo sigue. */
	async moveSnapshotsFor(oldPath, newPath, isFolder) {
		if (this.isSnapshotPath(oldPath) || this.isSnapshotPath(newPath)) return false;
		const vault = this.app.vault;
		const from = vault.getAbstractFileByPath(isFolder ? normalizePath(this.snapshotRoot() + '/' + oldPath) : this.snapshotFolderFor(oldPath));
		if (!(from instanceof TFolder)) return false;
		const to = isFolder ? normalizePath(this.snapshotRoot() + '/' + newPath) : this.snapshotFolderFor(newPath);
		if (vault.getAbstractFileByPath(to)) return false; // ya hay algo ahi: no se mezcla
		const parent = to.slice(0, to.lastIndexOf('/'));
		if (parent) await this.ensureFolder(parent);
		await this.app.fileManager.renameFile(from, to);
		return true;
	}

	/** Elegir otra carpeta para las instantaneas: las que ya habia se mudan con ella. */
	async changeSnapshotFolder(value) {
		const next = normalizePath(String(value || '').trim());
		if (!next || next === '/' || next === this.snapshotRoot()) return false;
		const vault = this.app.vault;
		if (vault.getAbstractFileByPath(next)) {
			new Notice(t('There is already a file or folder called {name}. Choose another name.', { name: next }));
			return false;
		}
		const old = vault.getAbstractFileByPath(this.snapshotRoot());
		if (old instanceof TFolder) {
			const parent = next.slice(0, next.lastIndexOf('/'));
			if (parent) await this.ensureFolder(parent);
			await this.app.fileManager.renameFile(old, next);
		}
		this.settings.snapshotFolder = next;
		await this.saveSettings();
		this.refreshSnapshotViews();
		return true;
	}

	async openSnapshotHistory() {
		const workspace = this.app.workspace;
		let leaf = workspace.getLeavesOfType(SNAPSHOTS_VIEW)[0];
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) { new Notice(t('Could not open the history panel.')); return; }
			await leaf.setViewState({ type: SNAPSHOTS_VIEW, active: true });
		}
		workspace.revealLeaf(leaf);
	}

	refreshSnapshotViews() {
		for (const leaf of this.app.workspace.getLeavesOfType(SNAPSHOTS_VIEW)) {
			if (leaf.view && typeof leaf.view.refreshSoon === 'function') leaf.view.refreshSoon();
		}
	}

	askConfirm(opts) {
		return new Promise((resolve) => new ConfirmModal(this.app, opts, resolve).open());
	}

	askText(opts) {
		return new Promise((resolve) => new TextModal(this.app, opts, resolve).open());
	}

	/* ---------------- comandos ---------------- */

	canvasCommand(id, name, fn) {
		this.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				if (!getCanvas(this.app)) return false;
				if (!checking) fn();
				return true;
			},
		});
	}

	addCommands() {
		this.canvasCommand('toggle-collapse', t('Collapse or expand branch'), () => this.toggleCollapse());
		this.canvasCommand('collapse-all', t('Collapse all branches'), () => this.collapseAll());
		this.canvasCommand('expand-all', t('Expand all branches'), () => this.expandAll());
		this.canvasCommand('select-branch', t('Select the whole branch'), () => this.selectBranch());

		this.canvasCommand('layout-right', t('Arrange: to the right'), () => this.layout('right'));
		this.canvasCommand('layout-left', t('Arrange: to the left'), () => this.layout('left'));
		this.canvasCommand('layout-down', t('Arrange: downward'), () => this.layout('down'));
		this.canvasCommand('layout-up', t('Arrange: upward'), () => this.layout('up'));
		this.canvasCommand('layout-both-h', t('Arrange: both sides (horizontal)'), () => this.layout('both-h'));
		this.canvasCommand('layout-both-v', t('Arrange: up and down (vertical)'), () => this.layout('both-v'));
		this.canvasCommand('layout-all', t('Arrange the whole canvas (default direction)'),
			() => this.layout(this.settings.defaultDirection, true));

		Object.keys(ARROW_PRESETS).forEach((key) => {
			const preset = ARROW_PRESETS[key];
			this.canvasCommand('edge-arrow-' + key, t('Arrow: {name}', { name: preset.label }),
				() => this.setEdgeProps({ fromEnd: preset.fromEnd, toEnd: preset.toEnd }));
		});
		EDGE_STYLE_ORDER.forEach((style) => {
			this.canvasCommand('edge-style-' + style, t('Line: {name}', { name: EDGE_STYLE_LABELS[style] }), () => {
				const props = {};
				props[STYLE_KEY] = style;
				this.setEdgeProps(props);
			});
		});
		this.canvasCommand('edge-style-cycle', t('Line: switch to the next style'), () => this.cycleEdgeStyle());

		for (let lvl = 1; lvl <= 4; lvl++) {
			this.canvasCommand('collapse-to-level-' + lvl,
				(lvl === 1 ? t('Show only 1 level') : t('Show only {n} levels', { n: lvl })), () => this.collapseToLevel(lvl));
		}
		this.canvasCommand('focus-branch', t('Focus the selected branch'), () => this.focusBranch());
		this.canvasCommand('auto-color', t('Give each main branch its own color'), () => this.autoColorBranches());
		CANVAS_COLORS.forEach((c) => {
			this.canvasCommand('color-branch-' + c.id, t('Color the branch: {color}', { color: c.label }),
				() => this.colorBranch(c.id));
		});
		this.canvasCommand('color-branch-none', t('Remove the color from the branch'), () => this.colorBranch(null));
		this.canvasCommand('sort-asc', t('Sort children from A to Z'), () => this.sortSiblings(false));
		this.canvasCommand('sort-desc', t('Sort children from Z to A'), () => this.sortSiblings(true));
		this.canvasCommand('equalize', t('Even out the card sizes in the branch'), () => this.equalizeSize());
		ALIGN_MODES.forEach((mode) => {
			this.canvasCommand('align-' + mode, t('Automatic alignment: {mode}', { mode: ALIGN_LABEL[mode] }),
				() => this.setAlignMode(mode));
		});
		for (const k of Object.keys(EXPORT_FORMATS)) {
			this.canvasCommand('export-' + k, t('Export the map: {format}', { format: EXPORT_FORMATS[k].label }), () => this.exportMap(k));
		}
		this.canvasCommand('copy-outline', t('Copy the outline (Markdown list)'), () => this.copyOutline());
		this.canvasCommand('snapshot-take', t('Take a snapshot of the map'), () => this.takeSnapshotFromUi());
		this.addCommand({
			id: 'snapshot-history',
			name: t('Open the map history'),
			callback: () => this.openSnapshotHistory(),
		});
		this.addCommand({
			id: 'open-outline',
			name: t('Open the map outline'),
			callback: () => this.openOutline(),
		});
		const rumbos = {
			ArrowUp: [t('Go to the card above'), t('There is no card above.')],
			ArrowDown: [t('Go to the card below'), t('There is no card below.')],
			ArrowLeft: [t('Go to the card on the left'), t('There is no card on the left.')],
			ArrowRight: [t('Go to the card on the right'), t('There is no card on the right.')],
		};
		for (const key of ARROWS) {
			this.canvasCommand('nav-' + key.toLowerCase(), rumbos[key][0], () => {
				if (!this.navigate(key)) new Notice(rumbos[key][1]);
			});
		}
		this.canvasCommand('font-normal', t('Reset the card text to its normal size'), () => {
			const canvas = getCanvas(this.app);
			if (!canvas) return;
			const sel = selectedNodes(canvas);
			if (!sel.length) { new Notice(t('Select at least one card.')); return; }
			const data = safeData(canvas);
			if (!data) return;
			let n = 0;
			for (const node of sel) {
				const target = findNodeData(data, node.id);
				if (target && target[FONT_KEY] !== undefined) { delete target[FONT_KEY]; n++; }
			}
			if (!n) { new Notice(t('Those cards already have the normal text size.')); return; }
			applyCanvasData(canvas, data);
			syncDecorations(canvas, this.settings, this);
			new Notice(t('{n} card(s) back to the normal text size.', { n }));
		});
		Object.keys(THEMES).forEach((k) => {
			this.canvasCommand('theme-' + k, t('Map style: {name}', { name: THEMES[k].label }), () => this.setTheme(k));
		});
		this.canvasCommand('tool-panel', t('Map tools (style, background, text size, alignment)'), () => this.openToolPanel());
		for (const k of Object.keys(BACKGROUNDS)) {
			this.canvasCommand('bg-' + k, t('Canvas background: {name}', { name: BACKGROUNDS[k].label }), () => this.setBackground(k));
		}
		this.canvasCommand('font-bigger', t('Card text size: larger'), () => {
			new Notice(t('Card text size: +{px} px.', { px: this.setFontBump((Number(this.settings.fontBump) || 0) + 0.5) }));
		});
		this.canvasCommand('font-smaller', t('Card text size: smaller'), () => {
			new Notice(t('Card text size: +{px} px.', { px: this.setFontBump((Number(this.settings.fontBump) || 0) - 0.5) }));
		});
		this.canvasCommand('font-levels', t('Text size by level: toggle'), () => {
			this.setFontLevels(!this.settings.fontLevels);
			new Notice(this.settings.fontLevels ? t('Text size by level: on.') : t('Text size by level: off.'));
		});
		this.canvasCommand('zoom-reading', t('Back to the reading zoom'), () => {
			const canvas = getCanvas(this.app);
			if (canvas) this.setZoomPct(canvas, Number(this.settings.openZoom) || 100);
		});
		this.canvasCommand('readable-zoom', t('Zoom in to reading size'), () => {
			const canvas = getCanvas(this.app);
			const sel = canvas ? selectedNodes(canvas) : [];
			if (!sel.length) { new Notice(t('Select a card.')); return; }
			if (!this.ensureReadable(canvas, sel[0], true)) new Notice(t('That card is already at reading size.'));
		});
		this.canvasCommand('add-child', t('Add a child to the selected card'), () => this.addNode('child'));
		this.canvasCommand('add-sibling', t('Add a sibling to the selected card'), () => this.addNode('sibling'));
		this.canvasCommand('restore-lost', t('Restore lost collapsed branches'), () => this.restoreLost());
		this.addCommand({
			id: 'toggle-branch-drag',
			name: t('Toggle whole-branch dragging'),
			callback: async () => {
				this.settings.dragBranch = !this.settings.dragBranch;
				await this.saveSettings();
				new Notice(this.settings.dragBranch ? t('Whole-branch dragging: on.') : t('Whole-branch dragging: off.'));
			},
		});
	}

	/* ---------------- menus contextuales ---------------- */

	/** Menu de mapa mental para uno o varios nodos. Lo usan el clic derecho
	 *  sobre un nodo y el clic derecho sobre una seleccion. */
	buildBranchMenu(menu, nodes) {
		const canvas = getCanvas(this.app);
		if (!canvas) return;
		const graph = buildGraph(canvas, this.settings);
		const entries = nodes.map((n) => graph.nodes.get(n.id)).filter(Boolean);
		if (!entries.length) return;
		const many = entries.length > 1;
		const suffix = many ? ' (' + entries.length + ')' : '';
		const first = entries[0];
		const collapsed = first.collapsed;
		const hidden = collapsed && first.data[PAYLOAD_KEY] && Array.isArray(first.data[PAYLOAD_KEY].nodes)
			? first.data[PAYLOAD_KEY].nodes.length : 0;
		const st = this.mapState(canvas);
		const add = (m, title, icon, fn) => m.addItem((i) => i.setTitle(title).setIcon(icon).onClick(fn));

		menu.addSeparator();

		// --- colapsar -------------------------------------------------
		if (collapsed) {
			add(menu, (hidden ? t('Expand branch ({n} cards)', { n: hidden }) : t('Expand branch')) + suffix,
				'chevrons-up-down', () => this.toggleCollapse(many ? null : nodes[0]));
		} else {
			const count = countDescendants(first);
			add(menu, t('Collapse branch') + (count ? ' (' + count + ')' : '') + suffix,
				'chevrons-down-up', () => this.toggleCollapse(many ? null : nodes[0]));
		}
		subMenu(menu, t('Show only...'), 'list-ordered', (m, pre) => {
			for (let lvl = 1; lvl <= 4; lvl++) {
				add(m, pre + (lvl === 1 ? t('1 level') : t('{n} levels', { n: lvl })), 'list-ordered', () => this.collapseToLevel(lvl));
			}
			m.addSeparator();
			add(m, pre + t('The whole map'), 'unfold-vertical', () => this.expandAll());
		});

		// --- color ----------------------------------------------------
		menu.addSeparator();
		subMenu(menu, t('Branch color') + suffix, 'paint-bucket', (m, pre) => {
			for (const c of CANVAS_COLORS) {
				m.addItem((i) => {
					i.setTitle(pre + c.label).setIcon('circle');
					if (!many) i.setChecked(first.data.color === c.id);
					i.onClick(() => this.colorBranch(c.id, nodes));
				});
			}
			m.addSeparator();
			m.addItem((i) => {
				i.setTitle(pre + t('No color')).setIcon('circle-slash');
				if (!many) i.setChecked(!first.data.color);
				i.onClick(() => this.colorBranch(null, nodes));
			});
		});
		add(menu, t('One color per main branch'), 'wand', () => this.autoColorBranches());
		subMenu(menu, t('Canvas background: {name}', { name: BACKGROUNDS[this.backgroundOf(canvas)].label }), 'image', (m, pre) => {
			for (const k of Object.keys(BACKGROUNDS)) {
				m.addItem((i) => {
					i.setTitle(pre + BACKGROUNDS[k].label + ' — ' + BACKGROUNDS[k].hint);
					i.setIcon('image');
					i.setChecked(this.backgroundOf(canvas) === k);
					i.onClick(() => this.setBackground(k));
				});
			}
		});
		subMenu(menu, t('Map style: {name}', { name: THEMES[this.themeOf(canvas)].label }), 'paint-bucket', (m, pre) => {
			for (const k of Object.keys(THEMES)) {
				m.addItem((i) => {
					i.setTitle(pre + THEMES[k].label + ' \u2014 ' + THEMES[k].hint);
					i.setIcon('paint-bucket');
					i.setChecked(this.themeOf(canvas) === k);
					i.onClick(() => this.setTheme(k));
				});
			}
		});

		// --- organizacion ---------------------------------------------
		menu.addSeparator();
		subMenu(menu, t('Arrange the branch') + suffix, 'layout-dashboard', (m, pre) => {
			Object.keys(DIRECTIONS).forEach((dir) => {
				m.addItem((i) => {
					i.setTitle(pre + DIRECTIONS[dir]).setIcon('layout-dashboard');
					i.setChecked(st.dir === dir);
					i.onClick(() => this.layout(dir));
				});
			});
			m.addSeparator();
			add(m, pre + t('Arrange the whole canvas'), 'layout-grid', () => this.layout(st.dir, true));
		});
		subMenu(menu, t('Automatic alignment: {mode}', { mode: ALIGN_LABEL[st.mode] }), ALIGN_ICON[st.mode], (m, pre) => {
			for (const mode of ALIGN_MODES) {
				m.addItem((i) => {
					i.setTitle(pre + ALIGN_LABEL[mode] + ' — ' + ALIGN_HINT[mode]);
					i.setIcon(ALIGN_ICON[mode]);
					i.setChecked(st.mode === mode);
					i.onClick(() => this.setAlignMode(mode));
				});
			}
			m.addSeparator();
			add(m, pre + t('Rearrange everything now'), 'layout-grid', () => this.layout(st.dir, true));
		});
		subMenu(menu, t('Sort children'), 'arrow-down-narrow-wide', (m, pre) => {
			add(m, pre + t('From A to Z'), 'arrow-down-narrow-wide', () => this.sortSiblings(false));
			add(m, pre + t('From Z to A'), 'arrow-up-narrow-wide', () => this.sortSiblings(true));
		});
		add(menu, t('Even out the card sizes in the branch') + suffix, 'stretch-horizontal', () => this.equalizeSize());

		// --- navegacion -----------------------------------------------
		menu.addSeparator();
		add(menu, t('Select the whole branch'), 'box-select', () => {
			selectNodes(canvas, nodes);
			this.selectBranch();
		});
		add(menu, t('Focus the branch'), 'zoom-in', () => {
			selectNodes(canvas, nodes);
			this.focusBranch();
		});

		// --- todo el mapa ---------------------------------------------
		subMenu(menu, t('The whole map'), 'git-fork', (m, pre) => {
			add(m, pre + t('Collapse all branches'), 'fold-vertical', () => this.collapseAll());
			add(m, pre + t('Expand all branches'), 'unfold-vertical', () => this.expandAll());
			add(m, pre + t('Arrange the whole canvas'), 'layout-grid', () => this.layout(st.dir, true));
			m.addSeparator();
			add(m, pre + t('See the map as an outline'), 'list-tree', () => this.openOutline());
			add(m, pre + t('Restore lost collapsed branches'), 'rotate-ccw', () => this.restoreLost());
			m.addSeparator();
			add(m, pre + t('Take a snapshot of the map'), 'history', () => this.takeSnapshotFromUi());
			add(m, pre + t('Open the map history'), 'history', () => this.openSnapshotHistory());
		});
	}

	/**
	 * Hace que esta flecha sea la de madre a hija. Sirve cuando a un nodo le
	 * llegan varias flechas: las otras quedan como conexiones cruzadas.
	 */
	setParentEdge(edge) {
		const canvas = this.requireCanvas();
		if (!canvas || !edge) return false;
		const data = safeData(canvas);
		if (!data) return false;
		const mine = (data.edges || []).find((e) => e.id === edge.id);
		if (!mine) return false;
		const inv = (e) => this.settings.useArrowDirection && e.fromEnd === 'arrow' && e.toEnd !== 'arrow';
		const hija = inv(mine) ? mine.fromNode : mine.toNode;
		for (const e of data.edges) {
			if ((inv(e) ? e.fromNode : e.toNode) !== hija) continue;
			if (e === mine) delete e[LINK_KEY]; else e[LINK_KEY] = true;
		}
		applyCanvasData(canvas, data);
		stampLinks(canvas, this.settings);
		this.autoRelayout(canvas, 'collapse');
		new Notice(t('That arrow is now the parent-to-child one.'));
		return true;
	}

	buildEdgeMenu(menu, edge) {
		const add = (m, title, icon, fn) => m.addItem((i) => i.setTitle(title).setIcon(icon).onClick(fn));
		const d = safeData(edge) || {};
		menu.addSeparator();
		if (d[LINK_KEY]) add(menu, t('Use this arrow as the branch (parent → child)'), 'git-branch', () => this.setParentEdge(edge));
		subMenu(menu, t('Arrow type'), 'move-right', (m, pre) => {
			Object.keys(ARROW_PRESETS).forEach((key) => {
				const preset = ARROW_PRESETS[key];
				m.addItem((i) => {
					i.setTitle(pre + preset.label).setIcon('move-right');
					i.setChecked((d.fromEnd || 'none') === preset.fromEnd && (d.toEnd || 'arrow') === preset.toEnd);
					i.onClick(() => this.setEdgeProps({ fromEnd: preset.fromEnd, toEnd: preset.toEnd }, edge));
				});
			});
		});
		subMenu(menu, t('Line style'), 'stretch-horizontal', (m, pre) => {
			EDGE_STYLE_ORDER.forEach((style) => {
				m.addItem((i) => {
					i.setTitle(pre + EDGE_STYLE_LABELS[style]).setIcon('stretch-horizontal');
					i.setChecked((d[STYLE_KEY] || 'solid') === style);
					i.onClick(() => {
						const props = {};
						props[STYLE_KEY] = style;
						this.setEdgeProps(props, edge);
					});
				});
			});
		});
		subMenu(menu, t('Arrow color'), 'paint-bucket', (m, pre) => {
			for (const c of CANVAS_COLORS) {
				m.addItem((i) => {
					i.setTitle(pre + c.label).setIcon('circle');
					i.setChecked(d.color === c.id);
					i.onClick(() => this.setEdgeProps({ color: c.id }, edge));
				});
			}
			m.addSeparator();
			add(m, pre + t('No color'), 'circle-slash', () => this.setEdgeProps({ color: null }, edge));
		});
	}

	registerMenus() {
		this.registerEvent(this.app.workspace.on('canvas:node-menu', (menu, node) => {
			this.buildBranchMenu(menu, [node]);
		}));
		this.registerEvent(this.app.workspace.on('canvas:selection-menu', (menu) => {
			const canvas = getCanvas(this.app);
			if (!canvas) return;
			const nodes = selectedNodes(canvas);
			if (nodes.length) this.buildBranchMenu(menu, nodes);
		}));
		this.registerEvent(this.app.workspace.on('canvas:edge-menu', (menu, edge) => {
			this.buildEdgeMenu(menu, edge);
		}));
	}
}

/* ------------------------------------------------------------------ */
/* Pestana de opciones                                                 */
/* ------------------------------------------------------------------ */

class MindmapSettingTab extends PluginSettingTab {
	constructor(app, plugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl)
			.setName(t('Language'))
			.setDesc(t('Language of this plugin. Command names follow after you reload the plugin.'))
			.addDropdown((dd) => {
				dd.addOption('auto', t('Same as Obsidian'));
				dd.addOption('en', 'English');
				dd.addOption('es', 'Español');
				dd.setValue(this.plugin.settings.language || 'auto');
				dd.onChange(async (v) => {
					this.plugin.settings.language = v;
					setLocale(v);
					await this.plugin.saveSettings();
					this.display();
				});
			});

		new Setting(containerEl).setName(t('Auto layout')).setHeading();

		new Setting(containerEl)
			.setName(t('Default direction'))
			.setDesc(t('Used by the "Arrange the whole canvas" command.'))
			.addDropdown((dd) => {
				Object.keys(DIRECTIONS).forEach((k) => dd.addOption(k, DIRECTIONS[k]));
				dd.setValue(this.plugin.settings.defaultDirection);
				dd.onChange(async (v) => { this.plugin.settings.defaultDirection = v; await this.plugin.saveSettings(); });
			});

		new Setting(containerEl)
			.setName(t('Gap between levels'))
			.setDesc(t('Distance between a card and its children (px).'))
			.addSlider((s) => s.setLimits(40, 400, 10)
				.setValue(this.plugin.settings.levelGap)
				.setDynamicTooltip()
				.onChange(async (v) => { this.plugin.settings.levelGap = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Gap between siblings'))
			.setDesc(t('Distance between cards on the same level (px).'))
			.addSlider((s) => s.setLimits(10, 200, 5)
				.setValue(this.plugin.settings.siblingGap)
				.setDynamicTooltip()
				.onChange(async (v) => { this.plugin.settings.siblingGap = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Gap between maps'))
			.setDesc(t('Distance between separate maps when arranging the whole canvas (px).'))
			.addSlider((s) => s.setLimits(50, 600, 10)
				.setValue(this.plugin.settings.treeGap)
				.setDynamicTooltip()
				.onChange(async (v) => { this.plugin.settings.treeGap = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Adjust arrow sides'))
			.setDesc(t('While you drag a card, its arrows switch to the sides that face each other along the map. A card right above or below another one is joined from the top or the bottom.'))
			.addToggle((t) => t.setValue(this.plugin.settings.setEdgeSides)
				.onChange(async (v) => { this.plugin.settings.setEdgeSides = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Smooth curves'))
			.setDesc(t('Arrows leave and arrive straight and cross over in a gentle diagonal, like iThoughts, instead of the tight hooks Obsidian draws between nearby cards.'))
			.addToggle((tg) => tg.setValue(this.plugin.settings.smoothCurves)
				.onChange(async (v) => {
					this.plugin.settings.smoothCurves = v;
					await this.plugin.saveSettings();
					for (const leaf of this.app.workspace.getLeavesOfType('canvas')) {
						const c = leaf.view && leaf.view.canvas;
						if (!c) continue;
						if (v && !this.plugin.curvePatch) installCurvePatch(this.plugin, c);
						redrawEdges(c);
					}
				}));

		new Setting(containerEl)
			.setName(t('Default automatic alignment'))
			.setDesc(t('How much each canvas rearranges itself to begin with. You can change it per map from the context menu.'))
			.addDropdown((dd) => {
				ALIGN_MODES.forEach((m) => dd.addOption(m, ALIGN_LABEL[m] + ' — ' + ALIGN_HINT[m]));
				dd.setValue(this.plugin.settings.defaultAlign);
				dd.onChange(async (v) => { this.plugin.settings.defaultAlign = v; await this.plugin.saveSettings(); });
			});

		new Setting(containerEl)
			.setName(t('Animate rearranging'))
			.setDesc(t('Cards glide into place instead of jumping (turned off automatically on very large maps).'))
			.addToggle((t) => t.setValue(this.plugin.settings.animate)
				.onChange(async (v) => { this.plugin.settings.animate = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Refit groups'))
			.setDesc(t('After arranging, resize each group so it still contains its cards.'))
			.addToggle((t) => t.setValue(this.plugin.settings.refitGroups)
				.onChange(async (v) => { this.plugin.settings.refitGroups = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Dragging moves the whole branch'))
			.setDesc(t('When you move a card, its descendants move with it.'))
			.addToggle((t) => t.setValue(this.plugin.settings.dragBranch)
				.onChange(async (v) => { this.plugin.settings.dragBranch = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Key for dragging the branch'))
			.setDesc(t('With "Always on", hold Alt while dragging to move only the card.'))
			.addDropdown((dd) => {
				dd.addOption('none', t('Always on (Alt = only the card)'));
				dd.addOption('alt', t('Only with Alt'));
				dd.addOption('shift', t('Only with Shift'));
				dd.addOption('ctrl', t('Only with Ctrl / Cmd'));
				dd.setValue(this.plugin.settings.dragModifier);
				dd.onChange(async (v) => { this.plugin.settings.dragModifier = v; await this.plugin.saveSettings(); });
			});

		new Setting(containerEl).setName(t('Style')).setHeading();

		new Setting(containerEl)
			.setName(t('Default map style'))
			.setDesc(t('Used by new canvases. Change it per canvas from the context menu, under "Map style".'))
			.addDropdown((dd) => {
				Object.keys(THEMES).forEach((k) => dd.addOption(k, THEMES[k].label + ' \u2014 ' + THEMES[k].hint));
				dd.setValue(this.plugin.settings.defaultTheme);
				dd.onChange(async (v) => { this.plugin.settings.defaultTheme = v; await this.plugin.saveSettings(); });
			});

		new Setting(containerEl)
			.setName(t('Card text size'))
			.setDesc(t('Extra pixels for the text inside cards, on top of the font size of your theme. 0 leaves it as Obsidian draws it.'))
			.addSlider((sl) => sl.setLimits(0, 6, 0.5)
				.setValue(Number(this.plugin.settings.fontBump) || 0)
				.setDynamicTooltip()
				.onChange(async (v) => {
					this.plugin.settings.fontBump = v;
					await this.plugin.saveSettings();
					const canvas = getCanvas(this.app);
					if (canvas) syncDecorations(canvas, this.plugin.settings, this.plugin);
				}));

		new Setting(containerEl)
			.setName(t('Larger text for the root and main branches'))
			.setDesc(t('Like iThoughts styles, which use one text size per level. Kept moderate here (root 1.35, main branches 1.15) so that text does not overflow the cards.'))
			.addToggle((t) => t.setValue(this.plugin.settings.fontLevels)
				.onChange(async (v) => {
					this.plugin.settings.fontLevels = v;
					await this.plugin.saveSettings();
					const canvas = getCanvas(this.app);
					if (canvas) syncDecorations(canvas, this.plugin.settings, this.plugin);
				}));

		new Setting(containerEl)
			.setName(t('Tools button on the canvas'))
			.setDesc(t('The button at the bottom left that opens the panel with style, text size, map type and alignment.'))
			.addToggle((t) => t.setValue(this.plugin.settings.toolPanel)
				.onChange(async (v) => {
					this.plugin.settings.toolPanel = v;
					await this.plugin.saveSettings();
					const canvas = getCanvas(this.app);
					if (canvas) this.plugin.updateToolPanel(canvas);
				}));

		new Setting(containerEl)
			.setName(t('Reveal the file after exporting'))
			.setDesc(t('After exporting a .mm or .opml file, show it in the system file manager, ready to open with iThoughts or another app. Desktop only.'))
			.addToggle((t) => t.setValue(this.plugin.settings.revealExport)
				.onChange(async (v) => { this.plugin.settings.revealExport = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Zoom when opening a canvas'))
			.setDesc(t('Obsidian opens each canvas zoomed to fit everything, which can make the text small. Pick a percentage to open at that zoom instead, centered on the main map. 100 % shows your text at its real size.'))
			.addDropdown((dd) => {
				dd.addOption('0', t('Fit everything (like Obsidian)'));
				for (const v of [50, 60, 75, 90, 100, 110, 125, 150, 175, 200]) dd.addOption(String(v), v + ' %');
				dd.setValue(String(this.plugin.settings.openZoom));
				dd.onChange(async (v) => { this.plugin.settings.openZoom = Number(v); await this.plugin.saveSettings(); });
			});

		new Setting(containerEl)
			.setName(t('Show the zoom level'))
			.setDesc(t('A small indicator at the bottom left of the canvas. Click it to go back to the reading zoom.'))
			.addToggle((t) => t.setValue(this.plugin.settings.zoomIndicator)
				.onChange(async (v) => { this.plugin.settings.zoomIndicator = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Zoom in when typing'))
			.setDesc(t('If the text looks small when you start typing in a card, the view zooms in on that card. It never zooms out.'))
			.addToggle((t) => t.setValue(this.plugin.settings.zoomOnEdit)
				.onChange(async (v) => { this.plugin.settings.zoomOnEdit = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Text size when typing'))
			.setDesc(t('Minimum size on screen, in pixels. iThoughts uses 14.'))
			.addSlider((sl) => sl.setLimits(10, 24, 1)
				.setValue(this.plugin.settings.readablePx)
				.setDynamicTooltip()
				.onChange(async (v) => { this.plugin.settings.readablePx = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl).setName(t('Keyboard')).setHeading();

		new Setting(containerEl)
			.setName(t('Handle to scale a card and its text'))
			.setDesc(t('A small handle at the bottom left of each card: drag it to scale the card and its text together.'))
			.addToggle((t) => t.setValue(this.plugin.settings.sizeGrip)
				.onChange(async (v) => { this.plugin.settings.sizeGrip = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Arrow keys jump from card to card'))
			.setDesc(t('With a card selected, the arrow keys move the selection along the map: to the child, the parent, the next sibling. If there is no card in that direction, they move the card as Obsidian does.'))
			.addToggle((t) => t.setValue(this.plugin.settings.arrowNavigation)
				.onChange(async (v) => { this.plugin.settings.arrowNavigation = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Tab adds a child, Enter adds a sibling'))
			.setDesc(t('New cards always go below the existing ones, never in between.'))
			.addToggle((t) => t.setValue(this.plugin.settings.createWithKeys)
				.onChange(async (v) => { this.plugin.settings.createWithKeys = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl).setName(t('Branches')).setHeading();

		new Setting(containerEl)
			.setName(t('Drop on another card to attach'))
			.setDesc(t('Drop a branch level with another card to make it a child; drop it just above or below to make it a sibling. Only applies when one of the two cards already belongs to a map.'))
			.addToggle((t) => t.setValue(this.plugin.settings.dropToReparent)
				.onChange(async (v) => { this.plugin.settings.dropToReparent = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Follow the arrowhead direction'))
			.setDesc(t('If an arrow points back to the card it starts from, the parent-child relationship is reversed.'))
			.addToggle((t) => t.setValue(this.plugin.settings.useArrowDirection)
				.onChange(async (v) => { this.plugin.settings.useArrowDirection = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('Collapse buttons on cards'))
			.setDesc(t('Show a round button on each card that has children (and the number of hidden cards when it is collapsed).'))
			.addToggle((t) => t.setValue(this.plugin.settings.showBadge)
				.onChange(async (v) => { this.plugin.settings.showBadge = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl).setName(t('Snapshots')).setHeading();

		new Setting(containerEl)
			.setName(t('Automatic snapshots'))
			.setDesc(t('Save a copy of each map you work on, at most once a day or once a week, and only if it changed. You can always take one by hand from the tools button.'))
			.addDropdown((dd) => {
				dd.addOption('off', t('Off'));
				dd.addOption('daily', t('Once a day'));
				dd.addOption('weekly', t('Once a week'));
				dd.setValue(this.plugin.settings.autoSnapshot || 'off');
				dd.onChange(async (v) => { this.plugin.settings.autoSnapshot = v; await this.plugin.saveSettings(); });
			});

		new Setting(containerEl)
			.setName(t('Snapshot folder'))
			.setDesc(t('Snapshots are ordinary canvases kept in this folder: {folder}. To keep them out of search and the graph, add the folder to "Excluded files" in the "Files and links" settings.', { folder: this.plugin.snapshotRoot() }))
			.addButton((b) => b.setButtonText(t('Change')).onClick(async () => {
				const value = await this.plugin.askText({
					title: t('Snapshot folder'),
					message: t('The snapshots you already have move to the new folder.'),
					value: this.plugin.snapshotRoot(),
					ok: t('Change'),
				});
				if (value !== null && await this.plugin.changeSnapshotFolder(value)) this.display();
			}));

		new Setting(containerEl).setName(t('Backups')).setHeading();

		new Setting(containerEl)
			.setName(t('Backups of collapsed branches'))
			.setDesc(t('How many collapsed branches are kept as a backup, in case a collapsed card gets deleted. Stored right now: {n}.', { n: this.plugin.backups.length }))
			.addSlider((s) => s.setLimits(5, 200, 5)
				.setValue(this.plugin.settings.maxBackups)
				.setDynamicTooltip()
				.onChange(async (v) => { this.plugin.settings.maxBackups = v; await this.plugin.saveSettings(); }))
			.addButton((b) => b.setButtonText(t('Clear')).onClick(async () => {
				this.plugin.backups = [];
				await this.plugin.saveSettings();
				this.display();
			}));
	}
}

module.exports = CanvasMindmapTools;
