import * as fs from 'fs';
import * as path from 'path';
import type { TemplateContentProvider } from '@/core/template/TemplateManager';

/**
 * Loads template files from a base directory (e.g. plugin manifest dir).
 * Uses Node fs; suitable for desktop. For mobile or no-fs env, use a vault-based provider.
 */
export function createPluginDirContentProvider(getBasePath: () => string): TemplateContentProvider {
	return {
		async load(relativePath: string): Promise<string> {
			const base = getBasePath();
			const fullPath = path.join(base, relativePath);
			return fs.promises.readFile(fullPath, 'utf-8');
		},
	};
}
