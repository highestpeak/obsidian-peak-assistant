import type { ChatResourceRef } from '@/service/chat/types';
import type { ResourceKind } from '@/core/document/types';

/**
 * Maximum length for message content preview (in characters).
 */
const CONTENT_PREVIEW_MAX_LENGTH = 500;

/**
 * Generate a preview of message content (first N characters).
 * 
 * @param content Full message content
 * @returns Preview string (first N characters, truncated if needed)
 */
export function generateContentPreview(content: string): string {
	if (!content) return '';
	
	// Truncate to max length
	if (content.length <= CONTENT_PREVIEW_MAX_LENGTH) {
		return content;
	}
	
	// Truncate and add ellipsis
	return content.substring(0, CONTENT_PREVIEW_MAX_LENGTH) + '...';
}

/**
 * Generate a summary of attachments/resources.
 * Format: "X images, Y PDFs, Z documents"
 * 
 * @param resources Array of resource references
 * @returns Summary string (e.g., "2 images, 1 PDF") or empty string if no resources
 */
export function generateAttachmentSummary(resources?: ChatResourceRef[]): string {
	if (!resources || resources.length === 0) {
		return '';
	}

	// Count resources by kind
	const counts = new Map<string, number>();
	for (const resource of resources) {
		const kind = resource.kind || 'unknown';
		counts.set(kind, (counts.get(kind) || 0) + 1);
	}

	// Build summary string
	const parts: string[] = [];
	
	// Common document types
	const imageKinds = ['image', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
	const pdfKinds = ['pdf'];
	const documentKinds = ['markdown', 'md', 'txt', 'doc', 'docx'];
	
	let imageCount = 0;
	let pdfCount = 0;
	let docCount = 0;
	let otherCount = 0;
	
	for (const [kind, count] of counts.entries()) {
		const lowerKind = kind.toLowerCase();
		if (imageKinds.includes(lowerKind)) {
			imageCount += count;
		} else if (pdfKinds.includes(lowerKind)) {
			pdfCount += count;
		} else if (documentKinds.includes(lowerKind)) {
			docCount += count;
		} else {
			otherCount += count;
		}
	}
	
	if (imageCount > 0) {
		parts.push(`${imageCount} ${imageCount === 1 ? 'image' : 'images'}`);
	}
	if (pdfCount > 0) {
		parts.push(`${pdfCount} ${pdfCount === 1 ? 'PDF' : 'PDFs'}`);
	}
	if (docCount > 0) {
		parts.push(`${docCount} ${docCount === 1 ? 'document' : 'documents'}`);
	}
	if (otherCount > 0) {
		parts.push(`${otherCount} ${otherCount === 1 ? 'resource' : 'resources'}`);
	}
	
	return parts.join(', ');
}

