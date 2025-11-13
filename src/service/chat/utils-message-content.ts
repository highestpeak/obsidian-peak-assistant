import { App, normalizePath, TFile } from 'obsidian';
import { Buffer } from 'buffer';
import { ChatMessage } from './types';
import { ProviderContentPart } from './providers/types';

const TEXT_ATTACHMENT_MAX_CHARACTERS = 8000;
const BASE64_ATTACHMENT_MAX_LENGTH = 8000;
const PDF_MAX_PAGES = 8;
const PDF_MAX_CHARACTERS = 20000;

const TEXT_FILE_EXTENSIONS = new Set([
	'md',
	'markdown',
	'txt',
	'csv',
	'json',
	'jsonc',
	'yaml',
	'yml',
	'xml',
	'html',
	'css',
	'scss',
	'less',
	'js',
	'jsx',
	'ts',
	'tsx',
	'cjs',
	'mjs',
	'py',
	'java',
	'kt',
	'kts',
	'cs',
	'cpp',
	'cc',
	'c',
	'h',
	'hpp',
	'rs',
	'go',
	'swift',
	'rb',
	'php',
	'sql',
	'ini',
	'cfg',
	'conf',
	'log',
]);

const PDF_FILE_EXTENSIONS = new Set(['pdf']);

const IMAGE_FILE_EXTENSIONS = new Set([
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
]);

const MIME_TYPE_BY_EXTENSION = new Map<string, string>([
	['png', 'image/png'],
	['jpg', 'image/jpeg'],
	['jpeg', 'image/jpeg'],
	['gif', 'image/gif'],
	['webp', 'image/webp'],
	['bmp', 'image/bmp'],
	['svg', 'image/svg+xml'],
	['heic', 'image/heic'],
	['heif', 'image/heif'],
	['ico', 'image/x-icon'],
	['pdf', 'application/pdf'],
	['json', 'application/json'],
	['yaml', 'application/yaml'],
	['yml', 'application/yaml'],
	['xml', 'application/xml'],
	['csv', 'text/csv'],
	['txt', 'text/plain'],
]);

type PdfJsModule = any;

let cachedPdfModule: PdfJsModule | null = null;

async function ensurePdfJs(): Promise<PdfJsModule> {
	if (!cachedPdfModule) {
		cachedPdfModule = (await import('pdfjs-dist')) as PdfJsModule;
		try {
			if (cachedPdfModule.GlobalWorkerOptions) {
				cachedPdfModule.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.js';
			}
		} catch (error) {
			console.warn('Failed to configure pdfjs worker', error);
		}
	}
	return cachedPdfModule;
}

/**
 * Composes message content and attachments into provider content parts.
 */
export class MessageContentComposer {
	constructor(private readonly app: App) {}

	async composeContentParts(message: ChatMessage): Promise<ProviderContentPart[]> {
		const parts: ProviderContentPart[] = [];
		const trimmed = message.content?.trim();
		if (trimmed) {
			parts.push({ type: 'text', text: trimmed });
		}
		if (!message.attachments || message.attachments.length === 0) {
			return parts;
		}
		const attachmentParts = await this.createAttachmentParts(message.attachments);
		parts.push(...attachmentParts);
		return parts;
	}

	private async createAttachmentParts(attachments: string[]): Promise<ProviderContentPart[]> {
		const parts: ProviderContentPart[] = [];
		for (const raw of attachments) {
			const prepared = await this.prepareAttachmentPart(raw);
			if (prepared && prepared.length > 0) {
				parts.push(...prepared);
			}
		}
		return parts;
	}

	private async prepareAttachmentPart(rawAttachment: string): Promise<ProviderContentPart[] | null> {
		if (!rawAttachment) {
			return null;
		}
		const trimmed = rawAttachment.trim();
		if (!trimmed) {
			return null;
		}
		if (/^https?:\/\//i.test(trimmed)) {
			const ext = this.extractExtension(trimmed);
			if (this.isImageFile(ext)) {
				return [
					{
						type: 'image_url',
						url: trimmed,
						alt: `Image attachment (${this.extractFileNameFromPath(trimmed)})`,
					},
				];
			}
			return [
				{
					type: 'text',
					text: `[Attachment Link] ${trimmed}`,
				},
			];
		}

		const normalized = normalizePath(trimmed);
		const file = this.app.vault.getAbstractFileByPath(normalized);
		if (!(file instanceof TFile)) {
			return [
				{
					type: 'text',
					text: `[Attachment: ${normalized}] (file not found)`,
				},
			];
		}

		const displayName = file.name;
		const extension = file.extension.toLowerCase();

		if (this.isPdfFile(extension)) {
			const pdfText = await this.extractPdfText(file);
			if (pdfText) {
				return [
					{
						type: 'document',
						name: displayName,
						text: pdfText,
					},
				];
			}
			return [
				{
					type: 'text',
					text: `[Attachment: ${displayName}] (failed to extract PDF text)`,
				},
			];
		}

		if (this.isTextFile(extension)) {
			const text = await this.readTextAttachment(file);
			if (text) {
				return [
					{
						type: 'document',
						name: displayName,
						text,
					},
				];
			}
			return [
				{
					type: 'text',
					text: `[Attachment: ${displayName}] (file is empty or unreadable)`,
				},
			];
		}

		if (this.isImageFile(extension)) {
			try {
				const base64 = await this.readBinaryAsBase64(file);
				const limited = this.truncateBase64(base64);
				return [
					{
						type: 'inline_image',
						mediaType: this.resolveMimeType(extension),
						data: limited,
						alt: displayName,
					},
				];
			} catch (error) {
				console.warn(`Failed to read image attachment: ${normalized}`, error);
				return [
					{
						type: 'text',
						text: `[Attachment: ${displayName}] (failed to read image content)`,
					},
				];
			}
		}

		return [
			{
				type: 'text',
				text: `[Attachment: ${displayName}] (unsupported attachment type)`,
			},
		];
	}

	private extractExtension(path: string): string {
		const segments = path.split('.');
		return segments.length > 1 ? segments.pop()!.toLowerCase() : '';
	}

	private extractFileNameFromPath(path: string): string {
		const segments = path.split('/');
		return segments[segments.length - 1] ?? path;
	}

	private async readTextAttachment(file: TFile): Promise<string | null> {
		try {
			const content = await this.app.vault.read(file);
			const trimmed = content.trim();
			if (!trimmed) {
				return null;
			}
			return this.truncateText(trimmed);
		} catch (error) {
			console.warn(`Failed to read text attachment: ${file.path}`, error);
			return null;
		}
	}

	private async readBinaryAsBase64(file: TFile): Promise<string> {
		const arrayBuffer = await this.app.vault.readBinary(file);
		return Buffer.from(arrayBuffer).toString('base64');
	}

	private truncateText(content: string): string {
		if (content.length <= TEXT_ATTACHMENT_MAX_CHARACTERS) {
			return content;
		}
		return `${content.slice(0, TEXT_ATTACHMENT_MAX_CHARACTERS)}\n...[truncated ${content.length - TEXT_ATTACHMENT_MAX_CHARACTERS} characters]`;
	}

	private truncateBase64(base64: string): string {
		if (base64.length <= BASE64_ATTACHMENT_MAX_LENGTH) {
			return base64;
		}
		return base64.slice(0, BASE64_ATTACHMENT_MAX_LENGTH);
	}

	private isTextFile(extension: string): boolean {
		return TEXT_FILE_EXTENSIONS.has(extension.toLowerCase());
	}

	private isPdfFile(extension: string): boolean {
		return PDF_FILE_EXTENSIONS.has(extension.toLowerCase());
	}

	private isImageFile(extension: string): boolean {
		return IMAGE_FILE_EXTENSIONS.has(extension.toLowerCase());
	}

	private resolveMimeType(extension: string): string {
		const lowered = extension.toLowerCase();
		return MIME_TYPE_BY_EXTENSION.get(lowered) ?? (IMAGE_FILE_EXTENSIONS.has(lowered) ? `image/${lowered}` : 'application/octet-stream');
	}

	private async extractPdfText(file: TFile): Promise<string | null> {
		try {
			const pdfjs = await ensurePdfJs();
			const arrayBuffer = await this.app.vault.readBinary(file);
			const uint8Array = new Uint8Array(arrayBuffer);
			const doc = await pdfjs.getDocument({ data: uint8Array }).promise;
			try {
				const pageCount = Math.min(doc.numPages, PDF_MAX_PAGES);
				const sections: string[] = [];
				let totalLength = 0;
				for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
					const page = await doc.getPage(pageNumber);
					const textContent = await page.getTextContent();
					const pageText = textContent.items
						.map((item: any) => ('str' in item ? item.str : ''))
						.join(' ')
						.replace(/\s+/g, ' ')
						.trim();
					if (pageText) {
						const labeled = `[PDF Page ${pageNumber}]\n${pageText}`;
						sections.push(labeled);
						totalLength += labeled.length;
						if (totalLength >= PDF_MAX_CHARACTERS) {
							break;
						}
					}
				}
				const combined = sections.join('\n\n').trim();
				if (!combined) {
					return null;
				}
				if (combined.length > PDF_MAX_CHARACTERS) {
					return `${combined.slice(0, PDF_MAX_CHARACTERS)}\n...[truncated ${combined.length - PDF_MAX_CHARACTERS} characters]`;
				}
				return combined;
			} finally {
				await doc.destroy();
			}
		} catch (error) {
			console.warn(`Failed to extract PDF text: ${file.path}`, error);
			return null;
		}
	}
}
