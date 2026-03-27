'use strict';

/**
 * Minimal `obsidian` shim for esbuild test bundles in Node (real package is not installed).
 */

function normalizePath(p) {
	return String(p ?? '')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/\/$/, '');
}

class TAbstractFile {}

class TFile extends TAbstractFile {
	constructor() {
		super();
		this.extension = 'md';
	}
}

class TFolder extends TAbstractFile {
	constructor() {
		super();
		this.children = [];
	}
}

module.exports = { normalizePath, TAbstractFile, TFile, TFolder };
