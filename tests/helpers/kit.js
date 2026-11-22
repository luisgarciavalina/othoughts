// Utilidades comunes: carga el plugin y arma mapas de prueba.
require('./domlite.js');
const fake = require('./fakeobs.js');
const { TFile, TFolder } = require('./obsidian-stub.js');
const Plugin = require('./load.js').loadPlugin();
const T = Plugin.__test;

// La boveda de mentira: lo que el plugin usa de la API del Vault.
// `files` guarda el contenido por ruta; las carpetas se deducen de las rutas,
// salvo las vacias, que se anotan en `folders`.
class Vault {
	constructor() {
		this.files = new Map();
		this.folders = new Set();
		this.trash = [];
		this.clock = 1;
	}
	getName() { return 'Boveda'; }
	on() { return {}; }
	isFolder(p) {
		if (this.folders.has(p)) return true;
		for (const f of this.files.keys()) if (f.indexOf(p + '/') === 0) return true;
		for (const d of this.folders) if (d.indexOf(p + '/') === 0) return true;
		return false;
	}
	getAbstractFileByPath(p) {
		if (this.files.has(p)) {
			const f = new TFile(p);
			f.stat.mtime = (this.mtimes && this.mtimes.get(p)) || 0;
			const i = p.lastIndexOf('/');
			f.parent = i > 0 ? this.getAbstractFileByPath(p.slice(0, i)) : null;
			return f;
		}
		if (!p || !this.isFolder(p)) return null;
		const folder = new TFolder(p);
		const kids = new Set();
		for (const f of this.files.keys()) if (f.indexOf(p + '/') === 0) kids.add(p + '/' + f.slice(p.length + 1).split('/')[0]);
		for (const d of this.folders) if (d.indexOf(p + '/') === 0) kids.add(p + '/' + d.slice(p.length + 1).split('/')[0]);
		folder.children = Array.from(kids).sort().map((k) => (this.files.has(k) ? (() => { const f = new TFile(k); f.parent = folder; return f; })() : new TFolder(k)));
		return folder;
	}
	touch(p) {
		if (!this.mtimes) this.mtimes = new Map();
		this.mtimes.set(p, this.clock++);
	}
	async cachedRead(file) { return this.files.get(file.path); }
	async createFolder(p) {
		if (this.files.has(p) || this.isFolder(p)) throw new Error('Folder already exists.');
		const i = p.lastIndexOf('/');
		if (i > 0 && !this.isFolder(p.slice(0, i))) throw new Error('Parent folder does not exist: ' + p);
		this.folders.add(p);
	}
	async create(p, content) {
		if (this.files.has(p)) throw new Error('File already exists.');
		const i = p.lastIndexOf('/');
		if (i > 0 && !this.isFolder(p.slice(0, i))) throw new Error('Parent folder does not exist: ' + p);
		this.files.set(p, content);
		this.touch(p);
		return this.getAbstractFileByPath(p);
	}
	async process(file, fn) {
		const next = fn(this.files.get(file.path));
		this.files.set(file.path, next);
		this.touch(file.path);
		return next;
	}
	// lo que hace app.fileManager.renameFile: mueve un archivo o una carpeta entera
	async rename(file, to) {
		if (this.files.has(to) || this.isFolder(to)) throw new Error('Destination already exists.');
		const from = file.path;
		if (this.files.has(from)) {
			this.files.set(to, this.files.get(from));
			this.files.delete(from);
			this.touch(to);
			return;
		}
		for (const [p, c] of Array.from(this.files.entries())) {
			if (p.indexOf(from + '/') === 0) { this.files.delete(p); this.files.set(to + p.slice(from.length), c); }
		}
		for (const d of Array.from(this.folders)) {
			if (d === from || d.indexOf(from + '/') === 0) { this.folders.delete(d); this.folders.add(to + d.slice(from.length)); }
		}
	}
	async trashFile(file) {
		this.trash.push(file.path);
		this.files.delete(file.path);
	}
}

/** Plugin listo para usar sobre un canvas de mentira. */
function setup(data, opts) {
	const o = opts || {};
	const canvas = new fake.FakeCanvas(data, o.path || 'Carpeta/Mapa.canvas');
	const leaf = { view: canvas.view };
	const adapter = new Vault(); // las pruebas miran adapter.files
	// la carpeta del canvas existe (el archivo en si no se anota, para no contarlo)
	const dir = canvas.view.file.path.split('/').slice(0, -1);
	for (let i = 1; i <= dir.length; i++) adapter.folders.add(dir.slice(0, i).join('/'));
	const app = {
		workspace: {
			getActiveViewOfType: () => leaf.view,
			getLeavesOfType: (type) => (type === 'canvas' ? [leaf] : []),
			on: () => ({}),
			getRightLeaf: () => null,
			revealLeaf() {},
			opened: [],
			getLeaf: () => ({ openFile: async (f) => { app.workspace.opened.push(f.path); } }),
		},
		vault: adapter,
		fileManager: {
			renameFile: (file, to) => adapter.rename(file, to),
			trashFile: (file) => adapter.trashFile(file),
		},
		shown: [],
		showInFolder(p) { app.shown.push(p); },
	};
	const plugin = new Plugin(app, {});
	plugin.settings = Object.assign({}, T.DEFAULT_SETTINGS, { animate: o.animate !== false }, o.settings || {});
	plugin.backups = [];
	plugin.maps = {};
	plugin.saveSettings = () => {};
	// lo que arma onload(), que estas pruebas no llaman
	plugin.lockedSnapshots = new Set();
	plugin.snapshotChecks = new Map();
	plugin.snapshotBusy = new Set();
	plugin.curvePatch = null;
	const st = plugin.mapState(canvas);
	st.dir = o.dir || 'right';
	st.mode = o.mode || 'manual';
	return { canvas, plugin, app, adapter };
}

const nodo = (id, x, y, extra) => Object.assign({ id, type: 'text', text: id, x, y, width: 200, height: 60 }, extra || {});
const flecha = (from, to, extra) => Object.assign({ id: 'e-' + from + '-' + to, fromNode: from, fromSide: 'right', toNode: to, toSide: 'left' }, extra || {});

/**
 * Mapa base:            A1
 *               A  ──┬─ A2
 *       R  ──┬──
 *            ├─ B  ──── B1
 *            └─ C
 *  + un nodo suelto (S) y una imagen suelta (IMG) que no son parte del mapa.
 */
function mapaBase() {
	return {
		nodes: [
			nodo('R', 0, 200), nodo('A', 320, 0), nodo('B', 320, 200), nodo('C', 320, 400),
			nodo('A1', 640, -40), nodo('A2', 640, 50), nodo('B1', 640, 200),
			nodo('S', -600, -500, { text: 'apunte suelto' }),
			{ id: 'IMG', type: 'file', file: 'Adjuntos/foto.png', x: 1500, y: 900, width: 300, height: 200 },
		],
		edges: [flecha('R', 'A'), flecha('R', 'B'), flecha('R', 'C'), flecha('A', 'A1'), flecha('A', 'A2'), flecha('B', 'B1')],
	};
}

/** Foto logica del mapa entero (a la vista + guardado en ramas colapsadas). */
function foto(canvas, plugin) {
	const data = canvas.getData();
	const tree = T.outlineTree(data, plugin.settings, plugin.mapState(canvas).dir);
	const flat = T.flattenCanvasData(data);
	const padre = {};
	tree.items.forEach((it, id) => { padre[id] = it.parent ? it.parent.id : null; });
	const ids = flat.nodes.map((n) => n.data.id);
	const eids = flat.edges.map((e) => e.id);
	const idset = new Set(ids);
	return {
		padre,
		nodos: ids.length,
		flechas: eids.length,
		idsRepetidos: ids.length - new Set(ids).size,
		flechasRepetidas: eids.length - new Set(eids).size,
		colgando: flat.edges.filter((e) => !idset.has(e.fromNode) || !idset.has(e.toNode)).length,
		// flechas con un extremo inexistente A LA VISTA: eso nunca puede pasar
		colgandoVisibles: (data.edges || []).filter((e) => !idset.has(e.fromNode) || !idset.has(e.toNode)).length,
		// extremos inexistentes (para saber si son de nodos que borraste a mano)
		extremosPerdidos: Array.from(new Set(flat.edges.flatMap((e) => [e.fromNode, e.toNode]).filter((x) => !idset.has(x)))),
		// flechas enteras: con sus dos extremos
		vivas: flat.edges.filter((e) => idset.has(e.fromNode) && idset.has(e.toNode)).length,
		todas: flat.edges,
		texto: Object.fromEntries(flat.nodes.map((n) => [n.data.id, n.data.text])),
	};
}

let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALLA') + '  ' + m); if (!c) fails++; return !!c; };
const fin = () => { console.log(fails ? '\nFALLAS: ' + fails : '\nTodo OK'); process.exit(fails ? 1 : 0); };

module.exports = Object.assign({ Plugin, T, setup, nodo, flecha, mapaBase, foto, ok, fin, viejo: false }, fake);
