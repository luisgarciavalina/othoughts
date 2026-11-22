// Comportamiento pensado para la comunidad: el plugin no molesta en un canvas comun,
// arranca sin errores y no deja nada puesto al apagarse.
const k = require('./helpers/kit.js');
const { ok, T } = k;

function arrastre(plugin, canvas, id) {
	const drag = new T.BranchDrag(plugin);
	drag.canvas = canvas;
	drag.graph = T.buildGraph(canvas, plugin.settings);
	const node = canvas.nodes.get(id);
	drag.anchor = { node, sx: node.x, sy: node.y };
	drag.dragged = new Set([id]);
	return drag;
}

console.log('\n--- soltar para enganchar: solo cuando hay un mapa de por medio');
{
	// un canvas comun: dos tarjetas sueltas, una al lado de la otra
	const { canvas, plugin } = k.setup({ nodes: [k.nodo('X', 0, 0), k.nodo('Y', 260, 10)], edges: [] });
	ok(arrastre(plugin, canvas, 'X').findDropTarget() === null, 'dos tarjetas sueltas que quedan cerca no se enganchan solas');
}
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	canvas.nodes.get('S').moveTo({ x: 330, y: 70 });            // el apunte suelto, arrastrado junto a la rama A
	const destino = arrastre(plugin, canvas, 'S').findDropTarget();
	ok(!!destino && ['A', 'A1', 'A2', 'B'].indexOf(destino.node.id) > -1, 'una tarjeta suelta arrastrada a un mapa si se puede enganchar');
	canvas.nodes.get('C').moveTo({ x: 1490, y: 860 });          // una rama del mapa, arrastrada junto a la imagen suelta
	const destino2 = arrastre(plugin, canvas, 'C').findDropTarget();
	ok(!!destino2 && destino2.node.id === 'IMG', 'y una rama del mapa se puede colgar de una tarjeta suelta');
	plugin.settings.dropToReparent = false;
	ok(arrastre(plugin, canvas, 'C').findDropTarget() === null, 'con la opcion apagada no engancha nunca');
}

console.log('\n--- huella de las flechas');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	const antes = T.linkSignature(canvas);
	ok(antes === T.linkSignature(canvas), 'sin cambios, la huella es la misma (no se recalcula nada)');
	const d = canvas.getData();
	d.edges.push(k.flecha('A2', 'B1', { id: 'cruzada' }));
	canvas.importData(d, true);
	ok(T.linkSignature(canvas) !== antes, 'una flecha nueva cambia la huella');
	T.stampLinks(canvas, plugin.settings);
	ok(canvas.edges.get('cruzada').unknownData[T.LINK_KEY] === true, 'y la flecha nueva queda marcada como conexion cruzada');
	const marcada = T.linkSignature(canvas);
	T.stampLinks(canvas, plugin.settings);
	ok(T.linkSignature(canvas) === marcada, 'marcar dos veces no cambia nada');
}

console.log('\n--- el canvas activo');
{
	const { canvas, app } = k.setup(k.mapaBase());
	ok(T.getCanvas(app) === canvas, 'encuentra el canvas activo sin usar workspace.activeLeaf');
	app.workspace.getActiveViewOfType = () => null;              // el foco esta en otro panel (el esquema)
	ok(T.getCanvas(app) === canvas, 'con el foco en otro panel sigue trabajando sobre el ultimo canvas');
	app.workspace.getLeavesOfType = () => [];                    // se cerro
	ok(T.getCanvas(app) === null, 'y si el canvas se cerro, no devuelve nada');
}

console.log('\n--- el teclado solo actua sobre tarjetas que son parte de un mapa');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	const nodos = () => canvas.getData().nodes.length;
	const tecla = (key) => plugin.onMapKey({ key }, key);
	const antes = nodos();

	canvas.selectOnly(canvas.nodes.get('S'));                     // tarjeta suelta
	ok(tecla('Enter') === undefined && nodos() === antes, 'Enter sobre una tarjeta suelta queda como en Obsidian (no crea nada)');
	ok(plugin.navigate('ArrowRight') === false, 'y las flechas la mueven, como siempre');

	canvas.selectOnly(canvas.nodes.get('A1'));                    // una hoja del mapa
	ok(tecla('Enter') === false && nodos() === antes + 1, 'Enter sobre un nodo del mapa crea un hermano');
	k.runFrames(); k.dropTimers(); canvas.frame();
	ok(k.foto(canvas, plugin).padre[canvas.getData().nodes[antes].id] === 'A', 'que cuelga de la misma madre');

	canvas.selectOnly(canvas.nodes.get('R'));                     // la raiz
	ok(tecla('Enter') === false && nodos() === antes + 2, 'Enter sobre la raiz del mapa le agrega una rama');
	k.runFrames(); k.dropTimers(); canvas.frame();
	ok(k.foto(canvas, plugin).padre[canvas.getData().nodes[antes + 1].id] === 'R', 'que cuelga de la raiz');

	canvas.selectOnly(canvas.nodes.get('S'));
	ok(tecla('Tab') === false && nodos() === antes + 3, 'Tab siempre crea un hijo: asi se empieza un mapa desde una tarjeta suelta');
	k.runFrames(); k.dropTimers(); canvas.frame();

	canvas.selectOnly(canvas.nodes.get('R'));
	ok(plugin.navigate('ArrowRight') === true && Array.from(canvas.selection)[0].id !== 'R', 'dentro del mapa, las flechas saltan de nodo en nodo');
}
{
	const { canvas, plugin } = k.setup({ nodes: [k.nodo('X', 0, 0), k.nodo('Y', 400, 0)], edges: [] });
	canvas.deselectAll();
	ok(plugin.navigate('ArrowRight') === false, 'en un canvas sin mapas, las flechas no seleccionan nada por su cuenta');
}

console.log('\n--- arranque y apagado');
(async () => {
	const { plugin } = k.setup(k.mapaBase());
	let error = null;
	try { await plugin.onload(); } catch (e) { error = e; }
	ok(!error, 'el plugin arranca sin errores' + (error ? ': ' + error.message : ''));
	const cmds = plugin.commands || [];
	ok(cmds.length >= 60, 'registra sus comandos (' + cmds.length + ')');
	ok(cmds.every((c) => !('hotkeys' in c)), 'ninguno trae un atajo por defecto');
	ok(cmds.every((c) => typeof c.name === 'string' && c.name.length > 3 && !/undefined|\{\w+\}/.test(c.name)), 'todos tienen nombre completo');
	ok(new Set(cmds.map((c) => c.id)).size === cmds.length, 'y un id distinto cada uno');
	ok(plugin.settings.fontBump === 0 && plugin.settings.openZoom === 0, 'recien instalado no cambia ni la letra ni el zoom de tus canvas');
	let error2 = null;
	try { plugin.onunload(); } catch (e) { error2 = e; }
	ok(!error2, 'y se apaga sin errores' + (error2 ? ': ' + error2.message : ''));
	k.fin();
})();
