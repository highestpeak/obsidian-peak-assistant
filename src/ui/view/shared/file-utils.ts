/**
 * File type utilities
 */
export type FileType = 'image' | 'pdf' | 'file';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif', 'ico'];

/**
 * Determine file type from file extension
 */
export function getFileType(file: File): FileType {
	const ext = file.name.split('.').pop()?.toLowerCase() || '';
	if (ext === 'pdf') {
		return 'pdf';
	}
	if (IMAGE_EXTENSIONS.includes(ext)) {
		return 'image';
	}
	return 'file';
}

/**
 * Determine file type from path
 */
export function getFileTypeFromPath(path: string): FileType {
	const ext = path.split('.').pop()?.toLowerCase() || '';
	if (ext === 'pdf') {
		return 'pdf';
	}
	if (IMAGE_EXTENSIONS.includes(ext)) {
		return 'image';
	}
	return 'file';
}

/**
 * Get attachment statistics
 */
export function getAttachmentStats(attachments: string[]): { pdf: number; image: number; file: number } {
	const stats = { pdf: 0, image: 0, file: 0 };
	for (const attachment of attachments) {
		const type = getFileTypeFromPath(attachment);
		stats[type]++;
	}
	return stats;
}

