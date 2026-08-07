/**
 * File Atlas — resizable work-file rail.
 *
 * Open files are always included and appear before bounded recent history.
 * Ordering is independent of Obsidian's tab-strip order and can be switched
 * between recency-weighted frequency and filename. Frequency order is frozen
 * by the host for the lifetime of the modal so selecting a file never makes the
 * rail jump underneath the pointer.
 */

import React, { useEffect, useId, useRef } from 'react';
import { ArrowUpDown, Check, ChevronDown, FileClock, FileText, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { OpenDocMeta } from '../FileAtlasHostPort';
import type { FileRailSections, FileRailSortMode } from '../fileRailModel';
import type { FileAtlasRailConfig } from '../config/fileAtlasConfig';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import {
	PEAK_CONTROL_KEY_TIP_KEYS,
	PEAK_KEYBOARD_ZONE_LABELS,
} from '@/ui/keyboard/config/KeyboardNavigationDefaults';

interface FileRailRowProps {
	doc: OpenDocMeta;
	activePath: string | null;
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
}

const FileRailRow: React.FC<FileRailRowProps> = ({ doc, activePath, onSelect, onClose }) => (
	<div
		role="button"
		tabIndex={doc.path === activePath ? 0 : -1}
		data-peak-focus-id={doc.path}
		data-path={doc.path}
		className={`pkfa-rail-item${doc.path === activePath ? ' is-active' : ''}${doc.open ? ' is-open' : ' is-recent'}`}
		data-unsaved={doc.unsaved ? 'true' : undefined}
		title={doc.path}
		onClick={() => onSelect(doc.path)}
		onKeyDown={(event) => {
			if (event.shiftKey && event.key === 'F10') {
				event.preventDefault();
				event.currentTarget.querySelector<HTMLElement>('.pkfa-rail-close')?.focus();
				return;
			}
			if (event.key !== 'Enter' && event.key !== ' ') return;
			event.preventDefault();
			onSelect(doc.path);
		}}
	>
		<span className="pkfa-rail-icon">
			{doc.open ? <FileText /> : <FileClock />}
		</span>
		<span className="pkfa-rail-name">{doc.title}</span>
		<span className="pkfa-rail-dot" aria-hidden="true" />
		{doc.open ? (
			<Button
				variant="unstyled"
				type="button"
				className="pkfa-rail-close"
				aria-label={`Close ${doc.title}`}
				title="Close"
				tabIndex={-1}
				onClick={(event) => {
					event.stopPropagation();
					onClose(doc.path);
				}}
			>
				<X />
			</Button>
		) : (
			<span className="pkfa-rail-close-slot" aria-hidden="true" />
		)}
	</div>
);

interface FileRailGroupProps {
	title: string;
	docs: OpenDocMeta[];
	activePath: string | null;
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
}

const FileRailGroup: React.FC<FileRailGroupProps> = ({
	title,
	docs,
	activePath,
	onSelect,
	onClose,
}) => {
	if (docs.length === 0) return null;
	return (
		<section className="pkfa-rail-group" aria-label={title}>
			<div className="pkfa-rail-group-head">
				<span>{title}</span>
				<span>{docs.length}</span>
			</div>
			{docs.map((doc) => (
				<FileRailRow
					key={doc.path}
					doc={doc}
					activePath={activePath}
					onSelect={onSelect}
					onClose={onClose}
				/>
			))}
		</section>
	);
};

interface FileRailProps {
	title: string;
	openTitle: string;
	recentTitle: string;
	sortLabel: string;
	sortLabels: Record<FileRailSortMode, string>;
	resizeLabel: string;
	sections: FileRailSections;
	sortMode: FileRailSortMode;
	widthPx: number;
	widthLimits: FileAtlasRailConfig;
	activePath: string | null;
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
	onSortModeChange: (mode: FileRailSortMode) => void;
	onWidthChange: (widthPx: number) => void;
	onWidthCommit: (widthPx: number) => void;
}

export const FileRail: React.FC<FileRailProps> = ({
	title,
	openTitle,
	recentTitle,
	sortLabel,
	sortLabels,
	resizeLabel,
	sections,
	sortMode,
	widthPx,
	widthLimits,
	activePath,
	onSelect,
	onClose,
	onSortModeChange,
	onWidthChange,
	onWidthCommit,
}) => {
	const [sortOpen, setSortOpen] = React.useState(false);
	const railRef = useRef<HTMLDivElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const sortMenuId = useId();
	const sortControlRef = useRef<HTMLDivElement>(null);
	useRovingComposite(listRef, {
		itemSelector: '.pkfa-rail-item',
		orientation: 'vertical',
		rememberBy: 'data-path',
	});

	useEffect(() => {
		if (!sortOpen) return;
		const ownerDocument = sortControlRef.current?.ownerDocument;
		if (!ownerDocument) return;
		const closeOutside = (event: PointerEvent): void => {
			if (sortControlRef.current?.contains(event.target as Node)) return;
			setSortOpen(false);
		};
		const closeWithEscape = (event: KeyboardEvent): void => {
			if (event.key !== 'Escape') return;
			setSortOpen(false);
			sortControlRef.current?.querySelector<HTMLButtonElement>('.pkfa-rail-sort')?.focus();
		};
		ownerDocument.addEventListener('pointerdown', closeOutside, true);
		ownerDocument.addEventListener('keydown', closeWithEscape);
		return () => {
			ownerDocument.removeEventListener('pointerdown', closeOutside, true);
			ownerDocument.removeEventListener('keydown', closeWithEscape);
		};
	}, [sortOpen]);

	const clampWidth = (value: number): number =>
		Math.round(Math.min(widthLimits.maxWidthPx, Math.max(widthLimits.minWidthPx, value)));

	const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
		event.preventDefault();
		const ownerDocument = event.currentTarget.ownerDocument;
		const ownerWindow = ownerDocument.defaultView;
		if (!ownerWindow) return;
		const startX = event.clientX;
		const startWidth = widthPx;
		let latestWidth = widthPx;
		const onMove = (moveEvent: PointerEvent): void => {
			latestWidth = clampWidth(startWidth + moveEvent.clientX - startX);
			onWidthChange(latestWidth);
		};
		const onUp = (): void => {
			ownerWindow.removeEventListener('pointermove', onMove);
			ownerWindow.removeEventListener('pointerup', onUp);
			ownerWindow.removeEventListener('pointercancel', onUp);
			onWidthCommit(latestWidth);
		};
		ownerWindow.addEventListener('pointermove', onMove);
		ownerWindow.addEventListener('pointerup', onUp, { once: true });
		ownerWindow.addEventListener('pointercancel', onUp, { once: true });
	};

	const resizeWithKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
		let nextWidth = widthPx;
		const step = event.shiftKey ? 16 : 4;
		if (event.key === 'ArrowLeft') nextWidth -= step;
		else if (event.key === 'ArrowRight') nextWidth += step;
		else if (event.key === 'Home') nextWidth = widthLimits.minWidthPx;
		else if (event.key === 'End') nextWidth = widthLimits.maxWidthPx;
		else if (event.key === 'Enter' || event.key === ' ') nextWidth = widthLimits.defaultWidthPx;
		else return;
		event.preventDefault();
		const clamped = clampWidth(nextWidth);
		onWidthChange(clamped);
		onWidthCommit(clamped);
	};

	return (
		<div
			ref={railRef}
			className="pkfa-rail"
			data-peak-keyboard-zone="fa-file-rail"
			data-peak-keyboard-zone-label={PEAK_KEYBOARD_ZONE_LABELS['fa-file-rail']}
			data-peak-keyboard-order="1"
		>
			<div className="pkfa-rail-head">
				<span className="pkfa-rail-title">
					<FileText />
					{title}
				</span>
				<div className="pkfa-rail-sort-control" ref={sortControlRef}>
					<Button
						variant="unstyled"
						type="button"
						className="pkfa-rail-sort"
						aria-haspopup="menu"
						aria-expanded={sortOpen}
						aria-controls={sortOpen ? sortMenuId : undefined}
						aria-label={`${sortLabel}: ${sortLabels[sortMode]}`}
						data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.fileAtlas.sort}
						data-peak-keytip-label={`${sortLabel}: ${sortLabels[sortMode]}`}
						onClick={() => setSortOpen((open) => !open)}
					>
						<ArrowUpDown aria-hidden="true" />
						<span>{sortLabels[sortMode]}</span>
						<ChevronDown aria-hidden="true" />
					</Button>
					{sortOpen && (
						<div
							id={sortMenuId}
							className="pkfa-rail-sort-menu"
							role="menu"
							aria-label={sortLabel}
						>
							{(['frequent', 'name'] as const).map((mode) => (
								<Button
									key={mode}
									variant="unstyled"
									type="button"
									role="menuitemradio"
									aria-checked={sortMode === mode}
									className="pkfa-rail-sort-option"
									data-selected={sortMode === mode ? 'true' : undefined}
									onClick={() => {
										onSortModeChange(mode);
										setSortOpen(false);
									}}
								>
									<span>{sortLabels[mode]}</span>
									{sortMode === mode && <Check aria-hidden="true" />}
								</Button>
							))}
						</div>
					)}
				</div>
			</div>
			<div ref={listRef} className="pkfa-rail-list" role="listbox" aria-label={title}>
				<FileRailGroup
					title={openTitle}
					docs={sections.open}
					activePath={activePath}
					onSelect={onSelect}
					onClose={onClose}
				/>
				<FileRailGroup
					title={recentTitle}
					docs={sections.recent}
					activePath={activePath}
					onSelect={onSelect}
					onClose={onClose}
				/>
			</div>
			<div
				className="pkfa-rail-resizer"
				role="separator"
				aria-label={resizeLabel}
				aria-orientation="vertical"
				aria-valuemin={widthLimits.minWidthPx}
				aria-valuemax={widthLimits.maxWidthPx}
				aria-valuenow={widthPx}
				tabIndex={0}
				onPointerDown={startResize}
				onKeyDown={resizeWithKey}
			/>
		</div>
	);
};
