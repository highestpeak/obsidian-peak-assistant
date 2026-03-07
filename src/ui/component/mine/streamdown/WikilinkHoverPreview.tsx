/**
 * Hover preview for wikilinks in Streamdown: parse href, load vault file, show card.
 * Rendered in a portal so it appears above shadow DOM. Cache and throttle in caller.
 */

import React, { useRef } from 'react';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { getExtensionFromSource } from '@/core/document/helper/FileTypeUtils';
import { IMAGE_EXTENSIONS } from '@/core/document/helper/FileTypeUtils';

const PREVIEW_TEXT_LINES = 15;
const PREVIEW_CACHE_MAX = 50;
const PREVIEW_CACHE_TTL_MS = 60_000;

export type PreviewResult = { type: 'text'; content: string } | { type: 'image'; content: string } | { type: 'pdf'; content: string };

const previewCache = new Map<string, { result: PreviewResult; ts: number }>();

function revokeIfImage(entry: { result: PreviewResult } | undefined): void {
	if (entry?.result?.type === 'image' && entry.result.content) {
		try {
			URL.revokeObjectURL(entry.result.content);
		} catch {
			// ignore
		}
	}
}

function pruneCache(): void {
	if (previewCache.size <= PREVIEW_CACHE_MAX) return;
	const entries = [...previewCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
	const toDelete = entries.slice(0, entries.length - PREVIEW_CACHE_MAX);
	toDelete.forEach(([k, v]) => {
		revokeIfImage(v);
		previewCache.delete(k);
	});
}

/**
 * Parse wikilink href to vault-relative path. Returns null for non-wikilink or block anchor.
 */
export function parseWikilinkHrefToPath(href: string): string | null {
	const t = (href ?? '').trim();
	if (t.startsWith('#block-')) return null;
	if (t.startsWith('#peak-wikilink=')) {
		const encoded = t.slice('#peak-wikilink='.length);
		try {
			return decodeURIComponent(encoded || '').trim() || null;
		} catch {
			return null;
		}
	}
	if (t.startsWith('peak://wikilink/')) {
		const encoded = t.slice('peak://wikilink/'.length);
		try {
			return decodeURIComponent(encoded || '').trim() || null;
		} catch {
			return null;
		}
	}
	return null;
}

/**
 * Strip #heading or #^block-id from wikilink target.
 */
function stripAnchor(target: string): string {
	const hashIdx = target.indexOf('#');
	if (hashIdx === -1) return target;
	return target.slice(0, hashIdx).trim();
}

/** True if string looks like a vault path (has slash or .md). */
function looksLikePath(s: string): boolean {
	const t = (s ?? '').trim();
	return t.includes('/') || /\.(md|markdown)$/i.test(t);
}

/**
 * Resolve raw wikilink target (display name or path) to vault file path via metadataCache.
 */
export function resolveWikilinkTargetToPath(rawTarget: string, app: App): string | null {
	const t = (rawTarget ?? '').trim();
	if (!t || t.startsWith('#')) return null;
	const filePart = stripAnchor(t);
	if (!filePart) return null;
	if (looksLikePath(filePart)) return filePart;
	const dest = app.metadataCache.getFirstLinkpathDest(filePart, '');
	return dest && 'path' in dest ? dest.path : filePart;
}

/**
 * Load preview for a vault path. Uses in-memory cache with TTL. Returns type and content (text snippet, image blob URL, or pdf resource path).
 */
export async function loadWikilinkPreview(path: string, app: App): Promise<PreviewResult | null> {
	const normalized = (path ?? '').trim();
	if (!normalized) return null;
	const filePart = stripAnchor(normalized);
	const cached = previewCache.get(filePart);
	if (cached && Date.now() - cached.ts < PREVIEW_CACHE_TTL_MS) return cached.result;
	pruneCache();

	try {
		const file = app.vault.getAbstractFileByPath(filePart);
		if (!(file instanceof TFile)) return null;
		const ext = getExtensionFromSource(filePart).toLowerCase();
		const isImage = IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number]);
		if (isImage) {
			const existing = previewCache.get(filePart);
			revokeIfImage(existing);
			const data = await app.vault.readBinary(file);
			const blob = new Blob([data], { type: ext === 'svg' ? 'image/svg+xml' : undefined });
			const url = URL.createObjectURL(blob);
			const result: PreviewResult = { type: 'image', content: url };
			previewCache.set(filePart, { result, ts: Date.now() });
			return result;
		}
		if (ext === 'pdf') {
			const resourcePath = app.vault.getResourcePath(file);
			const result: PreviewResult = { type: 'pdf', content: resourcePath };
			previewCache.set(filePart, { result, ts: Date.now() });
			return result;
		}
		const text = await app.vault.read(file);
		const lines = text.split(/\r?\n/).slice(0, PREVIEW_TEXT_LINES);
		const content = lines.join('\n') + (lines.length >= PREVIEW_TEXT_LINES ? '\n…' : '');
		const result: PreviewResult = { type: 'text', content };
		previewCache.set(filePart, { result, ts: Date.now() });
		return result;
	} catch {
		return null;
	}
}

export interface WikilinkHoverCardProps {
	path: string;
	preview: PreviewResult | null;
	loading: boolean;
	rect: DOMRect;
	onClose: () => void;
	/** Call when pointer enters card so host can cancel delayed close. */
	onEnterCard?: () => void;
}

/**
 * Fixed-position hover card for wikilink preview. Render in a portal to document.body.
 */
export const WikilinkHoverCard: React.FC<WikilinkHoverCardProps> = ({ path, preview, loading, rect, onClose, onEnterCard }) => {
	const ref = useRef<HTMLDivElement>(null);
	const left = rect.left;
	const top = rect.bottom + 4;
	const maxW = 420;
	const maxH = 320;

	return (
		<div
			ref={ref}
			role="tooltip"
			className="pktw-fixed pktw-z-[10000] pktw-rounded-lg pktw-border pktw-border-[#e5e7eb] pktw-bg-[#fff] pktw-shadow-lg pktw-overflow-hidden pktw-pointer-events-auto"
			style={{
				left: Math.min(left, window.innerWidth - maxW - 16),
				top: Math.min(top, window.innerHeight - maxH - 16),
				maxWidth: maxW,
				maxHeight: maxH,
			}}
			onMouseLeave={onClose}
			onMouseEnter={onEnterCard}
		>
			<div className="pktw-p-2 pktw-border-b pktw-border-[#e5e7eb] pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-truncate" title={path}>
				{path}
			</div>
			<div className="pktw-p-2 pktw-overflow-auto" style={{ maxHeight: maxH - 40 }}>
				{loading && !preview && <span className="pktw-text-xs pktw-text-[#9ca3af]">Loading…</span>}
				{preview?.type === 'text' && (
					<pre className="pktw-text-xs pktw-whitespace-pre-wrap pktw-font-mono pktw-text-[#374151] pktw-m-0">
						{preview.content}
					</pre>
				)}
				{preview?.type === 'image' && (
					<img
						src={preview.content}
						alt={path}
						className="pktw-max-w-full pktw-max-h-[280px] pktw-object-contain"
					/>
				)}
				{preview?.type === 'pdf' && (
					<iframe
						src={preview.content}
						title="PDF preview"
						className="pktw-w-full pktw-h-[280px] pktw-border-0 pktw-rounded"
					/>
				)}
			</div>
		</div>
	);
};
