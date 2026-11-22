// La letra tiene que entrar al iframe donde Obsidian 1.15 dibuja el texto del nodo
const Plugin = require('./helpers/load.js').loadPlugin();
const { applyFontScale, applyFontToFrames } = Plugin.__test;
let fails = 0;
const ok = (c, m) => { console.log((c ? '  OK   ' : '  FALLA') + '  ' + m); if (!c) fails++; };

function estilo() {
	const vars = {};
	return {
		vars,
		setProperty: (k, v) => { vars[k] = v; },
		removeProperty: (k) => { delete vars[k]; },
		getPropertyValue: (k) => vars[k] || '',
	};
}
// caja con un iframe adentro, como las de Obsidian 1.15
function caja(opts) {
	const o = opts || {};
	const body = { style: estilo() };
	const frame = { className: 'embed-iframe is-controlled', contentDocument: o.sinDoc ? null : { body: o.sinBody ? null : body } };
	const clases = new Set();
	return {
		body, frame,
		classList: { add: (c) => clases.add(c), remove: (c) => clases.delete(c), contains: (c) => clases.has(c) },
		style: estilo(),
		querySelectorAll: () => [frame],
	};
}

{
	const el = caja();
	applyFontScale(el, 0, 15, 1.5);
	ok(el.body.style.vars['--font-text-size'] === '16.5px', 'el tamano nuevo entra al iframe de la caja');
	ok(el.style.vars['--font-text-size'] === '16.5px', 'y tambien queda en la caja, para lo que se dibuja afuera');
}
{   // el cuadradito, adentro del iframe
	const el = caja();
	applyFontScale(el, 2, 15, 1.5);
	ok(el.body.style.vars['--font-text-size'] === '33.0px', 'una caja estirada al doble tambien se agranda adentro');
}
{   // con el ajuste en 0 se limpia
	const el = caja();
	applyFontScale(el, 0, 15, 1.5);
	applyFontScale(el, 0, 15, 0);
	ok(!('--font-text-size' in el.body.style.vars), 'con el ajuste en 0 el iframe vuelve a lo de Obsidian');
}
{   // un iframe que todavia no cargo, o ajeno, no rompe nada
	const sinDoc = caja({ sinDoc: true });
	const sinBody = caja({ sinBody: true });
	applyFontScale(sinDoc, 0, 15, 1.5);
	applyFontScale(sinBody, 0, 15, 1.5);
	ok(sinDoc.style.vars['--font-text-size'] === '16.5px', 'un iframe sin cargar no rompe nada');
	const roto = { classList: { add() {}, remove() {}, contains: () => false }, style: estilo(), querySelectorAll: () => { throw new Error('no'); } };
	let error = null;
	try { applyFontScale(roto, 0, 15, 1.5); } catch (e) { error = e; }
	ok(!error, 'y si el navegador no deja mirar adentro, tampoco');
}
{   // una caja sin iframes (una imagen, un grupo)
	const el = { classList: { add() {}, remove() {}, contains: () => false }, style: estilo(), querySelectorAll: () => [] };
	applyFontScale(el, 0, 15, 1.5);
	ok(el.style.vars['--font-text-size'] === '16.5px', 'una caja sin iframe sigue andando como antes');
	let error = null;
	try { applyFontToFrames({}, '16px'); } catch (e) { error = e; }
	ok(!error, 'y un elemento raro no tira error');
}
console.log(fails ? '\nFALLAS: ' + fails : '\nTodo OK');
process.exit(fails ? 1 : 0);
