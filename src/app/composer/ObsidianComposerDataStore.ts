import type { App } from 'obsidian';

export function joinAdapterPath(...segments: Array<string | undefined>): string {
	return segments
		.filter((segment): segment is string => Boolean(segment))
		.join('/')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
}

export async function ensureAdapterDirectory(app: App, directory: string): Promise<void> {
	const segments = joinAdapterPath(directory).split('/').filter(Boolean);
	let current = '';
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (await app.vault.adapter.exists(current)) continue;
		try {
			await app.vault.adapter.mkdir(current);
		} catch (error) {
			// Two lazy persistence calls may create the same DataStore path.
			if (!(await app.vault.adapter.exists(current))) throw error;
		}
	}
}

/**
 * Preserve an old plugin-directory record by copying it to the canonical
 * DataStore location. The legacy source is intentionally retained: cleanup is
 * a separate owner-visible operation after the copied bytes are verified.
 */
export async function copyLegacyFileIfNeeded(
	app: App,
	legacyPath: string | undefined,
	targetPath: string,
): Promise<boolean> {
	if (!legacyPath || joinAdapterPath(legacyPath) === joinAdapterPath(targetPath)) return false;
	if (await app.vault.adapter.exists(targetPath)) return false;
	if (!(await app.vault.adapter.exists(legacyPath))) return false;
	const targetDirectory = targetPath.slice(0, Math.max(0, targetPath.lastIndexOf('/')));
	if (targetDirectory) await ensureAdapterDirectory(app, targetDirectory);
	const source = await app.vault.adapter.read(legacyPath);
	const migrationPath = `${targetPath}.migration`;
	await app.vault.adapter.write(migrationPath, source);
	const copied = await app.vault.adapter.read(migrationPath);
	if (copied !== source) throw new Error(`Composer data migration verification failed: ${targetPath}`);
	await app.vault.adapter.rename(migrationPath, targetPath);
	return true;
}
