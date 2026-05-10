'use strict';

/**
 * Comprehensive `obsidian` shim for esbuild test bundles in Node.
 * Provides mocks for Vault, Workspace, MetadataCache, and other Obsidian APIs
 * used by the plugin during testing.
 */

function normalizePath(p) {
	return String(p ?? '')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/\/$/, '');
}

class TAbstractFile {
	constructor() {
		this.vault = null;
		this.path = '';
		this.name = '';
		this.parent = null;
	}
}

class TFile extends TAbstractFile {
	constructor() {
		super();
		this.extension = 'md';
		this.stat = { ctime: Date.now(), mtime: Date.now(), size: 0 };
		this.basename = '';
	}
}

class TFolder extends TAbstractFile {
	constructor() {
		super();
		this.children = [];
		this.isRoot = () => this.path === '' || this.path === '/';
	}
}

class Notice {
	constructor(message, timeout) {
		this.message = message;
		// No-op in test environment
	}
	hide() {}
}

// Platform mock
const Platform = {
	isMobile: false,
	isDesktop: true,
	isMacOS: process.platform === 'darwin',
	isWin: process.platform === 'win32',
	isLinux: process.platform === 'linux',
};

/**
 * Create a mock Vault instance with in-memory file storage.
 * Supports: getMarkdownFiles, getAbstractFileByPath, cachedRead, read, create, modify, trash, openLinkText
 */
function createMockVault(files = {}) {
	// files: Record<string, { content: string; stat?: { ctime, mtime, size } }>
	const storage = new Map();
	for (const [path, data] of Object.entries(files)) {
		const content = typeof data === 'string' ? data : data.content;
		const stat = typeof data === 'string'
			? { ctime: Date.now(), mtime: Date.now(), size: content.length }
			: (data.stat || { ctime: Date.now(), mtime: Date.now(), size: content.length });
		const basename = path.split('/').pop().replace(/\.md$/, '');
		const extension = path.split('.').pop() || 'md';
		const parentPath = path.split('/').slice(0, -1).join('/') || '/';
		storage.set(path, {
			path,
			basename,
			extension,
			name: path.split('/').pop(),
			stat,
			content,
			parent: { path: parentPath, children: [] },
		});
	}

	return {
		getMarkdownFiles() {
			return Array.from(storage.values())
				.filter(f => f.extension === 'md')
				.map(f => ({
					path: f.path,
					basename: f.basename,
					extension: f.extension,
					name: f.name,
					stat: f.stat,
					parent: f.parent,
				}));
		},

		getAbstractFileByPath(path) {
			const entry = storage.get(path);
			if (!entry) return null;
			return {
				path: entry.path,
				basename: entry.basename,
				extension: entry.extension,
				name: entry.name,
				stat: entry.stat,
				parent: entry.parent,
			};
		},

		async cachedRead(file) {
			const entry = storage.get(file.path);
			return entry ? entry.content : '';
		},

		async read(file) {
			const filePath = typeof file === 'string' ? file : file.path;
			const entry = storage.get(filePath);
			return entry ? entry.content : '';
		},

		async create(path, content) {
			const basename = path.split('/').pop().replace(/\.md$/, '');
			const extension = path.split('.').pop() || 'md';
			const parentPath = path.split('/').slice(0, -1).join('/') || '/';
			const stat = { ctime: Date.now(), mtime: Date.now(), size: (content || '').length };
			const entry = {
				path,
				basename,
				extension,
				name: path.split('/').pop(),
				stat,
				content: content || '',
				parent: { path: parentPath, children: [] },
			};
			storage.set(path, entry);
			return { path, basename, extension, name: entry.name, stat, parent: entry.parent };
		},

		async modify(file, content) {
			const filePath = typeof file === 'string' ? file : file.path;
			const entry = storage.get(filePath);
			if (entry) {
				entry.content = content;
				entry.stat.mtime = Date.now();
				entry.stat.size = content.length;
			} else {
				throw new Error(`File not found: ${filePath}`);
			}
		},

		async trash(file, system) {
			const filePath = typeof file === 'string' ? file : file.path;
			storage.delete(filePath);
		},

		async delete(file) {
			const filePath = typeof file === 'string' ? file : file.path;
			storage.delete(filePath);
		},

		// Internal: access raw storage for testing
		_storage: storage,
	};
}

/**
 * Create a mock Workspace instance.
 * Supports: getLeaf, openLinkText, getActiveFile
 */
function createMockWorkspace(vault) {
	let activeFile = null;
	const openedFiles = [];

	const mockLeaf = {
		view: {
			editor: {
				setCursor: () => {},
				scrollIntoView: () => {},
				getValue: () => '',
				setValue: () => {},
			},
			file: null,
		},
		async openFile(file) {
			this.view.file = file;
			activeFile = file;
			openedFiles.push(file.path || file);
		},
	};

	return {
		getLeaf(newPane) {
			return mockLeaf;
		},

		async openLinkText(linkText, sourcePath, newLeaf) {
			// Resolve the link to a file path
			const resolvedPath = linkText.endsWith('.md') ? linkText : `${linkText}.md`;
			const file = vault ? vault.getAbstractFileByPath(resolvedPath) : null;
			if (file) {
				activeFile = file;
				openedFiles.push(resolvedPath);
			}
			return file;
		},

		getActiveFile() {
			return activeFile;
		},

		// Test helper: retrieve opened file history
		_openedFiles: openedFiles,
		_setActiveFile(file) { activeFile = file; },
	};
}

/**
 * Create a mock MetadataCache instance.
 * Supports: getFileCache (with frontmatter), getFirstLinkpathDest, resolvedLinks
 */
function createMockMetadataCache(fileCaches = {}, resolvedLinks = {}) {
	// fileCaches: Record<path, CachedMetadata>
	// CachedMetadata: { frontmatter?, links?, tags?, headings?, embeds? }
	return {
		getFileCache(file) {
			const path = typeof file === 'string' ? file : file.path;
			const cache = fileCaches[path];
			if (!cache) return null;
			return {
				frontmatter: cache.frontmatter || null,
				links: cache.links || [],
				tags: cache.tags || [],
				headings: cache.headings || [],
				embeds: cache.embeds || [],
				frontmatterLinks: cache.frontmatterLinks || [],
				sections: cache.sections || [],
			};
		},

		getFirstLinkpathDest(link, sourcePath) {
			// Simple resolution: try exact match, then add .md
			const candidates = [link, `${link}.md`];
			for (const candidate of candidates) {
				if (fileCaches[candidate] !== undefined) {
					return { path: candidate };
				}
			}
			// Check in resolvedLinks
			if (resolvedLinks[sourcePath] && resolvedLinks[sourcePath][link]) {
				return { path: resolvedLinks[sourcePath][link] };
			}
			return null;
		},

		resolvedLinks: resolvedLinks,

		// Mutation methods for testing
		_fileCaches: fileCaches,
		_setFileCache(path, cache) {
			fileCaches[path] = cache;
		},
	};
}

/**
 * Create a complete mock App instance combining vault, workspace, and metadataCache.
 */
function createMockApp(options = {}) {
	const files = options.files || {};
	const fileCaches = options.fileCaches || {};
	const resolvedLinks = options.resolvedLinks || {};

	const vault = createMockVault(files);
	const workspace = createMockWorkspace(vault);
	const metadataCache = createMockMetadataCache(fileCaches, resolvedLinks);

	return {
		vault,
		workspace,
		metadataCache,
	};
}

module.exports = {
	normalizePath,
	TAbstractFile,
	TFile,
	TFolder,
	Notice,
	Platform,
	createMockVault,
	createMockWorkspace,
	createMockMetadataCache,
	createMockApp,
};
