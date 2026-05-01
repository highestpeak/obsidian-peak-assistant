import React from 'react';
import { FileText, Image, FileType as FileTypeIcon, Folder, Heading, File, Globe, Database, FileSpreadsheet } from 'lucide-react';
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
			return <FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />;
	}
}

/**
 * Map path to type string for getFileIcon.
 */
export function pathToFileIconType(path: string | null): string {
	if (!path?.trim()) return 'markdown';
	const ext = path.split('.').pop()?.toLowerCase() || '';
	if (ext === 'md' || ext === 'markdown') return 'markdown';
	if (ext === 'pdf') return 'pdf';
	if (['xlsx', 'xls'].includes(ext)) return 'excel';
	if (['docx', 'doc'].includes(ext)) return 'word';
	const ft = getFileTypeFromPath(path);
	if (ft === 'image') return 'image';
	return 'file';
}

/**
 * Get icon component for different file types
 * TODO: Need to unify and support more file types https://github.com/material-extensions/vscode-material-icon-theme
 * Places that use it also include messageItem convResourcesModal which don't use this yet, all should use this for unification
 * TODO: Better to use ResourceLoader's type resourceKind etc. for unification
 */
export function getFileIcon(type: string, isSelected: boolean = false, className?: string, size: number = 16): React.ReactElement {
	const sizeStyle = { width: size, height: size };
	const iconClass = cn(className, isSelected ? "pktw-text-white" : "");

	switch (type) {
		case 'markdown':
			return <FileText style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-pk-accent")} />;
		case 'pdf':
			return <FileTypeIcon style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-red-500")} />;
		case 'image':
			return <Image style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-emerald-500")} />;
		case 'folder':
			return <Folder style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-amber-500")} />;
		case 'heading':
			return <Heading style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-blue-500")} />;
		case 'tag':
			return <FileText style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-blue-500")} />;
		case 'category':
			return <FileText style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-purple-500")} />;
		case 'excel':
			return <FileSpreadsheet style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-green-600")} />;
		case 'word':
			return <FileText style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-blue-600")} />;
		case 'file':
			return <FileText style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-[#6c757d]")} />;
		default:
			return <FileText style={sizeStyle} className={cn(iconClass, isSelected ? "" : "pktw-text-[#6c757d]")} />;
	}
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

export interface FileIconProps {
	type: string;
	isSelected?: boolean;
	className?: string;
	size?: number;
}

/**
 * Unified FileIcon component — single entry point for all file type icons.
 * Prefer this over calling getFileIcon() directly.
 */
export const FileIcon: React.FC<FileIconProps> = ({
	type, isSelected = false, className, size,
}) => getFileIcon(type, isSelected, className, size);

