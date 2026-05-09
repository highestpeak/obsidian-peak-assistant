import * as fs from 'fs';
import * as path from 'path';
import type { TemplateContentProvider } from '@/core/template/TemplateManager';

/**
 * Loads template files from a base directory (e.g. plugin manifest dir).
 * Uses Node fs; suitable for desktop. For mobile or no-fs env, use a vault-based provider.
 * @param basePath - Absolute path to plugin dir (no closure; pass resolved path at init).
 */
export function createPluginDirContentProvider(basePath: string): TemplateContentProvider {
	return {
		async load(relativePath: string): Promise<string> {
			const fullPath = path.join(basePath, relativePath);
			return fs.promises.readFile(fullPath, 'utf-8');
		},
	};
}
