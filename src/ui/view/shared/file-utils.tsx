import React from 'react';
import {
	FileText, Image, FileType as FileTypeIcon, Folder, Heading, File, Globe,
	Database, FileSpreadsheet, FileCode, FileJson, FileArchive, FileAudio,
	FileVideo, Presentation, Hash, BookOpen,
} from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { SearchResultSource } from '@/core/search/searchTypes';

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
			return <Globe className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-info" />;
		case 'x':
			return <Database className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />;
		case 'local':
		default:
			return <FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-accent" />;
	}
}

/**
 * Extension-to-icon-type mapping. Covers common file types for knowledge bases.
 */
const EXTENSION_TYPE_MAP: Record<string, string> = {
	// Markdown / text
	md: 'markdown', markdown: 'markdown', txt: 'text',
	// PDF
	pdf: 'pdf',
	// Office / spreadsheet
	xlsx: 'excel', xls: 'excel', csv: 'excel',
	docx: 'word', doc: 'word', rtf: 'word',
	pptx: 'presentation', ppt: 'presentation',
	// Images
	png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
	webp: 'image', bmp: 'image', svg: 'image',
	heic: 'image', heif: 'image', ico: 'image',
	// Code
	ts: 'code', tsx: 'code', js: 'code', jsx: 'code',
	py: 'code', rb: 'code', go: 'code', rs: 'code',
	java: 'code', c: 'code', cpp: 'code', h: 'code',
	css: 'code', scss: 'code', html: 'code', xml: 'code',
	sh: 'code', bash: 'code', zsh: 'code',
	// Data / config
	json: 'json', yaml: 'json', yml: 'json', toml: 'json',
	// Archive
	zip: 'archive', tar: 'archive', gz: 'archive', '7z': 'archive', rar: 'archive',
	// Audio
	mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio',
	// Video
	mp4: 'video', mkv: 'video', avi: 'video', mov: 'video', webm: 'video',
};

/**
 * Map path to type string for getFileIcon.
 */
export function pathToFileIconType(path: string | null): string {
	if (!path?.trim()) return 'markdown';
	const last = path.split('/').pop() ?? path;
	if (!last.includes('.')) return 'markdown';
	const ext = last.split('.').pop()?.toLowerCase() || '';
	return EXTENSION_TYPE_MAP[ext] || 'file';
}

/**
 * Icon registry: maps type string to { icon, colorClass }.
 * Colors use theme-aware CSS variable classes where possible.
 */
const ICON_REGISTRY: Record<string, { icon: React.ElementType; colorClass: string }> = {
	markdown:      { icon: FileText, colorClass: 'pktw-text-pk-accent' },
	text:          { icon: FileText, colorClass: 'pktw-text-pk-foreground-muted' },
	pdf:           { icon: FileTypeIcon, colorClass: 'pktw-text-pk-error' },
	image:         { icon: Image, colorClass: 'pktw-text-pk-success' },
	folder:        { icon: Folder, colorClass: 'pktw-text-pk-warning' },
	heading:       { icon: Heading, colorClass: 'pktw-text-pk-info' },
	tag:           { icon: Hash, colorClass: 'pktw-text-pk-info' },
	category:      { icon: BookOpen, colorClass: 'pktw-text-pk-accent' },
	excel:         { icon: FileSpreadsheet, colorClass: 'pktw-text-pk-success' },
	word:          { icon: FileText, colorClass: 'pktw-text-pk-info' },
	presentation:  { icon: Presentation, colorClass: 'pktw-text-pk-warning' },
	code:          { icon: FileCode, colorClass: 'pktw-text-pk-foreground-muted' },
	json:          { icon: FileJson, colorClass: 'pktw-text-pk-warning' },
	archive:       { icon: FileArchive, colorClass: 'pktw-text-pk-text-secondary' },
	audio:         { icon: FileAudio, colorClass: 'pktw-text-pk-info' },
	video:         { icon: FileVideo, colorClass: 'pktw-text-pk-accent' },
	file:          { icon: File, colorClass: 'pktw-text-pk-text-secondary' },
};

const DEFAULT_ICON_ENTRY = ICON_REGISTRY['file'];

/**
 * Get icon component for different file types.
 * Prefer using <FileIcon /> component directly.
 */
export function getFileIcon(type: string, isSelected: boolean = false, className?: string, size: number = 16): React.ReactElement {
	const sizeStyle = { width: size, height: size };
	const entry = ICON_REGISTRY[type] || DEFAULT_ICON_ENTRY;
	const Icon = entry.icon;
	const colorClass = isSelected ? 'pktw-text-pk-text-inverted' : entry.colorClass;
	return <Icon style={sizeStyle} className={cn(className, colorClass)} />;
}

/**
 * Get file type string based on file name extension
 */
export function getFileTypeByName(fileName: string): string {
	const ext = fileName.split('.').pop()?.toLowerCase() || '';
	return EXTENSION_TYPE_MAP[ext] || ext || 'file';
}

export interface FileIconProps {
	/** Icon type key (e.g. 'markdown', 'pdf', 'image', 'code'). Use pathToFileIconType() to derive from a file path. */
	type: string;
	/** When true, renders in inverted color (for selected state backgrounds). */
	isSelected?: boolean;
	/** Additional Tailwind classes. */
	className?: string;
	/** Icon size in px. Default 16. */
	size?: number;
}

/**
 * Unified FileIcon component — single entry point for all file type icons.
 *
 * Maps file types to Lucide icons with theme-aware colors:
 * - markdown -> FileText (accent)
 * - pdf -> FileType (error/red)
 * - image -> Image (success/green)
 * - folder -> Folder (warning/amber)
 * - code -> FileCode (muted)
 * - excel -> FileSpreadsheet (green)
 * - json -> FileJson (warning)
 * - archive -> FileArchive (secondary)
 * - audio -> FileAudio (info/blue)
 * - video -> FileVideo (accent)
 * - presentation -> Presentation (warning)
 * - word -> FileText (info/blue)
 *
 * Usage:
 *   <FileIcon type={pathToFileIconType(filePath)} size={20} />
 */
export const FileIcon: React.FC<FileIconProps> = ({
	type, isSelected = false, className, size = 16,
}) => getFileIcon(type, isSelected, className, size);
