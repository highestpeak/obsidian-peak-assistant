const fs = require('node:fs/promises');

const REACT_REDUX_ESM_ENTRY = /node_modules[\\/]react-redux[\\/]dist[\\/]react-redux\.mjs$/;
const CONTEXT_MAP_INITIALIZER = /const contextMap = gT\[ContextKey\] \?\?= \/\* @__PURE__ \*\/ new Map\(\);/g;
const GET_CONTEXT_DECLARATION = /function getContext\(\) \{/g;

/**
 * React Redux normally stores one Context per React.createContext function in
 * globalThis[Symbol.for('react-redux-context')]. Peak bundles React, so every
 * plugin reload creates a distinct function key. The renderer-global Map then
 * retains every historical bundle generation.
 *
 * React Redux is bundled exactly once in Peak. A module-local Map preserves
 * its within-generation singleton contract without publishing bundle-owned
 * functions to the long-lived Obsidian renderer global.
 */
function patchReactReduxContextRegistry(source) {
	const initializerMatches = source.match(CONTEXT_MAP_INITIALIZER) ?? [];
	const declarationMatches = source.match(GET_CONTEXT_DECLARATION) ?? [];
	if (initializerMatches.length !== 1 || declarationMatches.length !== 1) {
		throw new Error(
			'react-redux context registry pattern not found exactly once ' +
			`(initializer=${initializerMatches.length}, declaration=${declarationMatches.length})`,
		);
	}
	return source.replace(
		GET_CONTEXT_DECLARATION,
		'const peakBundleContextMap = /* @__PURE__ */ new Map();\nfunction getContext() {',
	).replace(
		CONTEXT_MAP_INITIALIZER,
		'const contextMap = peakBundleContextMap;',
	);
}

const reactReduxLocalContextPlugin = {
	name: 'react-redux-local-context',
	setup(build) {
		build.onLoad({ filter: REACT_REDUX_ESM_ENTRY }, async (args) => ({
			contents: patchReactReduxContextRegistry(await fs.readFile(args.path, 'utf8')),
			loader: 'js',
		}));
	},
};

module.exports = {
	patchReactReduxContextRegistry,
	reactReduxLocalContextPlugin,
};
