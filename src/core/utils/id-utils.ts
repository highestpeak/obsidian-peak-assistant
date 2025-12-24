import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a UUID without hyphens.
 * @returns A UUID string without hyphens (e.g., "5678475e44724cb2a898c6b7046b9e1b")
 */
export function generateUuidWithoutHyphens(): string {
	// Dynamic import to avoid circular dependencies
	return uuidv4().replace(/-/g, '');
}

