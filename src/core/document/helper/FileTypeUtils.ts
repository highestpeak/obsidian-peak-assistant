/**
 * File type utilities for document processing.
 * Centralized location for file type detection, MIME type mapping, and related utilities.
 */

/**
 * Supported image file extensions
 */
export const IMAGE_EXTENSIONS = [
	'png',
	'jpg',
	'jpeg',
	'gif',
	'webp',
	'bmp',
	'svg',
	'heic',
	'heif',
	'ico',
] as const;

/**
 * File type categories
 */
export type FileType = 'image' | 'pdf' | 'file';

/**
 * Determine file type from file path
 */
export function getFileTypeFromPath(path: string): FileType {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	if (ext === 'pdf') {
		return 'pdf';
	}
	if (IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number])) {
		return 'image';
	}
	return 'file';
}

/**
 * Check if a file extension is an image type
 */
export function isImageExtension(extension: string): boolean {
	const ext = extension.toLowerCase();
	return IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number]);
}

/**
 * Get MIME type for image extension
 */
export function getImageMimeType(extension: string): string {
	const ext = extension.toLowerCase();
	const mimeTypes: Record<string, string> = {
		'jpg': 'image/jpeg',
		'jpeg': 'image/jpeg',
		'png': 'image/png',
		'gif': 'image/gif',
		'webp': 'image/webp',
		'bmp': 'image/bmp',
		'svg': 'image/svg+xml',
		'heic': 'image/heic',
		'heif': 'image/heif',
		'ico': 'image/x-icon',
	};
	return mimeTypes[ext] || 'image/jpeg';
}
