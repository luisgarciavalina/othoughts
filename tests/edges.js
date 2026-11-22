// Las lineas: por que lado salen mientras moves los nodos, y la curva suave.
const k = require('./helpers/kit.js');
const { ok, T } = k;
const { El } = require('./helpers/domlite.js');

const caja = (x, y, w, h) => ({ x, y, w: w || 200, h: h || 60 });
const lados = (r) => (r ? r.fromSide + '>' + r.toSide : 'null');
const ladosDe = (canvas, id) => { const e = canvas.edges.get(id); return e.from.side + '>' + e.to.side; };

console.log('\n--- por que lado sale la flecha (mapa horizontal)');
{
	const madre = caja(0, 0);
	ok(lados(T.edgeSidesFor(madre, caja(320, 0), true)) === 'right>left', 'hija a la derecha: sale por la derecha y entra por la izquierda');
	ok(lados(T.edgeSidesFor(madre, caja(320, 400), true)) === 'right>left', 'aunque este muy abajo, mientras haya aire al costado sale por el costado (como iThoughts)');
	ok(lados(T.edgeSidesFor(madre, caja(-320, 50), true)) === 'left>right', 'hija a la izquierda: sale por la izquierda');
	ok(lados(T.edgeSidesFor(madre, caja(40, 160), true)) === 'bottom>top', 'hija justo debajo: sale por abajo y entra por arriba');
	ok(lados(T.edgeSidesFor(madre, caja(-30, -200), true)) === 'top>bottom', 'hija justo encima: sale por arriba');
	ok(T.edgeSidesFor(madre, caja(50, 20), true, { fromSide: 'right', toSide: 'left' }) === null, 'si las cajas se pisan, la flecha se queda como estaba');
}

console.log('\n--- sin saltos mientras arrastras (margen)');
{
	const madre = caja(0, 0);
	const costado = { fromSide: 'right', toSide: 'left' };
	const abajo = { fromSide: 'bottom', toSide: 'top' };
	ok(lados(T.edgeSidesFor(madre, caja(215, 200), true, costado)) === 'right>left', 'con 15 px de aire al costado sigue saliendo por el costado');
	ok(lados(T.edgeSidesFor(madre, caja(205, 200), true, costado)) === 'bottom>top', 'con 5 px ya pasa a salir por abajo');
	ok(lados(T.edgeSidesFor(madre, caja(225, 200), true, abajo)) === 'bottom>top', 'y para volver al costado no alcanza con 25 px: no titila en el limite');
	ok(lados(T.edgeSidesFor(madre, caja(240, 200), true, abajo)) === 'right>left', 'con 40 px vuelve al costado');
	ok(lados(T.edgeSidesFor(madre, caja(230, 65), true, abajo)) === 'right>left', 'si ya no hay aire abajo, vuelve al costado aunque haya poco');
}

console.log('\n--- mapa vertical (hacia abajo)');
{
	const madre = caja(0, 0);
	ok(lados(T.edgeSidesFor(madre, caja(400, 160), false)) === 'bottom>top', 'hija mas abajo: sale por abajo aunque este muy al costado');
	ok(lados(T.edgeSidesFor(madre, caja(260, 20), false)) === 'right>left', 'hija al lado, a la misma altura: sale por el costado');
}

console.log('\n--- en vivo, sobre el canvas');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	let imports = 0;
	const importData = canvas.importData.bind(canvas);
	canvas.importData = (d, e) => { imports++; return importData(d, e); };
	canvas.nodes.get('A').moveTo({ x: 40, y: 330 });                 // A, debajo de R
	const n = T.fitEdgesLive(canvas, ['A'], true);
	ok(n === 1 && ladosDe(canvas, 'e-R-A') === 'bottom>top', 'al llevar A debajo de R, la flecha R-A pasa a salir por abajo');
	ok(ladosDe(canvas, 'e-R-B') === 'right>left' && ladosDe(canvas, 'e-A-A1') === 'right>left', 'las demas no se tocan: ni las de otros nodos, ni las de A que siguen teniendo aire al costado');
	ok(imports === 0, 'sin reimportar el canvas: se puede hacer en cada cuadro del arrastre');
	ok(canvas.looseEdges().length === 0, 'y la linea se dibuja en su lugar nuevo');
	ok(T.fitEdgesLive(canvas, ['A'], true) === 0, 'volver a llamarlo no cambia nada');
}
{
	// arrastrar de verdad: los lados cambian mientras el puntero sigue apretado
	const { canvas, plugin } = k.setup(k.mapaBase());
	const listeners = {};
	window.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
	window.removeEventListener = () => {};
	plugin.onMoveStart({ button: 0, target: { closest: (sel) => (sel === '.canvas-wrapper' ? {} : null) } });
	canvas.nodes.get('B').moveTo({ x: 30, y: 360 });                 // Obsidian mueve B, debajo de R
	k.tick(16);
	ok(ladosDe(canvas, 'e-R-B') === 'bottom>top', 'mientras arrastras, la linea ya cambio de lado (no espera a que sueltes)');
	const antes = canvas.saves;
	(listeners.pointerup || []).forEach((fn) => fn());
	k.runTimers();
	ok(canvas.saves > antes, 'al soltar, se guarda');
	ok(canvas.looseEdges().length === 0, 'sin lineas sueltas');
}
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	canvas.nodes.get('C').moveTo({ x: -400, y: 420 });               // C pasa a la izquierda de R
	let imports = 0;
	const importData = canvas.importData.bind(canvas);
	canvas.importData = (d, e) => { imports++; return importData(d, e); };
	ok(plugin.fitEdgeSides(canvas, ['C']) === 1 && ladosDe(canvas, 'e-R-C') === 'left>right', 'al terminar un movimiento, la flecha mira hacia donde quedo el nodo');
	ok(imports === 0, 'tambien sin reimportar');
	canvas.setReadonly(true);
	canvas.nodes.get('C').moveTo({ x: 320, y: 400 });
	ok(plugin.fitEdgeSides(canvas, ['C']) === 0, 'en un canvas de solo lectura no toca nada');
}

console.log('\n--- curva suave');
{
	const b = T.smoothBezier({ x: 0, y: 0 }, 'right', { x: 134, y: 300 }, 'left');
	ok(b && b.cp1.x === 67 && b.cp1.y === 0 && b.cp2.x === 67 && b.cp2.y === 300, 'el brazo es la mitad de lo que avanza la flecha (Obsidian lo estiraria a 150)');
	ok(b.path === 'M0,0 C67,0 67,300 134,300', 'con el mismo formato que usa Obsidian');
	ok(T.smoothBezier({ x: 0, y: 0 }, 'right', { x: 1000, y: 0 }, 'left').cp1.x === 150, 'nunca mas de 150 px');
	ok(T.smoothBezier({ x: 0, y: 0 }, 'right', { x: 8, y: 300 }, 'left').cp1.x === 12, 'ni menos de 12');
	ok(T.smoothBezier({ x: 0, y: 0 }, 'bottom', { x: 300, y: 100 }, 'top').cp1.y === 50, 'igual en vertical');
	ok(T.smoothBezier({ x: 0, y: 0 }, 'right', { x: -50, y: 300 }, 'left') === null, 'si la otra caja quedo atras, queda la curva de Obsidian');
	ok(T.smoothBezier({ x: 0, y: 0 }, 'right', { x: 100, y: 300 }, 'top') === null, 'y tambien con lados que no se miran');
}

// Una flecha que se dibuja como en Obsidian 1.15 (updatePath, leido de su codigo).
class ObsEdge {
	constructor(from, to) {
		this.from = from;
		this.to = to;
		this.path = { display: new El('path'), interaction: new El('path') };
	}
	updatePath() {
		const anchor = (n, side) => {
			const p = side === 'right' ? { x: n.x + n.width, y: n.y + n.height / 2 } : { x: n.x, y: n.y + n.height / 2 };
			return { x: p.x + (side === 'right' ? 7 : -7), y: p.y };
		};
		const s = anchor(this.from.node, this.from.side);
		const c = anchor(this.to.node, this.to.side);
		const dist = Math.hypot(c.x - s.x, c.y - s.y);
		const n = Math.min(150, Math.max(70, dist / 2));
		const cp1 = { x: s.x + (this.from.side === 'right' ? n : -n), y: s.y };
		const cp2 = { x: c.x + (this.to.side === 'right' ? n : -n), y: c.y };
		this.bezier = { from: s, to: c, cp1, cp2, path: 'M' + s.x + ',' + s.y + ' C' + cp1.x + ',' + cp1.y + ' ' + cp2.x + ',' + cp2.y + ' ' + c.x + ',' + c.y };
		const h = this.bezier.path + ' M' + c.x + ' ' + c.y + ' L' + (c.x + 7) + ' ' + c.y; // un extremo sin punta
		this.path.display.setAttribute('d', h);
		this.path.interaction.setAttribute('d', h);
	}
}
const ORIGINAL = ObsEdge.prototype.updatePath;
{
	const { plugin } = k.setup(k.mapaBase());
	const edge = new ObsEdge({ node: { x: 0, y: 0, width: 200, height: 60 }, side: 'right' }, { node: { x: 320, y: 300, width: 200, height: 60 }, side: 'left' });
	let redibujos = 0;
	const lienzo = { edges: new Map([['e', edge]]), markDirty: () => { redibujos++; } };
	edge.updatePath();
	const deObsidian = edge.path.display.getAttribute('d');
	ok(T.installCurvePatch(plugin, lienzo) === true && redibujos === 1, 'se engancha al dibujo de las flechas y pide redibujarlas');
	edge.updatePath();
	const d = edge.path.display.getAttribute('d');
	ok(d !== deObsidian && d.indexOf('M207,30 C260,30 260,330 313,330') > -1, 'la curva cambia: brazos de 53 px en vez de 150');
	ok(/M313 330 L320 330$/.test(d) && edge.path.interaction.getAttribute('d') === d, 'el resto del trazo (el extremo, la zona para hacer clic) queda igual');
	ok(edge.bezier.cp1.x === 260, 'y la etiqueta de la flecha se ubica sobre la curva nueva');
	plugin.settings.smoothCurves = false;
	edge.updatePath();
	ok(edge.path.display.getAttribute('d') === deObsidian, 'con la opcion apagada, vuelve la curva de Obsidian');
	plugin.settings.smoothCurves = true;
	ok(T.installCurvePatch(plugin, lienzo) === true && ObsEdge.prototype.updatePath !== ORIGINAL, 'engancharse dos veces no lo envuelve dos veces');
	T.removeCurvePatch(plugin);
	ok(ObsEdge.prototype.updatePath === ORIGINAL && plugin.curvePatch === null, 'al apagar el plugin, el dibujo de Obsidian queda como estaba');
}
{
	// si Obsidian cambia por dentro, nada se rompe
	const { plugin } = k.setup(k.mapaBase());
	const raro = { updatePath() { this.bezier = { path: 'otra cosa' }; this.path = { display: new El('path') }; this.path.display.setAttribute('d', 'M0 0 L10 10'); } };
	const instancia = Object.create(raro);
	instancia.from = { side: 'right' };
	instancia.to = { side: 'left' };
	T.installCurvePatch(plugin, { edges: new Map([['x', instancia]]), markDirty() {} });
	let error = null;
	try { instancia.updatePath(); } catch (e) { error = e; }
	ok(!error && instancia.path.display.getAttribute('d') === 'M0 0 L10 10', 'si el trazo no tiene la forma esperada, queda el de Obsidian');
	T.removeCurvePatch(plugin);
	ok(T.installCurvePatch(plugin, { edges: new Map([['x', {}]]), markDirty() {} }) === false, 'si la flecha no tiene updatePath, no se engancha');
	ok(T.installCurvePatch(plugin, { edges: new Map(), markDirty() {} }) === false, 'ni sin flechas');
}
k.fin();
