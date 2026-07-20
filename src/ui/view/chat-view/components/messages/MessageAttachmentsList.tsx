import React, { useCallback, useMemo } from 'react';
import { ChatMessage, ChatResourceRef } from '@/service/chat/types';
import { ResourceKind } from '@/core/document/types';
import { cn } from '@/ui/react/lib/utils';
import { Globe } from 'lucide-react';
import { ResourcePreviewHover } from '@/ui/component/mine';
import { isUrl, getExtensionFromSource } from '@/core/document/helper/FileTypeUtils';
import { useServiceContext } from '@/ui/context/ServiceContext';

/**
 * MessageAttachmentsList — renders the resource cluster attached to a chat
 * message. Layout strategy comes from mock 04 (permutation catalog):
 *
 *   Images:
 *     1                → single tile, sized to subject
 *     2                → 50/50 grid
 *     3                → equal-width strip
 *     4                → 2×2 contact sheet
 *     5–7              → hero on top + 4-up thumb row
 *     8+               → 4 tiles, last one carries "+N" overlay
 *
 *   Files (everything that isn't an image or a URL):
 *     1                → full card (36px badge)
 *     2–4              → compact stacked cards (30px badge)
 *     5+               → chip cluster — color dot replaces badge
 *
 *   URLs:
 *     1                → rich preview card (host + title + URL)
 *     2+               → chip cluster
 *
 * The whole cluster is capped at 520px width and right-aligned so its right
 * edge matches the bubble's right edge — keeps the attachment + bubble
 * reading as a single user turn.
 *
 * T11P (Track G): the previous prop drill of `app: App` through eight nested
 * helpers was retired. Only the top-level component consumes
 * `vaultNavigation` from context now — child layout helpers just receive an
 * already-bound `onOpen` callback. URL opening still uses
 * `window.open(_, 'noopener,noreferrer')` (now via
 * `vaultNavigation.openExternalUrl`); vault-file opening still goes through
 * the app-owned navigation adapter (`vaultNavigation.openVaultPath` →
 * `openLinkText` fallback). Layout, hover preview, image grid, URL card,
 * and badges are unchanged.
 */

interface ResourceGroups {
	images: ChatResourceRef[];
	urls: ChatResourceRef[];
	files: ChatResourceRef[];
}

function classify(resources: ChatResourceRef[]): ResourceGroups {
	const out: ResourceGroups = { images: [], urls: [], files: [] };
	for (const r of resources) {
		if (r.kind === 'image') {
			out.images.push(r);
		} else if (r.kind === 'url') {
			out.urls.push(r);
		} else if (isUrl(r.source)) {
			// Defensive: kind defaulted to something else but source is clearly a URL.
			// Treat as URL so it renders as a link card, not a "0.0 KB file".
			out.urls.push(r);
		} else {
			out.files.push(r);
		}
	}
	return out;
}

interface BadgeStyle {
	/** Solid hex used as the badge background AND as the chip color-dot. */
	bg: string;
	/** 2–5 char display token shown inside the badge (e.g. "PDF", "XLSX"). */
	label: string;
}

/**
 * Resolve the badge color + label for a non-image, non-url resource.
 *
 * The function prefers the explicit `kind` from the data model, then falls
 * back to the file extension. Extensions handle the case where a generic
 * "unknown" kind still carries a recognizable suffix (e.g. someone attached
 * an .xlsx via drag-drop and the document loader hasn't classified it yet).
 */
function badgeStyleForKind(kind: ResourceKind, source: string): BadgeStyle {
	const ext = getExtensionFromSource(source).toLowerCase();
	if (kind === 'pdf' || ext === 'pdf') return { bg: '#e0464b', label: 'PDF' };
	if (kind === 'csv' || ext === 'csv') return { bg: '#1f8a4c', label: 'CSV' };
	if (kind === 'xlsx' || ext === 'xlsx' || ext === 'xls') return { bg: '#0f7c3a', label: 'XLSX' };
	if (kind === 'docx' || ext === 'docx' || ext === 'doc') return { bg: '#2a64c9', label: 'DOCX' };
	if (kind === 'pptx' || ext === 'pptx' || ext === 'ppt') return { bg: '#d8651e', label: 'PPTX' };
	if (kind === 'json' || ext === 'json') return { bg: '#c87f00', label: 'JSON' };
	if (kind === 'markdown' || ext === 'md' || ext === 'markdown') return { bg: '#7c5cff', label: 'MD' };
	if (kind === 'txt' || ext === 'txt') return { bg: '#6b7280', label: 'TXT' };
	if (ext === 'zip') return { bg: '#7c3aed', label: 'ZIP' };
	if (kind === 'html' || ext === 'html' || ext === 'htm') return { bg: '#e8732b', label: 'HTML' };
	if (kind === 'xml' || ext === 'xml') return { bg: '#9333ea', label: 'XML' };
	if (kind === 'excalidraw' || ext === 'excalidraw') return { bg: '#7c5cff', label: 'EXC' };
	if (kind === 'canvas') return { bg: '#7c5cff', label: 'CNV' };
	if (kind === 'folder') return { bg: '#6b7280', label: 'DIR' };
	// Fallback: short uppercase extension or generic.
	const fallbackLabel = (ext || 'file').slice(0, 4).toUpperCase();
	return { bg: '#6b7280', label: fallbackLabel };
}

interface OpenHandler {
	(resource: ChatResourceRef): void | Promise<void>;
}

export const MessageAttachmentsList: React.FC<{
	message: ChatMessage;
	align?: 'start' | 'end';
}> = ({ message, align = 'end' }) => {
	const { vaultNavigation } = useServiceContext();
	const resources = message.resources ?? [];
	const groups = useMemo(() => classify(resources), [resources]);

	const handleOpen = useCallback<OpenHandler>(async (resource) => {
		const src = resource.source;
		if (isUrl(src)) {
			vaultNavigation.openExternalUrl(src);
			return;
		}
		await vaultNavigation.openVaultPath(src);
	}, [vaultNavigation]);

	if (resources.length === 0) return null;

	return (
		<div
			className={cn(
				'pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full pktw-min-w-0',
				align === 'end' ? 'pktw-items-end pktw-ml-auto' : 'pktw-items-start pktw-mr-auto',
			)}
			style={{ maxWidth: 520 }}
		>
			{groups.images.length > 0 && (
				<ImageGroup images={groups.images} onOpen={handleOpen} />
			)}
			{groups.urls.length > 0 && (
				<UrlGroup urls={groups.urls} onOpen={handleOpen} />
			)}
			{groups.files.length > 0 && (
				<FileGroup files={groups.files} onOpen={handleOpen} />
			)}
		</div>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE GROUP
// ─────────────────────────────────────────────────────────────────────────────

interface ImageGroupProps {
	images: ChatResourceRef[];
	onOpen: OpenHandler;
}

function ImageGroup({ images, onOpen }: ImageGroupProps) {
	const n = images.length;

	if (n === 1) {
		return (
			<div style={{ width: 240 }}>
				<ImageTile image={images[0]} onOpen={onOpen} height={160} />
			</div>
		);
	}

	if (n === 2) {
		return (
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2 pktw-w-full">
				{images.map((img) => (
					<ImageTile key={img.id} image={img} onOpen={onOpen} height={180} />
				))}
			</div>
		);
	}

	if (n === 3) {
		return (
			<div className="pktw-grid pktw-grid-cols-3 pktw-gap-2 pktw-w-full">
				{images.map((img) => (
					<ImageTile key={img.id} image={img} onOpen={onOpen} height={120} />
				))}
			</div>
		);
	}

	if (n === 4) {
		return (
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2 pktw-w-full">
				{images.map((img) => (
					<ImageTile key={img.id} image={img} onOpen={onOpen} height={130} />
				))}
			</div>
		);
	}

	if (n <= 7) {
		// hero (full width) + remaining 4-up thumb row
		const [hero, ...rest] = images;
		const thumbs = rest.slice(0, 4);
		return (
			<div className="pktw-flex pktw-flex-col pktw-gap-2 pktw-w-full">
				<ImageTile image={hero} onOpen={onOpen} height={220} fullWidth />
				<div className="pktw-grid pktw-grid-cols-4 pktw-gap-2">
					{thumbs.map((img) => (
						<ImageTile key={img.id} image={img} onOpen={onOpen} height={84} />
					))}
				</div>
			</div>
		);
	}

	// 8+ : 4 tiles, last with "+N" overlay
	const visible = images.slice(0, 4);
	const remaining = images.length - 4;
	return (
		<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2 pktw-w-full">
			{visible.map((img, idx) => (
				<ImageTile
					key={img.id}
					image={img}
					onOpen={onOpen}
					height={130}
					overlayText={idx === 3 ? `+${remaining}` : undefined}
				/>
			))}
		</div>
	);
}

interface ImageTileProps {
	image: ChatResourceRef;
	onOpen: OpenHandler;
	height: number;
	fullWidth?: boolean;
	overlayText?: string;
}

function ImageTile({ image, onOpen, height, fullWidth, overlayText }: ImageTileProps) {
	const alt = image.displayName || image.source.split('/').pop() || 'image';
	return (
		<ResourcePreviewHover resource={image} previewClassName="pktw-z-[100]">
			<button
				type="button"
				className="pktw-relative pktw-overflow-hidden pktw-cursor-pointer pktw-border-0 pktw-p-0 pktw-bg-muted hover:pktw-opacity-90 pktw-transition-opacity"
				style={{ height, width: fullWidth ? '100%' : undefined, borderRadius: 10 }}
				onClick={(e) => {
					e.stopPropagation();
					void onOpen(image);
				}}
				aria-label={alt}
			>
				<img
					src={image.previewUri || image.source}
					alt={alt}
					className="pktw-w-full pktw-h-full pktw-object-cover pktw-block"
				/>
				{overlayText && (
					<span
						className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center pktw-text-white pktw-text-2xl pktw-font-semibold"
						style={{ background: 'rgba(20, 20, 25, 0.55)' }}
					>
						{overlayText}
					</span>
				)}
			</button>
		</ResourcePreviewHover>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE GROUP
// ─────────────────────────────────────────────────────────────────────────────

interface FileGroupProps {
	files: ChatResourceRef[];
	onOpen: OpenHandler;
}

function FileGroup({ files, onOpen }: FileGroupProps) {
	// Chip threshold: > 4 files. Below that, stacked cards are still readable
	// and let the eye land on filename quickly; beyond 4 the stack becomes a
	// wall of badges and chips read faster.
	if (files.length > 4) {
		return (
			<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-justify-end pktw-w-full">
				{files.map((f) => (
					<FileChip key={f.id} resource={f} onOpen={onOpen} />
				))}
			</div>
		);
	}

	// Compact card variant kicks in at 2+ so multi-file clusters don't
	// dominate the bubble's vertical space.
	const compact = files.length >= 2;
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-w-full">
			{files.map((f) => (
				<FileCard key={f.id} resource={f} onOpen={onOpen} compact={compact} />
			))}
		</div>
	);
}

interface FileCardProps {
	resource: ChatResourceRef;
	onOpen: OpenHandler;
	compact?: boolean;
}

function FileCard({ resource, onOpen, compact }: FileCardProps) {
	const filename = resource.displayName || resource.source.split('/').pop() || resource.source;
	const badge = badgeStyleForKind(resource.kind, resource.source);
	const badgePx = compact ? 30 : 36;
	return (
		<ResourcePreviewHover resource={resource} previewClassName="pktw-z-[100]">
			<button
				type="button"
				className={cn(
					'pk-attach-card',
					'pktw-flex pktw-items-center pktw-gap-2.5 pktw-w-full pktw-text-left pktw-cursor-pointer',
					compact ? 'pktw-px-2.5 pktw-py-2' : 'pktw-px-3 pktw-py-2.5',
				)}
				onClick={(e) => {
					e.stopPropagation();
					void onOpen(resource);
				}}
				title={resource.source}
			>
				<span
					className="pktw-inline-flex pktw-items-center pktw-justify-center pktw-text-white pktw-font-bold pktw-shrink-0 pktw-tracking-[0.02em] pktw-rounded-lg"
					style={{
						width: badgePx,
						height: badgePx,
						background: badge.bg,
						fontSize: compact ? 10 : 11,
					}}
				>
					{badge.label}
				</span>
				<div className="pktw-flex-1 pktw-min-w-0">
					<div className="pktw-text-pk-md pktw-font-medium pktw-text-foreground pktw-truncate">
						{filename}
					</div>
				</div>
			</button>
		</ResourcePreviewHover>
	);
}

interface FileChipProps {
	resource: ChatResourceRef;
	onOpen: OpenHandler;
}

function FileChip({ resource, onOpen }: FileChipProps) {
	const filename = resource.displayName || resource.source.split('/').pop() || resource.source;
	const badge = badgeStyleForKind(resource.kind, resource.source);
	return (
		<ResourcePreviewHover resource={resource} previewClassName="pktw-z-[100]">
			<button
				type="button"
				className="pk-attach-chip pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-text-pk-base pktw-text-foreground pktw-cursor-pointer"
				style={{ height: 26, maxWidth: 210 }}
				onClick={(e) => {
					e.stopPropagation();
					void onOpen(resource);
				}}
				title={resource.source}
			>
				<span
					className="pktw-shrink-0 pktw-w-1.5 pktw-h-1.5 pktw-rounded-full"
					style={{ background: badge.bg }}
				/>
				<span className="pktw-truncate">{filename}</span>
			</button>
		</ResourcePreviewHover>
	);
}

// ─────────────────────────────────────────────────────────────────────────────
// URL GROUP
// ─────────────────────────────────────────────────────────────────────────────

interface UrlGroupProps {
	urls: ChatResourceRef[];
	onOpen: OpenHandler;
}

function UrlGroup({ urls, onOpen }: UrlGroupProps) {
	if (urls.length > 1) {
		return (
			<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-justify-end pktw-w-full">
				{urls.map((u) => (
					<UrlChip key={u.id} resource={u} onOpen={onOpen} />
				))}
			</div>
		);
	}
	return <UrlCard resource={urls[0]} onOpen={onOpen} />;
}

interface UrlParts {
	host: string;
	pathDisplay: string;
	title: string;
	/** Best-effort preview image URL (host-specific OG or a favicon).
	 *  null → render the gradient fallback instead. */
	thumb: string | null;
}

/**
 * Best-effort thumbnail URL for a link. We can't do a CORS-restricted OG fetch
 * from the browser, so we map known hosts to their published OG endpoints
 * (GitHub has a stable one) and fall back to the favicon for everything else.
 * For URLs we can't classify we return null and the renderer shows a gradient
 * plate with a Globe glyph.
 */
function deriveThumbUrl(u: URL): string | null {
	const host = u.host.replace(/^www\./, '');
	// GitHub publishes a stable OG endpoint: any first-segment value is treated
	// as a cache buster, so `1/{owner}/{repo}` works for repos.
	if (host === 'github.com') {
		const parts = u.pathname.split('/').filter(Boolean);
		if (parts.length >= 2) {
			const [owner, repo] = parts;
			return `https://opengraph.githubassets.com/1/${owner}/${repo}`;
		}
	}
	// Generic fallback — favicon as a tiny preview. DuckDuckGo serves higher-res
	// site icons than browsers' built-in favicon paths.
	return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

function parseUrl(src: string): UrlParts {
	try {
		const u = new URL(src);
		const host = u.host.replace(/^www\./, '');
		const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
		return {
			host,
			pathDisplay: host + path,
			title: host + path,
			thumb: deriveThumbUrl(u),
		};
	} catch {
		return { host: src, pathDisplay: src, title: src, thumb: null };
	}
}

function UrlCard({ resource, onOpen }: { resource: ChatResourceRef; onOpen: OpenHandler }) {
	const { host, title, thumb } = parseUrl(resource.source);
	// Two flavors of thumb:
	//   - "og" (e.g. opengraph.githubassets.com) → big preview; cover the whole
	//     thumb cell as an inline <img>. If it 404s, hide the img and the
	//     gradient backdrop from the CSS class shows through.
	//   - "favicon" → 36×36 site mark centered on the gradient.
	const isFavicon = thumb?.includes('icons.duckduckgo.com') || thumb?.endsWith('.ico');
	// Skip the hover preview for URL cards. The inline card already shows host
	// + title + URL + OG image — the hover just duplicates that, with worse
	// formatting (a small text tooltip showing the filename).
	return (
		<ResourcePreviewHover resource={resource} enabled={false} previewClassName="pktw-z-[100]">
			<button
				type="button"
				className="pk-attach-card pk-attach-url pktw-w-full pktw-text-left pktw-cursor-pointer"
				onClick={(e) => {
					e.stopPropagation();
					void onOpen(resource);
				}}
			>
				<span className="pk-attach-url__thumb">
					{thumb && !isFavicon && (
						<img
							className="pk-attach-url__og"
							src={thumb}
							alt=""
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = 'none';
							}}
						/>
					)}
					{thumb && isFavicon && (
						<img
							className="pk-attach-url__favicon"
							src={thumb}
							alt=""
							onError={(e) => {
								(e.currentTarget as HTMLImageElement).style.display = 'none';
							}}
						/>
					)}
					{!thumb && <Globe style={{ width: 28, height: 28 }} />}
				</span>
				<div className="pktw-p-3 pktw-min-w-0 pktw-flex-1">
					<div className="pktw-text-pk-sm pktw-text-muted-foreground pktw-flex pktw-items-center pktw-gap-1 pktw-mb-0.5">
						<Globe className="pktw-w-3 pktw-h-3" />
						<span className="pktw-truncate">{host}</span>
					</div>
					<div
						className="pktw-text-pk-md pktw-font-medium pktw-text-foreground pktw-mb-0.5"
						style={{
							display: '-webkit-box',
							WebkitLineClamp: 2,
							WebkitBoxOrient: 'vertical',
							overflow: 'hidden',
						}}
					>
						{title}
					</div>
					<div className="pktw-text-pk-sm pktw-text-muted-foreground pktw-truncate">
						{resource.source}
					</div>
				</div>
			</button>
		</ResourcePreviewHover>
	);
}

function UrlChip({ resource, onOpen }: { resource: ChatResourceRef; onOpen: OpenHandler }) {
	const { pathDisplay } = parseUrl(resource.source);
	// Same reasoning as UrlCard — chip already shows the full URL on its tooltip
	// (`title={resource.source}`), so a HoverCard would be redundant.
	return (
		<ResourcePreviewHover resource={resource} enabled={false} previewClassName="pktw-z-[100]">
			<button
				type="button"
				className="pk-attach-chip pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-text-pk-base pktw-text-foreground pktw-cursor-pointer"
				style={{ height: 26, maxWidth: 210 }}
				onClick={(e) => {
					e.stopPropagation();
					void onOpen(resource);
				}}
				title={resource.source}
			>
				<span
					className="pktw-shrink-0 pktw-w-1.5 pktw-h-1.5 pktw-rounded-full"
					style={{ background: 'var(--pk-teal)' }}
				/>
				<span className="pktw-truncate">{pathDisplay}</span>
			</button>
		</ResourcePreviewHover>
	);
}
