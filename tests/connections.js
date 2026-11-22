// Las conexiones no se rompen: lineas sueltas, flechas que desaparecen, datos viejos.
const k = require('./helpers/kit.js');
const { ok, T } = k;

console.log('\n--- reenganchar una rama y despues mover a la madre nueva');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	plugin.reparentTo(canvas, ['A1'], 'B', 'child');           // A1 pasa de A a B
	k.runFrames(); k.dropTimers(); canvas.frame();
	const f = k.foto(canvas, plugin);
	ok(f.padre.A1 === 'B', 'A1 ahora cuelga de B');
	ok(canvas.misindexed().length === 0, 'la flecha quedo bien anotada en el indice de Obsidian');
	canvas.userMove('B', 0, 300);                               // moves solo a la madre nueva
	ok(canvas.looseEdges().length === 0, 'al mover B, la linea B-A1 la sigue (no queda suelta)');
}

console.log('\n--- reenganchar y despues borrar a la madre vieja');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	plugin.reparentTo(canvas, ['A1'], 'B', 'child');
	k.runFrames(); k.dropTimers(); canvas.frame();
	canvas.userDelete('A2');
	canvas.userDelete('A');                                      // la madre vieja de A1
	const f = k.foto(canvas, plugin);
	ok(f.padre.A1 === 'B', 'borrar la madre vieja (A) no se lleva la flecha B-A1');
	ok(f.colgando === 0, 'no quedan flechas colgando');
}

console.log('\n--- desindentar desde el esquema (pasa a hermana de su madre)');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	plugin.reparentTo(canvas, ['A1'], 'A', 'after');             // A1 pasa a colgar de R
	k.runFrames(); k.dropTimers(); canvas.frame();
	ok(k.foto(canvas, plugin).padre.A1 === 'R', 'A1 ahora cuelga de R');
	canvas.userMove('R', -200, 0);
	ok(canvas.looseEdges().length === 0, 'al mover R, todas sus lineas lo siguen');
}

console.log('\n--- auto-organizar despues de reenganchar (alineacion completa)');
{
	const { canvas, plugin } = k.setup(k.mapaBase(), { mode: 'full' });
	plugin.reparentTo(canvas, ['A1'], 'B', 'child');
	k.runFrames(); k.dropTimers(); canvas.frame();
	plugin.reparentTo(canvas, ['C'], 'A', 'child');
	k.runFrames(); k.dropTimers(); canvas.frame();
	plugin.layout('right', true);
	k.runFrames(); k.dropTimers(); canvas.frame();
	const f = k.foto(canvas, plugin);
	ok(f.padre.A1 === 'B' && f.padre.C === 'A' && f.padre.B === 'R', 'el arbol queda como lo armaste');
	ok(canvas.looseEdges().length === 0, 'ninguna linea suelta despues de organizar');
	ok(canvas.misindexed().length === 0, 'y el indice de flechas esta sano');
	ok(f.colgando === 0 && f.flechas === 6, 'las 6 flechas siguen estando');
}

console.log('\n--- un canvas que ya venia con el indice roto se arregla solo');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	// lo que dejaba la version anterior: la flecha A-A1 reapuntada a B sin tocar el indice
	const d = canvas.getData();
	d.edges.find((e) => e.id === 'e-A-A1').fromNode = 'B';
	canvas.importData(d, true); canvas.frame();
	ok(canvas.misindexed().length === 1, '(el canvas arranca con una flecha mal anotada)');
	plugin.setNodeText(canvas, 'C', 'cualquier cambio');         // cualquier escritura del plugin
	ok(canvas.misindexed().length === 0, 'la primera vez que el plugin escribe, la flecha se rehace bien');
	canvas.userMove('B', 0, 250);
	ok(canvas.looseEdges().length === 0, 'y ya no queda suelta');
}

console.log('\n--- lo que haces mientras el mapa se esta reacomodando no se pierde');
{
	const { canvas, plugin } = k.setup(k.mapaBase(), { mode: 'full' });
	plugin.layout('right', true);                                // arranca la animacion
	k.tick(40);
	// a mitad de la animacion aparece un nodo nuevo con su flecha (lo creaste vos)
	const d = canvas.getData();
	d.nodes.push(k.nodo('NUEVO', 900, 900, { text: 'recien creado' }));
	d.edges.push(k.flecha('C', 'NUEVO'));
	canvas.importData(d, true); canvas.requestSave();
	const n = canvas.nodes.get('C'); n.setData(Object.assign(n.getData(), { text: 'texto escrito durante la animacion' }));
	k.runFrames(); k.dropTimers(); canvas.frame();
	const f = k.foto(canvas, plugin);
	ok(!!canvas.nodes.get('NUEVO'), 'el nodo que creaste durante la animacion sigue ahi');
	ok(f.padre.NUEVO === 'C', 'con su flecha');
	ok(f.texto.C === 'texto escrito durante la animacion', 'y lo que escribiste no se pisa con una foto vieja');
	ok(canvas.looseEdges().length === 0, 'sin lineas sueltas');
}

console.log('\n--- dos reacomodos seguidos, sin esperar');
{
	const { canvas, plugin } = k.setup(k.mapaBase(), { mode: 'full' });
	plugin.layout('right', true);
	k.tick(40);
	plugin.layout('down', true);                                 // antes de que termine el primero
	k.runFrames(); k.dropTimers(); canvas.frame();
	const f = k.foto(canvas, plugin);
	const g = T.buildGraph(canvas, plugin.settings);
	const R = g.nodes.get('R');
	ok(R.children.every((c) => c.y > R.y), 'gana el ultimo: todas las ramas quedan hacia abajo');
	ok(canvas.looseEdges().length === 0 && f.colgando === 0 && f.flechas === 6, 'y no se rompe nada');
}

console.log('\n--- organizar no toca lo que no es parte del mapa');
{
	const { canvas, plugin } = k.setup(k.mapaBase());
	const antes = { S: [canvas.nodes.get('S').x, canvas.nodes.get('S').y], IMG: [canvas.nodes.get('IMG').x, canvas.nodes.get('IMG').y] };
	plugin.layout('right', true);
	k.runFrames(); k.dropTimers(); canvas.frame();
	ok(canvas.nodes.get('S').x === antes.S[0] && canvas.nodes.get('S').y === antes.S[1], 'el apunte suelto no se mueve');
	ok(canvas.nodes.get('IMG').x === antes.IMG[0] && canvas.nodes.get('IMG').y === antes.IMG[1], 'la imagen suelta tampoco');
	ok(canvas.nodes.get('R').x === 0 && canvas.nodes.get('R').y === 200, 'y el mapa queda anclado en su raiz');
}

console.log('\n--- dos mapas en el mismo canvas no se enciman');
{
	const d = k.mapaBase();
	// un segundo mapa pegado al primero
	d.nodes.push(k.nodo('R2', 0, 260), k.nodo('X', 320, 240), k.nodo('Y', 320, 330), k.nodo('Z', 320, 420));
	d.edges.push(k.flecha('R2', 'X'), k.flecha('R2', 'Y'), k.flecha('R2', 'Z'));
	const { canvas, plugin } = k.setup(d);
	plugin.layout('right', true);
	k.runFrames(); k.dropTimers(); canvas.frame();
	const g = T.buildGraph(canvas, plugin.settings);
	const caja = (id) => {
		const ns = T.subtreeOf(g.nodes.get(id), true);
		return { y0: Math.min(...ns.map((n) => n.y)), y1: Math.max(...ns.map((n) => n.y + n.h)) };
	};
	const a = caja('R'); const b = caja('R2');
	ok(b.y0 >= a.y1 || a.y0 >= b.y1, 'los dos mapas quedan uno debajo del otro, sin pisarse');
	ok(canvas.looseEdges().length === 0, 'sin lineas sueltas');
}

console.log('\n--- flechas cruzadas entre dos ramas colapsadas');
{
	const d = k.mapaBase();
	d.edges.push(k.flecha('A1', 'B1', { id: 'cruzada' }));
	const { canvas, plugin } = k.setup(d);
	plugin.toggleCollapse(canvas.nodes.get('A'));
	plugin.toggleCollapse(canvas.nodes.get('B'));
	k.runFrames(); k.dropTimers(); canvas.frame();
	ok(k.foto(canvas, plugin).flechas === 7, 'colapsadas las dos, el mapa sigue guardando sus 7 flechas');
	plugin.toggleCollapse(canvas.nodes.get('A'));                // abro A: B1 sigue guardado
	k.runFrames(); k.dropTimers(); canvas.frame();
	ok(k.foto(canvas, plugin).flechas === 7, 'al abrir una sola, la flecha cruzada no se pierde');
	plugin.toggleCollapse(canvas.nodes.get('B'));
	k.runFrames(); k.dropTimers(); canvas.frame();
	const e = canvas.getData().edges.find((x) => x.fromNode === 'A1' && x.toNode === 'B1');
	ok(!!e, 'y al abrir la otra, vuelve a estar dibujada');
	ok(canvas.looseEdges().length === 0 && k.foto(canvas, plugin).colgando === 0, 'todo en su lugar');
}
k.fin();
