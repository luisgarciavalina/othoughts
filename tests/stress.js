// Revision general: miles de operaciones al azar, y despues de CADA una se
// comprueba que el mapa siga entero (mismos nodos, mismas flechas, mismos padres).
const k = require('./helpers/kit.js');
const { T } = k;

function rng(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0; a = (a + 0x6D2B79F5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const DIRS = ['right', 'left', 'down', 'up', 'both-h', 'both-v'];
const MODES = ['full', 'partial', 'manual'];
const ESCENARIOS = Number(process.env.ESCENARIOS || 150);
const PASOS = Number(process.env.PASOS || 40);

let problemas = 0;
let operaciones = 0;
const vistos = new Map();
function falla(seed, paso, op, msg) {
	problemas++;
	const clave = op + ': ' + msg;
	vistos.set(clave, (vistos.get(clave) || 0) + 1);
	if (problemas <= 12) console.log('  FALLA  semilla ' + seed + ' paso ' + paso + ' [' + op + '] ' + msg);
}

for (let seed = 1; seed <= ESCENARIOS; seed++) {
	if (process.env.SOLO && seed !== Number(process.env.SOLO)) continue;
	const r = rng(seed);
	const pick = (arr) => arr[Math.floor(r() * arr.length)];
	const base = k.mapaBase();
	if (r() < 0.5) base.edges.push(k.flecha('A2', 'B1', { id: 'cruzada' }));
	if (r() < 0.3) base.edges.push(k.flecha('C', 'R', { id: 'vuelta' })); // un ciclo: no es madre-hija
	if (r() < 0.3) {
		base.nodes.push({ id: 'G', type: 'group', label: 'grupo', x: 300, y: -80, width: 600, height: 220 });
	}
	const { canvas, plugin } = k.setup(base, { mode: pick(MODES), dir: pick(DIRS), animate: r() < 0.8 });
	let esperado = k.foto(canvas, plugin);
	let roto = false;
	const borrados = new Set();

	const visibles = () => Array.from(canvas.nodes.values()).filter((n) => (n.getData().type !== 'group')).map((n) => n.id);

	for (let paso = 1; paso <= PASOS && !roto; paso++) {
		const ids = visibles();
		if (!ids.length) break;
		const id = pick(ids);
		const node = canvas.nodes.get(id);
		const tipo = r();
		let op = '';
		let libre = null;
		try {
			if (tipo < 0.14) {
				op = 'crear';
				const kind = r() < 0.6 ? 'child' : 'sibling';
				const nuevo = plugin.addNode(kind, { baseId: id, edit: false });
				global.__det = kind + ' nuevo=' + nuevo;
				if (nuevo) {
					const madre = kind === 'child' ? id : esperado.padre[id];
					esperado.padre[nuevo] = madre || null;
					esperado.nodos++;
					if (madre) esperado.flechas++;
				}
			} else if (tipo < 0.34) {
				op = 'reenganchar';
				const destino = pick(ids);
				const zone = pick(['child', 'before', 'after']);
				const antes = esperado.padre[id];
				const madreNueva = zone === 'child' ? destino : esperado.padre[destino];
				const yaUnidos = !antes && !!madreNueva && canvas.getData().edges.some((e) => e.mmLink === true && e.fromNode === madreNueva && e.toNode === id);
				const hecho = plugin.reparentTo(canvas, [id], destino, zone);
				global.__det = '-> ' + destino + ' (' + zone + ') hecho=' + hecho + ' antes=' + antes;
				if (hecho) {
					const nuevaMadre = zone === 'child' ? destino : esperado.padre[destino];
					if (!antes && nuevaMadre && !yaUnidos) esperado.flechas++;
					if (antes && !nuevaMadre) esperado.flechas--;
					esperado.padre[id] = nuevaMadre || null;
					// soltada como raiz: si le llega otra flecha (una conexion cruzada),
					// esa pasa a ser su madre. Es lo esperado: sigue unida por esa flecha.
					if (!nuevaMadre) libre = id;
				}
			} else if (tipo < 0.46) {
				op = 'colapsar/expandir';
				plugin.toggleCollapse(node);
			} else if (tipo < 0.50) {
				op = 'colapsar todo';
				plugin.collapseAll();
			} else if (tipo < 0.55) {
				op = 'expandir todo';
				plugin.expandAll();
			} else if (tipo < 0.67) {
				op = 'organizar todo';
				plugin.layout(pick(DIRS), true);
			} else if (tipo < 0.72) {
				op = 'organizar la rama';
				canvas.selectOnly(node);
				plugin.layout(pick(DIRS));
				canvas.deselectAll();
			} else if (tipo < 0.77) {
				op = 'cambiar alineacion';
				plugin.setAlignMode(pick(MODES));
			} else if (tipo < 0.87) {
				op = 'arrastrar';
				canvas.userMove(id, Math.round((r() - 0.5) * 900), Math.round((r() - 0.5) * 700));
				plugin.fitEdgeSides(canvas, [id]);
				plugin.autoRelayout(canvas, 'move');
			} else if (tipo < 0.90) {
				op = 'ordenar hermanos';
				canvas.selectOnly(node); plugin.sortSiblings(r() < 0.5); canvas.deselectAll();
			} else if (tipo < 0.93) {
				op = 'igualar tamano';
				canvas.selectOnly(node); plugin.equalizeSize(); canvas.deselectAll();
			} else if (tipo < 0.96) {
				op = 'escribir';
				if (plugin.setNodeText(canvas, id, 'texto ' + paso)) { /* el texto no cambia la estructura */ }
			} else {
				op = 'borrar (Supr)';
				const d = canvas.getData();
				const nd = d.nodes.find((n) => n.id === id);
				const hijos = Object.keys(esperado.padre).filter((x) => esperado.padre[x] === id);
				if (nd && !nd[T.COLLAPSED_KEY] && !hijos.length) {
					// todas las flechas que lo tocan, tambien las guardadas en ramas colapsadas
					const toca = esperado.todas.filter((e) => e.fromNode === id || e.toNode === id).length;
					borrados.add(id);
					canvas.userDelete(id);
					delete esperado.padre[id];
					esperado.nodos--;
					esperado.flechas -= toca;
				}
			}
		} catch (e) {
			falla(seed, paso, op, 'tiro un error: ' + (e && e.message));
			roto = true;
		}
		operaciones++;
		if (process.env.SOLO) console.log('   paso ' + paso + ': ' + op + ' sobre ' + id + ' ' + (global.__det || '') + ' | modo ' + plugin.mapState(canvas).mode + ' dir ' + plugin.mapState(canvas).dir);
		global.__det = '';

		// a veces espero a que termine la animacion, a veces sigo en el medio
		const espera = r();
		if (espera < 0.5) { k.runFrames(); k.runTimers(); canvas.frame(); }
		else if (espera < 0.8) { k.tick(40); canvas.frame(); }

		const f = k.foto(canvas, plugin);
		if (process.env.SOLO && f.vivas !== esperado.flechas) {
			const antes = new Map(esperado.todas.map((e) => [e.id, e]));
			const ahora = new Map(f.todas.map((e) => [e.id, e]));
			antes.forEach((e, id) => { if (!ahora.has(id)) console.log('      se fue:', JSON.stringify(e)); });
			ahora.forEach((e, id) => { if (!antes.has(id)) console.log('      aparecio:', JSON.stringify(e)); });
			console.log('      nodos:', Object.keys(f.padre).join(' '));
			console.log('      madres esperadas:', JSON.stringify(esperado.padre));
			console.log('      madres ahora   :', JSON.stringify(f.padre));
			console.log('      flechas:', f.todas.map((e) => e.fromNode + '>' + e.toNode + (e.mmLink ? '(' + e.mmLink + ')' : '') + (e.fromEnd ? '[fromEnd ' + e.fromEnd + ']' : '')).join('  '));
			const g = T.buildGraph(canvas, plugin.settings);
			console.log('      a la vista:', Array.from(g.nodes.values()).map((n) => n.id + '<' + (n.parent ? n.parent.id : '-')).join(' '));
		}
		// Al soltar un nodo como raiz se borra su flecha madre: si quedaban conexiones
		// cruzadas (o una flecha de vuelta), ahora son ellas las que definen la jerarquia.
		if (f.idsRepetidos) { falla(seed, paso, op, 'nodos con el id repetido'); roto = true; }
		if (f.flechasRepetidas) { falla(seed, paso, op, 'flechas con el id repetido'); roto = true; }
		if (f.colgandoVisibles) { falla(seed, paso, op, 'flechas a la vista con un extremo que no existe'); roto = true; }
		// dentro de una rama colapsada puede quedar la flecha de un nodo que borraste
		// a mano (se descarta al abrir la rama); cualquier otra cosa es un error
		if (f.extremosPerdidos.some((x) => !borrados.has(x))) { falla(seed, paso, op, 'flechas guardadas con un extremo que no existe'); roto = true; }
		if (f.nodos !== esperado.nodos) { falla(seed, paso, op, 'cambio la cantidad de nodos: ' + esperado.nodos + ' -> ' + f.nodos); roto = true; }
		if (f.vivas !== esperado.flechas) { falla(seed, paso, op, 'cambio la cantidad de flechas: ' + esperado.flechas + ' -> ' + f.vivas); roto = true; }
		esperado.todas = f.todas;
		const a = JSON.stringify(Object.keys(esperado.padre).sort().map((x) => [x, esperado.padre[x]]));
		const b = JSON.stringify(Object.keys(f.padre).sort().map((x) => [x, f.padre[x]]));
		if (!roto && a !== b) {
			const dif = Object.keys(f.padre).filter((x) => f.padre[x] !== esperado.padre[x]);
			falla(seed, paso, op, 'cambio de madre sin pedirlo: ' + dif.map((x) => x + ' ' + esperado.padre[x] + '->' + f.padre[x]).join(', '));
			roto = true;
		}
	}

	if (roto) continue;
	// al final: todo quieto, ninguna linea suelta, indice sano
	k.runFrames(); k.runTimers(); canvas.frame();
	const sueltas = canvas.looseEdges();
	if (sueltas.length) falla(seed, 'fin', 'final', sueltas.length + ' linea(s) suelta(s)');
	const mal = canvas.misindexed();
	if (mal.length) falla(seed, 'fin', 'final', mal.length + ' flecha(s) mal anotada(s) en el indice');

	// y un reacomodo completo deja un mapa prolijo: ninguna caja encima de otra del mismo mapa
	plugin.expandAll(true);
	plugin.layout('right', true);
	k.runFrames(); k.runTimers(); canvas.frame();
	const g = T.buildGraph(canvas, plugin.settings);
	let encimadas = 0;
	for (const root of g.roots) {
		if (!root.children.length) continue;
		const ns = T.subtreeOf(root, true);
		for (let i = 0; i < ns.length; i++) {
			for (let j = i + 1; j < ns.length; j++) {
				const p = ns[i], q = ns[j];
				if (p.x < q.x + q.w && p.x + p.w > q.x && p.y < q.y + q.h && p.y + p.h > q.y) encimadas++;
			}
		}
		// cada hijo, a la derecha de su madre
		for (const n of ns) if (n.parent && n.x < n.parent.x + n.parent.w) encimadas++;
	}
	if (encimadas) falla(seed, 'fin', 'organizar', encimadas + ' caja(s) encimadas o del lado equivocado');
	if (canvas.looseEdges().length) falla(seed, 'fin', 'organizar', 'lineas sueltas despues de organizar');
}

console.log('\n' + ESCENARIOS + ' mapas, ' + operaciones + ' operaciones al azar.');
if (problemas) {
	console.log('PROBLEMAS: ' + problemas);
	Array.from(vistos.entries()).sort((x, y) => y[1] - x[1]).slice(0, 15).forEach(([m, n]) => console.log('   ' + n + ' x  ' + m));
} else console.log('Ningun problema: el mapa quedo entero despues de cada operacion.');
process.exit(problemas ? 1 : 0);
