import React from 'react';
import { FileText, Image, FileType as FileTypeIcon, Folder, Heading } from 'lucide-react';

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

/**
 * Get icon component for different file types
 */
export function getFileIcon(type: string): React.ReactElement {
	switch (type) {
		case 'markdown':
			return <FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />;
		case 'pdf':
			return <FileTypeIcon className="pktw-w-4 pktw-h-4 pktw-text-red-500" />;
		case 'image':
			return <Image className="pktw-w-4 pktw-h-4 pktw-text-emerald-500" />;
		case 'folder':
			return <Folder className="pktw-w-4 pktw-h-4 pktw-text-amber-500" />;
		case 'heading':
			return <Heading className="pktw-w-4 pktw-h-4 pktw-text-blue-500" />;
		default:
			return <FileText className="pktw-w-4 pktw-h-4 pktw-text-[#6c757d]" />;
	}
}

