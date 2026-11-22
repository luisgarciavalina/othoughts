// DOM minimo para probar el panel de herramientas.
class El {
	constructor(tag) {
		this.tag = tag;
		this.kids = [];
		this.parent = null;
		this.attrs = {};
		this.listeners = {};
		this.hidden = false;
		this._text = '';
		const clases = new Set();
		this.classList = {
			add: (c) => clases.add(c),
			remove: (c) => clases.delete(c),
			contains: (c) => clases.has(c),
			toggle: (c, on) => { if (on === undefined) on = !clases.has(c); return on ? clases.add(c) : clases.delete(c); },
		};
		const vars = {};
		this.style = {
			vars,
			fontSize: '',
			setProperty: (k, v) => { vars[k] = v; },
			removeProperty: (k) => { delete vars[k]; },
			getPropertyValue: (k) => vars[k] || '',
		};
	}
	set className(v) { String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); this._class = v; }
	get className() { return this._class || ''; }
	get textContent() { return this._text !== '' ? this._text : this.kids.map((k) => k.textContent).join(''); }
	set textContent(v) { this._text = v; this.kids = []; }
	// como en el DOM: agregar un nodo que ya tenia padre lo saca de alli
	appendChild(c) { if (c.parent) c.remove(); this.kids.push(c); c.parent = this; return c; }
	get firstChild() { return this.kids[0] || null; }
	select() {}
	addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
	fire(t, evt) {
		for (const f of (this.listeners[t] || [])) {
			f(Object.assign({ preventDefault() {}, stopPropagation() {}, target: this }, evt || {}));
		}
	}
	setAttribute(k, v) { this.attrs[k] = v; }
	getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
	remove() { if (this.parent) this.parent.kids = this.parent.kids.filter((k) => k !== this); this.parent = null; }
	querySelector(sel) {
		const cls = sel.replace(':scope > .', '').replace('.', '');
		return this.kids.find((k) => k.classList.contains(cls)) || null;
	}
	querySelectorAll() { return []; }
	contains(el) { let cur = el; while (cur) { if (cur === this) return true; cur = cur.parent; } return false; }
	closest() { return null; }
}
global.document = {
	createElement: (t) => new El(t),
	createElementNS: (ns, t) => new El(t),
	querySelectorAll: () => [],
	querySelector: () => null,
	body: new El('body'),
	documentElement: new El('html'),
	activeElement: null,
};
global.window = { setInterval: () => 1, setTimeout: (f) => f && 1, addEventListener() {}, removeEventListener() {} };
global.getComputedStyle = () => ({ fontSize: '15px', getPropertyValue: () => '' });
module.exports = { El };
