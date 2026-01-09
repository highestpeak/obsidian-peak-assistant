/**
 * File type utilities for document processing.
 * Centralized location for file type detection, MIME type mapping, and related utilities.
 */

import type { ResourceKind } from '@/core/document/types';

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
 * Preview file type for UI components
 */
export type PreviewFileType = 'image' | 'markdown' | 'pdf' | 'file';

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

/**
 * Get MIME type for file extension
 * Supports images, PDFs, and common file types
 * todo merge from getImageMimeType
 */
export function getFileMimeType(extension: string): string {
	const ext = extension.toLowerCase();
	const mimeTypes: Record<string, string> = {
		// Images
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

		// Documents
		'pdf': 'application/pdf',
		'txt': 'text/plain',
		'md': 'text/markdown',
		'html': 'text/html',
		'htm': 'text/html',
		'xml': 'application/xml',
		'json': 'application/json',

		// Office documents
		'doc': 'application/msword',
		'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'xls': 'application/vnd.ms-excel',
		'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		'ppt': 'application/vnd.ms-powerpoint',
		'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',

		// Archives
		'zip': 'application/zip',
		'rar': 'application/x-rar-compressed',
		'7z': 'application/x-7z-compressed',
		'tar': 'application/x-tar',
		'gz': 'application/gzip',

		// Audio
		'mp3': 'audio/mpeg',
		'wav': 'audio/wav',
		'ogg': 'audio/ogg',
		'flac': 'audio/flac',

		// Video
		'mp4': 'video/mp4',
		'avi': 'video/x-msvideo',
		'mov': 'video/quicktime',
		'mkv': 'video/x-matroska',
		'webm': 'video/webm',
	};

	return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Check if a source string is a URL (http:// or https://)
 */
export function isUrl(source: string): boolean {
	return source.startsWith('http://') || source.startsWith('https://');
}

/**
 * Extract file extension from URL or file path
 */
export function getExtensionFromSource(source: string): string {
	const urlWithoutQuery = source.split('?')[0];
	const ext = urlWithoutQuery.split('.').pop()?.toLowerCase() || '';
	return ext;
}

/**
 * Detect preview file type from file path
 * Returns 'image', 'markdown', 'pdf', or 'file' based on file extension
 */
export function detectPreviewFileType(filePath: string): PreviewFileType {
	const ext = getExtensionFromSource(filePath);
	if (IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number])) {
		return 'image';
	}
	if (ext === 'md') {
		return 'markdown';
	}
	if (ext === 'pdf') {
		return 'pdf';
	}
	return 'file';
}

/**
 * Get file name and extension for display
 * @param filePath - File path or URL
 * @param maxLength - Maximum length for file name (default: 20)
 * @returns Formatted display name (e.g., "PDF - filename...")
 */
export function getFileDisplayName(filePath: string, maxLength: number = 20): string {
	const fileName = filePath.split('/').pop() || filePath;
	const parts = fileName.split('.');
	if (parts.length < 2) {
		return fileName.length > maxLength ? fileName.substring(0, maxLength) + '...' : fileName;
	}
	const extension = parts.pop() || '';
	const nameWithoutExt = parts.join('.');
	const truncatedName = nameWithoutExt.length > maxLength ? nameWithoutExt.substring(0, maxLength) + '...' : nameWithoutExt;
	return `${extension.toUpperCase()} - ${truncatedName}`;
}

/**
 * Convert ResourceKind to FileType
 * Uses resource.kind if available, otherwise falls back to path-based detection
 * @param kind - ResourceKind from ChatResourceRef
 * @param sourcePath - Source path for fallback detection
 * @returns FileType ('image', 'pdf', or 'file')
 */
export function getFileTypeFromResourceKind(kind: ResourceKind | undefined, sourcePath: string): FileType {
	if (kind === 'image') {
		return 'image';
	}
	if (kind === 'pdf') {
		return 'pdf';
	}
	// Fallback to path-based detection
	return getFileTypeFromPath(sourcePath);
}
