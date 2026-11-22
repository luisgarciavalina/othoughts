// Instantaneas: guardar como esta el mapa, verlas, compararlas, volver atras.
const k = require('./helpers/kit.js');
const { ok, T } = k;
const { Notice, TFolder } = require('./helpers/obsidian-stub.js');

const DIA = 24 * 3600 * 1000;
const T0 = new Date(2026, 10, 22, 14, 30, 5).getTime(); // 22 nov 2026, 14.30.05
const RAIZ = 'Instantáneas de mapas';
const CARPETA = RAIZ + '/Proyectos/Ideas - Café';

function armar(opts) {
	const r = k.setup(k.mapaBase(), Object.assign({ path: 'Proyectos/Ideas - Café.canvas' }, opts || {}));
	r.plugin.askText = async () => r.respuestaTexto === undefined ? '' : r.respuestaTexto;
	r.plugin.askConfirm = async () => r.respuestaSiNo !== false;
	return r;
}
const archivos = (vault) => Array.from(vault.files.keys()).filter((p) => p.indexOf(RAIZ + '/') === 0).sort();
const escribir = (canvas, id, texto) => { const n = canvas.nodes.get(id); n.setData(Object.assign(n.getData(), { text: texto })); };

(async () => {
	console.log('\n--- nombres de archivo');
	ok(T.snapshotStamp(new Date(T0)) === '2026-11-22 14.30', 'fecha y hora sin ":" (Windows no los acepta en un nombre de archivo)');
	const info = T.parseSnapshotName('2026-11-22 14.30.05 — antes del congreso');
	ok(info && info.time === T0 && info.label === 'antes del congreso' && info.stamp === '2026-11-22 14.30.05', 'el nombre del archivo guarda la fecha y el nombre de la instantanea');
	ok(T.parseSnapshotName('apuntes sueltos') === null, 'un archivo cualquiera no se confunde con una instantanea');
	ok(T.cleanSnapshotLabel('  antes: del / congreso?  ') === 'antes del congreso', 'lo que no puede ir en un nombre de archivo se limpia');

	console.log('\n--- tomar una instantanea');
	{
		const { canvas, plugin, adapter } = armar();
		plugin.toggleCollapse(canvas.nodes.get('A'));               // con una rama colapsada adentro
		k.runFrames(); k.dropTimers(); canvas.frame();
		const f = await plugin.takeSnapshot(canvas, 'antes del congreso', { now: T0 });
		ok(f && f.path === CARPETA + '/2026-11-22 14.30 — antes del congreso.canvas', 'queda en "Instantáneas de mapas", en una carpeta con la ruta del canvas');
		ok(plugin.settings.snapshotFolder === RAIZ, 'la carpeta queda fija en las opciones desde la primera');
		const guardado = JSON.parse(adapter.files.get(f.path));
		ok(T.sameMap(guardado, canvas.getData()), 'es una copia exacta del canvas');
		ok(T.snapshotIndex(guardado).size === 9, 'con todo adentro, tambien lo que esta dentro de la rama colapsada');
		ok(/^\{\n\t"nodes"/.test(adapter.files.get(f.path)), 'es un canvas comun: se abre en Obsidian como cualquier otro');
		const g = await plugin.takeSnapshot(canvas, 'antes del congreso', { now: T0 });
		ok(g && g.path === CARPETA + '/2026-11-22 14.30.05 — antes del congreso.canvas', 'dos iguales en el mismo minuto: la segunda lleva los segundos');
		ok(await plugin.takeSnapshot(canvas, 'antes del congreso', { now: T0 }) === null, 'una tercera en el mismo segundo no pisa nada');
		const h = await plugin.takeSnapshot(canvas, '', { now: T0 + 3600 * 1000 });
		const lista = plugin.listSnapshots('Proyectos/Ideas - Café.canvas');
		ok(lista.length === 3 && lista[0].file.path === h.path && lista[0].label === '', 'se listan todas, de la mas nueva a la mas vieja');
		ok(lista[1].time > lista[2].time, 'tambien dentro del mismo minuto');
	}

	console.log('\n--- desde la ruedita o el comando');
	{
		const r = armar();
		r.respuestaTexto = null;                                  // tocaste Cancelar
		ok(await r.plugin.takeSnapshotFromUi() === null && archivos(r.adapter).length === 0, 'si cancelas, no se guarda nada');
		r.respuestaTexto = 'primera version';
		const f = await r.plugin.takeSnapshotFromUi();
		ok(f && /— primera version\.canvas$/.test(f.path), 'con el nombre que le pusiste');
		ok(/^Instantánea guardada: /.test(Notice.ultima), 'y te avisa');
	}

	console.log('\n--- que cambio entre una version y otra');
	{
		const { canvas } = armar();
		const antes = T.snapshotIndex(canvas.getData());
		escribir(canvas, 'B', 'B, reescrito');
		canvas.userDelete('C');
		const d = canvas.getData();
		d.nodes.push(k.nodo('NUEVO', 900, 900));
		canvas.importData(d, true);
		const diff = T.snapshotDiff(antes, T.snapshotIndex(canvas.getData()));
		ok(diff.added === 1 && diff.removed === 1 && diff.edited === 1, 'un nodo nuevo, uno borrado y uno reescrito: +1 −1 ~1');
		ok(T.sameMap({ nodes: [{ a: 1, b: 2 }], edges: [] }, { nodes: [{ b: 2, a: 1 }], edges: [] }), 'el orden de las claves no cuenta como cambio');
	}

	console.log('\n--- volver atras');
	{
		const { canvas, plugin, adapter } = armar();
		const vieja = await plugin.takeSnapshot(canvas, 'original', { now: T0 });
		escribir(canvas, 'A', 'A, despues de pensarlo');
		plugin.reparentTo(canvas, ['C'], 'A', 'child');
		k.runFrames(); k.dropTimers(); canvas.frame();
		const ahora = canvas.getData();
		ok(await plugin.restoreSnapshot(canvas, vieja) === true, 'se restaura');
		k.runFrames(); k.dropTimers(); canvas.frame();
		const f = k.foto(canvas, plugin);
		ok(f.texto.A === 'A' && f.padre.C === 'R', 'el mapa vuelve a como estaba: textos y ramas');
		ok(canvas.looseEdges().length === 0 && canvas.misindexed().length === 0 && f.colgando === 0, 'con todas sus flechas en su lugar');
		const lista = plugin.listSnapshots('Proyectos/Ideas - Café.canvas');
		const previa = lista.find((e) => e.label === 'antes de restaurar');
		ok(!!previa && T.sameMap(JSON.parse(adapter.files.get(previa.file.path)), ahora), 'antes se guardo como estaba, asi que se puede deshacer');
		ok(await plugin.restoreSnapshot(canvas, previa.file) === true && k.foto(canvas, plugin).texto.A === 'A, despues de pensarlo', 'y deshacerlo funciona');
	}
	{
		const r = armar();
		const vieja = await r.plugin.takeSnapshot(r.canvas, '', { now: T0 });
		r.respuestaSiNo = false;
		escribir(r.canvas, 'A', 'cambiado');
		ok(await r.plugin.restoreSnapshotFromUi(vieja) === false && k.foto(r.canvas, r.plugin).texto.A === 'cambiado', 'si en la pregunta decis que no, no se toca nada');
		const otro = armar({ path: 'Otro mapa.canvas' });
		ok(await otro.plugin.restoreSnapshot(otro.canvas, vieja) === false, 'una instantanea de otro canvas no se puede restaurar aca');
	}

	console.log('\n--- automaticas');
	{
		const { canvas, plugin, adapter } = armar({ settings: { autoSnapshot: 'off' } });
		ok(await plugin.autoSnapshot(canvas, T0) === null && archivos(adapter).length === 0, 'apagadas, no hacen nada');
		plugin.settings.autoSnapshot = 'daily';
		const f = await plugin.autoSnapshot(canvas, T0);
		ok(f && /— automática\.canvas$/.test(f.path), 'prendidas: la primera vez se toma una, marcada como automatica');
		plugin.snapshotChecks.clear();
		escribir(canvas, 'A', 'cambio de la tarde');
		ok(await plugin.autoSnapshot(canvas, T0 + 3 * 3600 * 1000) === null, 'el mismo dia no se toma otra');
		plugin.snapshotChecks.clear();
		ok(await plugin.autoSnapshot(canvas, T0 + DIA) !== null, 'al otro dia si, porque el mapa cambio');
		plugin.snapshotChecks.clear();
		ok(await plugin.autoSnapshot(canvas, T0 + 2 * DIA) === null, 'y al siguiente no, porque no cambio nada');
		plugin.snapshotChecks.clear();
		escribir(canvas, 'B', 'otra cosa');
		ok(await plugin.autoSnapshot(canvas, T0 + 3 * DIA + 60000) !== null, 'en cuanto vuelve a cambiar, si');
		ok(await plugin.autoSnapshot(canvas, T0 + 4 * DIA + 120000) === null, 'y no se mira de nuevo hasta dentro de 10 minutos');
		plugin.settings.autoSnapshot = 'weekly';
		plugin.snapshotChecks.clear();
		escribir(canvas, 'C', 'semana');
		ok(await plugin.autoSnapshot(canvas, T0 + 6 * DIA) === null, 'semanales: a los 3 dias de la ultima, no');
		plugin.snapshotChecks.clear();
		ok(await plugin.autoSnapshot(canvas, T0 + 11 * DIA) !== null, 'a la semana, si');
		const vacio = armar({ settings: { autoSnapshot: 'daily' } });
		vacio.canvas.importData({ nodes: [], edges: [] }, true);
		ok(await vacio.plugin.autoSnapshot(vacio.canvas, T0) === null, 'un canvas vacio no genera instantaneas');
	}

	console.log('\n--- las instantaneas se abren en solo lectura');
	{
		const { canvas, plugin, app } = armar();
		const f = await plugin.takeSnapshot(canvas, '', { now: T0 });
		await plugin.openSnapshot(f);
		ok(app.workspace.opened[0] === f.path, 'se abre en una pestana');
		const snap = new k.FakeCanvas(canvas.getData(), f.path);
		ok(plugin.lockSnapshot(snap) === true && snap.readonly === true && snap.view.localData.readonly === true, 'al abrirse se traba en solo lectura (y Obsidian lo recuerda)');
		snap.setReadonly(false);                                     // la destrabas a proposito
		ok(plugin.lockSnapshot(snap) === false && snap.readonly === false, 'si la destrabas, no se vuelve a trabar sola');
		ok(plugin.lockSnapshot(canvas) === false && canvas.readonly === false, 'un canvas comun nunca se traba');
		ok(plugin.sourceOfPath(f.path) === 'Proyectos/Ideas - Café.canvas', 'se sabe de que canvas viene');
		const antes = Object.keys(plugin.maps).length;
		plugin.mapState(snap);
		ok(Object.keys(plugin.maps).length === antes, 'usa la direccion y el estilo de su canvas original (no crea uno propio)');
	}
	{
		const { canvas, plugin, adapter } = armar();
		const f = await plugin.takeSnapshot(canvas, '', { now: T0 });
		const snap = new k.FakeCanvas(canvas.getData(), f.path);
		snap.setReadonly(true);
		plugin.app.workspace.getActiveViewOfType = () => snap.view;
		const foto = JSON.stringify(snap.getData());
		plugin.toggleCollapse(snap.nodes.get('A'));
		ok(/solo lectura/.test(Notice.ultima) && /historial/.test(Notice.ultima), 'colapsar en una instantanea no se puede, y te dice como volver a esa version');
		plugin.addNode('child', { baseId: 'R', edit: false });
		plugin.layout('right', true);
		plugin.setNodeText(snap, 'A', 'no');
		plugin.reparentTo(snap, ['C'], 'A', 'child');
		plugin.setTheme('papel');
		k.runFrames(); k.dropTimers();
		ok(JSON.stringify(snap.getData()) === foto, 'ni crear, ni organizar, ni escribir, ni enganchar: la instantanea queda intacta');
		ok(await plugin.exportMap('md') !== null, 'exportarla si se puede');
		ok(await plugin.takeSnapshot(snap, '', { now: T0 + 60000 }) === null, 'y no se toman instantaneas de una instantanea');
		void adapter;
	}

	console.log('\n--- renombrar y borrar');
	{
		const r = armar();
		const f = await r.plugin.takeSnapshot(r.canvas, 'borrador', { now: T0 });
		r.respuestaTexto = 'antes del viaje';
		ok(await r.plugin.renameSnapshot(f) === true && r.adapter.files.has(CARPETA + '/2026-11-22 14.30 — antes del viaje.canvas'), 'renombrar cambia el nombre y conserva la fecha');
		const g = await r.plugin.takeSnapshot(r.canvas, '', { now: T0 + DIA });
		r.respuestaTexto = 'antes del viaje';
		const nombres = archivos(r.adapter).join('|');
		ok(await r.plugin.renameSnapshot(g) === true && archivos(r.adapter).length === 2 && archivos(r.adapter).join('|') !== nombres, 'dos pueden llamarse igual: las distingue la fecha');
		const lista = r.plugin.listSnapshots('Proyectos/Ideas - Café.canvas');
		r.respuestaSiNo = false;
		ok(await r.plugin.deleteSnapshot(lista[0].file) === false && archivos(r.adapter).length === 2, 'borrar pregunta antes; si decis que no, queda');
		r.respuestaSiNo = true;
		ok(await r.plugin.deleteSnapshot(lista[0].file) === true && r.adapter.trash.length === 1 && archivos(r.adapter).length === 1, 'si decis que si, va a la papelera');
	}

	console.log('\n--- la historia sigue al canvas');
	{
		const { canvas, plugin, adapter } = armar();
		await plugin.takeSnapshot(canvas, '', { now: T0 });
		await plugin.moveSnapshotsFor('Proyectos/Ideas - Café.canvas', 'Archivo/Ideas.canvas', false);
		ok(archivos(adapter)[0] === RAIZ + '/Archivo/Ideas/2026-11-22 14.30.canvas', 'si moves o renombras el canvas, sus instantaneas se mudan con el');
		await plugin.moveSnapshotsFor('Archivo', 'Archivo 2026', true);
		ok(archivos(adapter)[0] === RAIZ + '/Archivo 2026/Ideas/2026-11-22 14.30.canvas', 'tambien si renombras la carpeta donde esta');
		const raiz = new TFolder('Historia');
		plugin.onFileRenamed(raiz, RAIZ);
		ok(plugin.settings.snapshotFolder === 'Historia', 'si renombras la carpeta de instantaneas, el plugin la sigue');
	}
	{
		const { canvas, plugin, adapter } = armar();
		await plugin.takeSnapshot(canvas, '', { now: T0 });
		ok(await plugin.changeSnapshotFolder('Historia de mapas') === true && archivos(adapter).length === 0
			&& adapter.files.has('Historia de mapas/Proyectos/Ideas - Café/2026-11-22 14.30.canvas'), 'elegir otra carpeta muda las que ya habia');
		adapter.folders.add('Ocupada');
		ok(await plugin.changeSnapshotFolder('Ocupada') === false && plugin.settings.snapshotFolder === 'Historia de mapas', 'a una carpeta que ya existe, no');
	}

	console.log('\n--- el panel del historial');
	{
		const { canvas, plugin, app } = armar();
		const leaf = { app };
		const vista = new T.SnapshotsView(leaf, plugin);
		await vista.onOpen();
		const textos = (el) => { const out = []; const ver = (e) => { if (e._text) out.push(e._text); e.kids.forEach(ver); }; ver(el); return out; };
		ok(textos(vista.listEl).some((x) => /todavía no tiene instantáneas/.test(x)), 'sin instantaneas, explica como tomar la primera');
		await plugin.takeSnapshot(canvas, 'primera', { now: T0 });
		escribir(canvas, 'A', 'A cambiado');
		const d = canvas.getData();
		d.nodes.push(k.nodo('NUEVO', 900, 900));
		canvas.importData(d, true);
		await plugin.takeSnapshot(canvas, '', { now: T0 + DIA });
		await vista.refresh();
		const filas = vista.listEl.kids;
		ok(filas.length === 2, 'una fila por instantanea');
		const t1 = textos(filas[0]).join(' | ');
		ok(/10 nodos/.test(t1) && /\+1 −0 ~1 respecto de la anterior/.test(t1), 'cada una dice cuantos nodos tenia y que cambio respecto de la anterior');
		ok(textos(filas[1]).join(' | ').indexOf('primera') > -1, 'con su nombre');
		ok(['Ver', 'Restaurar', 'Renombrar', 'Borrar'].every((b) => t1.indexOf(b) > -1), 'y sus botones');
		const cab = textos(vista.headerEl).join(' | ');
		ok(/Ideas - Café/.test(cab) && /Ahora: 10 nodos/.test(cab) && /sin cambios desde la última/.test(cab), 'arriba: el mapa, cuantos nodos tiene ahora y si cambio desde la ultima');
		ok(cab.indexOf('Tomar instantánea') > -1, 'y el boton para tomar otra');

		// mirando una instantanea, el panel muestra la historia de su canvas
		const ultima = plugin.listSnapshots('Proyectos/Ideas - Café.canvas')[1];
		const snap = new k.FakeCanvas(JSON.parse(plugin.app.vault.files.get(ultima.file.path)), ultima.file.path);
		app.workspace.getActiveViewOfType = () => snap.view;
		await vista.refresh();
		ok(vista.listEl.kids[1].classList.contains('is-open'), 'mirando una instantanea, su fila queda marcada');
		const cab2 = textos(vista.headerEl).join(' | ');
		ok(cab2.indexOf('Abrir el mapa actual') > -1 && /Ahora: 10 nodos/.test(cab2), 'y arriba se ofrece volver al mapa actual');
		ok(textos(vista.listEl).join(' ').indexOf('Restaurar') === -1, 'desde una instantanea no se restaura: eso se hace desde el mapa');
	}

	console.log('\n--- en el canvas');
	{
		const { canvas, plugin } = armar();
		const panel = global.document.createElement('div');
		T.paintToolPanel(plugin, canvas, panel);
		const t = []; const ver = (e) => { if (e.tag === 'button') t.push(e.textContent); e.kids.forEach(ver); }; panel.kids.forEach(ver);
		ok(t.indexOf('Tomar instantánea') > -1 && t.indexOf('Ver historial') > -1, 'la ruedita tiene la seccion Historial');
	}
	k.fin();
})();
