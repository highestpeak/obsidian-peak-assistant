import { App, normalizePath, TAbstractFile, TFolder } from 'obsidian';

/**
 * Convert a string into a "slug" — a simplified, URL- and filename-safe version of the text,
 * containing only lowercase letters, numbers, and hyphens. Slugs are often used in URLs or as filenames
 * to avoid spaces and special characters.
 * 
 * Example: "Hello World!" => "hello-world"
 * 
 * @param text The input string to slugify.
 * @returns The slugified version of the string.
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9\-]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
}

/**
 * Ensures that a folder exists at the specified path.
 * If the folder does not exist, it is created.
 * @param app The Obsidian app instance.
 * @param folderPath The path to the folder to ensure.
 * @returns The TFolder object representing the folder.
 */
export async function ensureFolder(app: App, folderPath: string): Promise<TFolder> {
	const normalized = normalizePath(folderPath);
	const existing = app.vault.getAbstractFileByPath(normalized);
	if (existing instanceof TFolder) {
		return existing;
	}

	await app.vault.createFolder(normalized);
	const created = app.vault.getAbstractFileByPath(normalized);
	if (created instanceof TFolder) {
		return created;
	}
	throw new Error(`Unable to create or access folder: ${normalized}`);
}

/**
 * Build a name with timestamp, prefix, and slugified title.
 * For example: buildTimestampedName('project', 'Test Project', 1717850450401)
 * Result: project-20240608-164050-test-project
 * @param prefix The prefix string
 * @param title The title
 * @param timestamp The timestamp in milliseconds
 * @returns A name string with timestamp and slug
 */
export function buildTimestampedName(prefix: string, title: string, timestamp: number): string {
	const date = new Date(timestamp);
	const formatted = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
	const slug = slugify(title);
	return `${prefix}-${formatted}${slug ? '-' + slug : ''}`;
}

/**
 * Pads a number with a leading zero if it is less than 10, converting it to a two-digit string.
 * For example, 3 becomes "03", 12 stays "12".
 * @param value - The number to pad.
 * @returns The padded string.
 */
function pad(value: number): string {
	return value < 10 ? `0${value}` : `${value}`;
}

export function isTFolder(file: TAbstractFile | null | undefined): file is TFolder {
	return !!file && file instanceof TFolder;
}

/**
 * Generate a UUID without hyphens.
 * @returns A UUID string without hyphens (e.g., "5678475e44724cb2a898c6b7046b9e1b")
 */
export function generateUuidWithoutHyphens(): string {
	// Dynamic import to avoid circular dependencies
	const { v4: uuid } = require('uuid');
	return uuid().replace(/-/g, '');
}

