// Canvas de mentira que copia la logica de Obsidian 1.15 (leida de su codigo),
// INCLUIDO su defecto: edge.setData cambia el nodo de la flecha sin tocar el
// indice edgeFrom/edgeTo. Ademas "dibuja": cada flecha recuerda con que
// geometria se dibujo por ultima vez, para detectar lineas que quedaron sueltas.
const { El } = require('./domlite.js');

// ---- reloj, cuadros de animacion y temporizadores manuales -----------------
let clock = 0;
let frames = [];
let timers = [];
global.performance = { now: () => clock };
global.window.requestAnimationFrame = (f) => { frames.push(f); return frames.length; };
global.window.cancelAnimationFrame = (id) => { if (id >= 1 && id <= frames.length) frames[id - 1] = null; };
global.window.setTimeout = (f, ms) => { timers.push({ f, at: clock + (ms || 0) }); return timers.length; };
global.window.clearTimeout = () => {};
const portapapeles = { text: null, writeText: async (t) => { portapapeles.text = t; } };
Object.defineProperty(globalThis, 'navigator', { value: { clipboard: portapapeles }, configurable: true, writable: true });

/** Avanza el reloj `ms` y corre los cuadros pendientes una vez. */
function tick(ms) {
	clock += ms;
	const run = frames;
	frames = [];
	for (const f of run) if (f) f();
}
/** Corre la animacion hasta que no quede nada pendiente. */
function runFrames() {
	let guard = 0;
	while (frames.some(Boolean) && guard++ < 500) tick(40);
	frames = [];
}
function runTimers() {
	let guard = 0;
	while (timers.length && guard++ < 200) {
		const t = timers.shift();
		clock = Math.max(clock, t.at);
		try { t.f(); } catch (e) { /* como en el navegador: un timer que falla no frena al resto */ }
	}
}
function dropTimers() { timers = []; }

class MultiMap {
	constructor() { this.m = new Map(); }
	add(k, v) { if (!this.m.has(k)) this.m.set(k, []); const a = this.m.get(k); if (a.indexOf(v) === -1) a.push(v); }
	delete(k, v) { const a = this.m.get(k); if (!a) return; const i = a.indexOf(v); if (i > -1) a.splice(i, 1); if (!a.length) this.m.delete(k); }
	getArray(k) { return (this.m.get(k) || []).slice(); }
}

const colorOk = (c) => (c || '');

class FakeNode {
	constructor(canvas, id) {
		this.canvas = canvas; this.id = id;
		this.x = 0; this.y = 0; this.width = 100; this.height = 100;
		this.color = ''; this.unknownData = {}; this.isEditing = false; this.destroyed = false;
		this.nodeEl = new El('div'); this.nodeEl.className = 'canvas-node';
	}
	getData() {
		const l = Object.assign({}, this.unknownData, { id: this.id, x: this.x, y: this.y, width: this.width, height: this.height });
		if (this.color) l.color = this.color;
		return l;
	}
	setData(t) {
		const e = this.canvas;
		let { x: i, y: r, width: n, height: a, color: s } = t;
		const l = Object.assign({}, t);
		delete l.x; delete l.y; delete l.width; delete l.height; delete l.color;
		let c = false, d = false;
		i = Math.round(i); r = Math.round(r); n = Math.round(n); a = Math.round(a);
		if (!isNaN(i) && this.x !== i) { this.x = i; d = true; c = true; }
		if (!isNaN(r) && this.y !== r) { this.y = r; d = true; c = true; }
		if (!isNaN(n) && this.width !== n) { this.width = n; d = true; c = true; }
		if (!isNaN(a) && this.height !== a) { this.height = a; d = true; c = true; }
		s = colorOk(s);
		if (this.color !== s) { this.color = s; c = true; }
		if (c) e.markDirty(this);
		if (d) e.markMoved(this);
		this.unknownData = l;
	}
	moveTo(t) { this.moveAndResize(Object.assign({ width: this.width, height: this.height }, t)); }
	moveAndResize(t) {
		this.x = Math.round(t.x); this.y = Math.round(t.y);
		this.width = Math.round(t.width); this.height = Math.round(t.height);
		this.canvas.markMoved(this);
	}
	render() {}
	destroy() { this.destroyed = true; }
	startEditing() { this.canvas.nodes.forEach((n) => { n.isEditing = false; }); this.isEditing = true; }
	setIsEditing(v) { this.isEditing = v; }
	blur() { this.isEditing = false; }
	get isAttached() { return true; }
}

const lado = (node, side) => {
	if (side === 'left') return [node.x, node.y + node.height / 2];
	if (side === 'right') return [node.x + node.width, node.y + node.height / 2];
	if (side === 'top') return [node.x + node.width / 2, node.y];
	return [node.x + node.width / 2, node.y + node.height];
};
const ladoAuto = (a, b) => (Math.abs((b.x + b.width / 2) - (a.x + a.width / 2)) >= Math.abs((b.y + b.height / 2) - (a.y + a.height / 2))
	? ((b.x + b.width / 2) >= (a.x + a.width / 2) ? 'right' : 'left')
	: ((b.y + b.height / 2) >= (a.y + a.height / 2) ? 'bottom' : 'top'));

class FakeEdge {
	constructor(canvas, id, from, to) {
		this.canvas = canvas; this.id = id; this.from = from; this.to = to;
		this.color = ''; this.label = undefined; this.unknownData = {}; this.destroyed = false;
		this.lineGroupEl = new El('g'); this.lineEndGroupEl = new El('g');
		this.drawn = null;
	}
	getData() {
		const s = Object.assign({}, this.unknownData, {
			id: this.id, fromNode: this.from.node.id, fromSide: this.from.side, toNode: this.to.node.id, toSide: this.to.side,
		});
		if (this.from.end !== 'none') s.fromEnd = this.from.end;
		if (this.to.end !== 'arrow') s.toEnd = this.to.end;
		if (this.color) s.color = this.color;
		if (this.label) s.label = this.label;
		return s;
	}
	// Copia fiel de Obsidian 1.15, con su defecto: cambia from.node / to.node sin
	// actualizar canvas.edgeFrom / canvas.edgeTo.
	setData(t) {
		let { fromNode: e, fromSide: i, fromEnd: r, toNode: n, toSide: a, toEnd: s, color: l, label: c } = t;
		const d = Object.assign({}, t);
		for (const k of ['fromNode', 'fromSide', 'fromEnd', 'toNode', 'toSide', 'toEnd', 'color', 'label']) delete d[k];
		let h = false;
		l = colorOk(l);
		if (this.color !== l) { this.color = l; h = true; }
		if (this.label !== c) { this.label = c; h = true; }
		const u = this.canvas; const p = u.nodes; let f = false;
		if (e && e !== this.from.node.id && p.has(e)) { f = true; this.from.node = p.get(e); }
		r = r || 'none';
		if (e && r !== this.from.end) { this.from.end = r; h = true; }
		if (n && n !== this.to.node.id && p.has(n)) { f = true; this.to.node = p.get(n); }
		s = s || 'arrow';
		if (n && s !== this.to.end) { this.to.end = s; h = true; }
		if (e) { i = (i === null || i === undefined) ? ladoAuto(this.from.node, this.to.node) : i; if (i !== this.from.side) { this.from.side = i; h = true; } }
		if (n) { a = (a === null || a === undefined) ? ladoAuto(this.to.node, this.from.node) : a; if (a !== this.to.side) { this.to.side = a; h = true; } }
		if (f) u.markMoved(this);
		if (h) u.markDirty(this);
		this.unknownData = d;
	}
	geometry() { return lado(this.from.node, this.from.side).concat(lado(this.to.node, this.to.side)).join(','); }
	render() { this.drawn = this.geometry(); }
	destroy() { this.destroyed = true; }
	get isAttached() { return true; }
}

class FakeCanvas {
	constructor(data, path) {
		this.nodes = new Map(); this.edges = new Map();
		this.edgeFrom = new MultiMap(); this.edgeTo = new MultiMap();
		this.moved = new Set(); this.dirty = new Set(); this.selection = new Set();
		this.saves = 0; this.history = []; this.zoom = 0; this.x = 0; this.y = 0;
		this.wrapperEl = new El('div'); this.wrapperEl.className = 'canvas-wrapper';
		this.canvasEl = new El('div');
		this.readonly = false;
		this.view = {
			canvas: this, file: { path: path || 'Mapa.canvas' }, getViewType: () => 'canvas', scope: null,
			localData: null, saveLocalData() { this.localData = this.canvas.readonly ? { readonly: true } : null; },
		};
		this.importData(data || { nodes: [], edges: [] }, true);
		this.frame();
	}
	importData(t, e) {
		const { nodes: i, edges: r } = t;
		if (!i || !Array.isArray(i)) return;
		const n = this.nodes; const a = new Set();
		for (const d of i) {
			const h = d.id; let u;
			if (n.has(h)) u = n.get(h);
			else {
				if (['file', 'text', 'link', 'group'].indexOf(d.type) === -1) continue;
				u = new FakeNode(this, h);
				this.addNode(u); this.markMoved(u);
			}
			u.setData(d); a.add(u);
		}
		if (e) Array.from(n.values()).forEach((d) => { if (!a.has(d)) this.removeNode(d); });
		if (!r || !Array.isArray(r)) return;
		const l = this.edges; const c = new Set();
		for (const d of r) {
			const { id: h, fromNode: u, toNode: m } = d;
			let { fromSide: p, toSide: g } = d;
			if (!n.has(u) || !n.has(m)) { if (l.has(h)) this.removeEdge(l.get(h)); continue; }
			let v;
			if (l.has(h)) v = l.get(h);
			else {
				const w = n.get(u); const k = n.get(m);
				if (!p) { p = ladoAuto(w, k); d.fromSide = p; }
				if (!g) { g = ladoAuto(k, w); d.toSide = g; }
				v = new FakeEdge(this, h, { node: w, side: p, end: d.fromEnd || 'none' }, { node: k, side: g, end: d.toEnd || 'arrow' });
				this.addEdge(v); this.markMoved(v);
			}
			c.add(v); v.setData(d);
		}
		if (e) Array.from(l.values()).forEach((d) => { if (!c.has(d)) this.removeEdge(d); });
		return a;
	}
	addNode(t) { this.nodes.set(t.id, t); this.requestFrame(); }
	removeNode(t) {
		for (const i of this.getEdgesForNode(t)) this.removeEdge(i);
		this.selection.delete(t); this.nodes.delete(t.id); this.moved.delete(t); this.dirty.delete(t); t.destroy(); this.requestFrame();
	}
	addEdge(t) { this.edges.set(t.id, t); this.edgeFrom.add(t.from.node, t); this.edgeTo.add(t.to.node, t); this.requestFrame(); }
	removeEdge(t) {
		if (!this.edges.has(t.id)) return;
		this.selection.delete(t); this.edges.delete(t.id);
		this.edgeFrom.delete(t.from.node, t); this.edgeTo.delete(t.to.node, t);
		this.moved.delete(t); this.dirty.delete(t); t.destroy(); this.requestFrame();
	}
	getEdgesForNode(t) { return this.edgeFrom.getArray(t).concat(this.edgeTo.getArray(t)); }
	markMoved(t) { this.moved.add(t); this.requestFrame(); }
	markDirty(t) { this.dirty.add(t); this.requestFrame(); }
	requestFrame() { this.framePending = true; }
	/** Lo que hace Obsidian en cada cuadro: redibuja lo movido y lo sucio. */
	frame() {
		this.framePending = false;
		const n = this.moved; const a = this.dirty;
		for (const g of Array.from(n)) if (g instanceof FakeNode) for (const b of this.getEdgesForNode(g)) n.add(b);
		for (const g of Array.from(n)) a.add(g);
		n.clear();
		for (const f of Array.from(a)) { if (!f.destroyed) f.render(); a.delete(f); }
	}
	getData() {
		return {
			nodes: Array.from(this.nodes.values()).map((x) => x.getData()),
			edges: Array.from(this.edges.values()).map((x) => x.getData()),
		};
	}
	setReadonly(v) { this.readonly = !!v; }
	requestSave() { this.saves++; this.data = this.getData(); this.history.push(JSON.stringify(this.data)); }
	selectOnly(n) { this.selection = new Set([n]); }
	deselectAll() { this.selection = new Set(); }
	select(n) { this.selection.add(n); }
	panIntoView() {}
	zoomToSelection() {}
	markViewportChanged() {}

	// --- ayudas para las pruebas -------------------------------------------
	/** Flechas que quedaron dibujadas en un lugar que ya no coincide con sus nodos. */
	looseEdges() {
		this.frame();
		return Array.from(this.edges.values()).filter((e) => e.drawn !== e.geometry()).map((e) => e.id);
	}
	/** Flechas mal anotadas en el indice interno. */
	misindexed() {
		const bad = [];
		this.edges.forEach((e) => {
			if (this.edgeFrom.getArray(e.from.node).indexOf(e) === -1 || this.edgeTo.getArray(e.to.node).indexOf(e) === -1) bad.push(e.id);
		});
		return bad;
	}
	/** Lo que pasa cuando borras un nodo con la tecla Suprimir. */
	userDelete(id) { const n = this.nodes.get(id); if (n) { this.removeNode(n); this.requestSave(); } }
	/** Arrastrar un nodo a mano (sin que el plugin intervenga). */
	userMove(id, dx, dy) { const n = this.nodes.get(id); if (n) { n.moveTo({ x: n.x + dx, y: n.y + dy }); this.requestSave(); } }
}

module.exports = { FakeCanvas, FakeNode, FakeEdge, tick, runFrames, runTimers, dropTimers, now: () => clock };
