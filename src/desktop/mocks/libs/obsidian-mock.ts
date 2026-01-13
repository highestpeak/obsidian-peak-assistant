/**
 * Mock obsidian package for desktop development
 * This file provides type-safe mocks for Obsidian types used in the codebase
 */

// Mock classes that can be used as both types and values
export class TFile {}
export class TFolder {}
export class TAbstractFile {}
export class App {}
export class Plugin {}
export class WorkspaceLeaf {}
export class ItemView {}
export class Modal {}
export class Menu {}
export class Editor {}
export class MarkdownView {}
export class MarkdownFileInfo {}
export class EventRef {}
export class WorkspaceWindow {}
export class Tasks {}
export class Notice {}
export class CachedMetadata {}
export class MenuItem {}

// String types
export type IconName = string;
export type PaneType = string;

/**
 * Normalize a path by converting backslashes to forward slashes,
 * removing duplicate slashes, and trimming trailing slashes (except for root)
 */
export function normalizePath(path: string): string {
	if (!path) return '';

	// Convert backslashes to forward slashes
	let normalized = path.replace(/\\/g, '/');

	// Remove duplicate slashes
	normalized = normalized.replace(/\/+/g, '/');

	// Remove trailing slash (except for root)
	if (normalized.length > 1 && normalized.endsWith('/')) {
		normalized = normalized.slice(0, -1);
	}

	return normalized;
}

/**
 * Convert an object to a YAML string
 * Simple mock implementation for desktop development
 */
export function stringifyYaml(obj: any): string {
	try {
		// Simple YAML serialization - for basic objects only
		if (obj === null || obj === undefined) return '';
		if (typeof obj === 'string') return obj;
		if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);

		if (Array.isArray(obj)) {
			return obj.map(item => `- ${stringifyYaml(item)}`).join('\n');
		}

		if (typeof obj === 'object') {
			return Object.entries(obj)
				.map(([key, value]) => `${key}: ${stringifyYaml(value)}`)
				.join('\n');
		}

		return String(obj);
	} catch (error) {
		console.warn('[obsidian-mock] stringifyYaml failed:', error);
		return '';
	}
}

// Mock classes
export class Component {
	load() {}
	unload() {}
}

export class Plugin_2 extends Component {
	app: any;
	manifest: any;
	settings: any;
	constructor(app: any, manifest: any) {
		super();
		this.app = app;
		this.manifest = manifest;
	}
}

// Re-export mock implementations
export { MockApp } from '../services/MockApp';
