'use strict';

/*
 * Loads src/main.js for the tests.
 *
 * The plugin is plain CommonJS that requires the `obsidian` module, which only
 * exists inside the app, so that request is redirected to a small stub. The
 * source keeps its internals private; the tests need them, so a footer that
 * exposes the listed names is appended before compiling. Nothing here ships.
 */

const Module = require('module');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', '..', 'src', 'main.js');
const STUB = path.join(__dirname, 'obsidian-stub.js');

const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
	if (request === 'obsidian') return STUB;
	return resolve.call(this, request, ...rest);
};

const EXPOSED = [
	'DEFAULT_SETTINGS', 'LOCALE', 'LOCALES', 't', 'buildGraph', 'computeLayout', 'runLayout', 'collapseInData', 'expandInData',
	'subtreeOf', 'outlineTree', 'flattenCanvasData', 'flattenWithHome', 'findNodeData', 'OutlineView', 'nodeLabel', 'plainText',
	'applyCanvasData', 'renewRetargetedEdges', 'flushLayout', 'exportModel', 'toFreeMind', 'toOpml', 'toMarkdown', 'xmlAttr',
	'EXPORT_FORMATS', 'EXPORT_MARK', 'paintToolPanel', 'THEMES', 'BACKGROUNDS', 'DIRECTIONS', 'DIR_SHORT', 'ALIGN_MODES',
	'ALIGN_LABEL', 'COLLAPSED_KEY', 'PAYLOAD_KEY', 'LINK_KEY', 'FONT_KEY', 'MindmapSettingTab', 'syncDecorations', 'BranchDrag',
	'branchSides', 'applyFontScale', 'applyFontToFrames', 'nodeFontPx', 'baseFontSize', 'FONT_LEVEL', 'chip', 'payloadHolding', 'hasMedia',
	'stampLinks', 'linkSignature', 'assignParents', 'getCanvas', 'setLocale', 'lazyLabels', 'CANVAS_COLORS', 'ARROW_PRESETS',
	'edgeSidesFor', 'fitEdgesLive', 'smoothBezier', 'smoothEdge', 'installCurvePatch', 'removeCurvePatch', 'SnapshotsView',
	'parseSnapshotName', 'snapshotStamp', 'snapshotIndex', 'snapshotDiff', 'sameMap', 'snapshotDue', 'cleanSnapshotLabel', 'SNAPSHOTS_VIEW',
];

const FOOTER = `
;module.exports.__test = (function () {
	const out = {};
	for (const name of ${JSON.stringify(EXPOSED)}) {
		try { out[name] = eval(name); } catch (e) { out[name] = undefined; }
	}
	return out;
})();
`;

function loadPlugin() {
	const mod = new Module(SRC, module);
	mod.filename = SRC;
	mod.paths = Module._nodeModulePaths(path.dirname(SRC));
	mod._compile(fs.readFileSync(SRC, 'utf8') + FOOTER, SRC);
	return mod.exports;
}

module.exports = { loadPlugin, SRC };
