import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID without hyphens.
 * @returns A UUID string without hyphens (e.g., "5678475e44724cb2a898c6b7046b9e1b")
 */
export function generateUuidWithoutHyphens(): string {
	// Dynamic import to avoid circular dependencies
	return uuidv4().replace(/-/g, '');
}

/**
 * Build a timestamped name with prefix and suffix.
 * Format: {prefix}-{name}-{timestamp}-{suffix}
 * @param prefix - Prefix for the name (e.g., "Project")
 * @param name - Base name
 * @param timestamp - Timestamp in milliseconds
 * @param suffix - Suffix (usually an ID)
 * @returns Formatted name string
 */
export function buildTimestampedName(prefix: string, name: string, timestamp: number, suffix: string): string {
	// Sanitize name: remove invalid characters for folder names
	const sanitizedName = name.replace(/[<>:"/\\|?*]/g, '_').trim();
	return `${prefix}-${sanitizedName}-${timestamp}-${suffix}`;
}
