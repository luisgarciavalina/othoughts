'use strict';

// A minimal stand-in for the `obsidian` module: just enough to load the plugin in Node.

class Plugin {
	constructor(app, manifest) { this.app = app; this.manifest = manifest; }
	addCommand(cmd) { (this.commands = this.commands || []).push(cmd); }
	addRibbonIcon() {} addSettingTab() {} registerView() {}
	registerEvent() {} registerDomEvent() {} registerInterval() {} register() {}
	async loadData() { return null; }
	async saveData() {}
}

class PluginSettingTab {
	constructor(app, plugin) { this.app = app; this.plugin = plugin; }
}

class Setting {
	constructor() { Setting.all.push(this); }
	setName(v) { this.name = v; return this; }
	setDesc(v) { this.desc = v; return this; }
	setHeading() { this.heading = true; return this; }
	addToggle(f) { f(this.ctl()); return this; }
	addSlider(f) { f(this.slider()); return this; }
	addDropdown(f) { f(this.dropdown()); return this; }
	addButton(f) { f(this.ctl()); return this; }
	addText(f) { f(this.ctl()); return this; }
	ctl() {
		const c = { setValue: () => c, onChange: () => c, setButtonText: () => c, onClick: () => c, setPlaceholder: () => c };
		return c;
	}
	slider() {
		const c = {
			setLimits: (a, b, step) => { c.limites = [a, b, step]; return c; },
			setValue: (v) => { c.valor = v; return c; },
			setDynamicTooltip: () => c,
			onChange: (f) => { c.cambio = f; return c; },
		};
		Setting.sliders.push(c);
		return c;
	}
	dropdown() {
		const c = {
			opciones: [],
			addOption: (k, label) => { c.opciones.push([k, label]); return c; },
			setValue: (v) => { c.valor = v; return c; },
			onChange: (f) => { c.cambio = f; return c; },
		};
		return c;
	}
}
Setting.sliders = [];
Setting.all = [];

class Notice {
	constructor(msg) { Notice.ultima = msg; Notice.todas.push(msg); }
}
Notice.todas = [];

class Menu {
	addItem() { return this; }
	addSeparator() { return this; }
}

class Component {
	registerEvent() {}
	registerInterval() {}
	registerDomEvent() {}
}

class ItemView extends Component {
	constructor(leaf) {
		super();
		this.leaf = leaf;
		this.app = leaf && leaf.app;
		this.contentEl = global.document ? global.document.createElement('div') : {};
	}
}

/** A modal that never shows anything: tests answer it with `Modal.answer` (or close it themselves). */
class Modal {
	constructor(app) {
		this.app = app;
		this.contentEl = global.document ? global.document.createElement('div') : {};
		this.titleEl = global.document ? global.document.createElement('div') : {};
	}
	open() { Modal.opened.push(this); if (typeof this.onOpen === 'function') this.onOpen(); }
	close() { if (typeof this.onClose === 'function') this.onClose(); }
}
Modal.opened = [];

class TAbstractFile {
	constructor(path) {
		this.path = path;
		this.name = path.split('/').pop();
		this.parent = null;
	}
}

class TFile extends TAbstractFile {
	constructor(path) {
		super(path);
		const dot = this.name.lastIndexOf('.');
		this.basename = dot > 0 ? this.name.slice(0, dot) : this.name;
		this.extension = dot > 0 ? this.name.slice(dot + 1) : '';
		this.stat = { ctime: 0, mtime: 0, size: 0 };
	}
}

class TFolder extends TAbstractFile {
	constructor(path) {
		super(path);
		this.children = [];
	}
}

const normalizePath = (p) => String(p).replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

// The tests run in Spanish unless MM_LANG says otherwise (the plugin was born in Spanish).
const getLanguage = () => process.env.MM_LANG || 'es';

module.exports = { Plugin, PluginSettingTab, Setting, Notice, Menu, ItemView, Modal, TFile, TFolder, normalizePath, getLanguage };
