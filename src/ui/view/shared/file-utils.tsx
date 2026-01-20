import React from 'react';
import { FileText, Image, FileType as FileTypeIcon, Folder, Heading, File, Globe, Database } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { SearchResultSource } from '@/service/search/types';

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
 * Get icon for search result source
 */
export function getSourceIcon(source?: SearchResultSource): React.ReactElement {
	switch (source) {
		case 'web':
			return <Globe className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#3b82f6]" />;
		case 'x':
			return <Database className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#8b5cf6]" />;
		case 'local':
		default:
			return <FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />;
	}
}

/**
 * Get icon component for different file types
 * TODO: Need to unify and support more file types https://github.com/material-extensions/vscode-material-icon-theme
 * Places that use it also include messageItem convResourcesModal which don't use this yet, all should use this for unification
 * TODO: Better to use ResourceLoader's type resourceKind etc. for unification
 */
export function getFileIcon(type: string, isSelected: boolean = false): React.ReactElement {
	const iconClass = isSelected
		? "pktw-w-4 pktw-h-4 pktw-text-white"
		: "pktw-w-4 pktw-h-4";

	switch (type) {
		case 'markdown':
			return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-[#7c3aed]")} />;
		case 'pdf':
			return <FileTypeIcon className={cn(iconClass, isSelected ? "" : "pktw-text-red-500")} />;
		case 'image':
			return <Image className={cn(iconClass, isSelected ? "" : "pktw-text-emerald-500")} />;
		case 'folder':
			return <Folder className={cn(iconClass, isSelected ? "" : "pktw-text-amber-500")} />;
		case 'heading':
			return <Heading className={cn(iconClass, isSelected ? "" : "pktw-text-blue-500")} />;
		case 'tag':
			return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-blue-500")} />;
		case 'category':
			return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-purple-500")} />;
		default:
			return <FileText className={cn(iconClass, isSelected ? "" : "pktw-text-[#6c757d]")} />;
	}
}

/**
 * Get file icon component based on file name extension
 */
export function getFileIconByName(fileName: string): typeof Image | typeof FileText {
	const ext = fileName.split('.').pop()?.toLowerCase();
	if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
		return Image;
	}
	return FileText;
}

/**
 * Get file type string based on file name extension
 */
export function getFileTypeByName(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase();
	if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '')) {
		return 'image';
	}
	if (ext === 'pdf') {
		return 'pdf';
	}
	if (['xlsx', 'xls'].includes(ext || '')) {
		return 'excel';
	}
	if (['docx', 'doc'].includes(ext || '')) {
		return 'word';
	}
	return ext || 'file';
}

/**
 * Get file icon component based on file extension
 */
export function getFileIconComponent(extension?: string): typeof File | typeof Image | typeof FileText {
	if (!extension) return File;

	const lowerExt = extension.toLowerCase();
	if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(lowerExt)) {
		return Image;
	}
	if (['md', 'txt', 'json', 'js', 'ts', 'py', 'java', 'cpp', 'c', 'css', 'html', 'xml', 'yaml', 'yml'].includes(lowerExt)) {
		return FileText;
	}
	return File;
}

