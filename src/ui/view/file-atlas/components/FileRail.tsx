/**
 * File Atlas — resizable work-file rail.
 *
 * Open files are always included and appear before bounded recent history.
 * Ordering is independent of Obsidian's tab-strip order and can be switched
 * between recency-weighted frequency and filename.
 */

import React from 'react';
import { ArrowUpDown, Check, ChevronDown, FileClock, FileText, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/ui/component/shared-ui/popover';
import type { OpenDocMeta } from '../FileAtlasHostPort';
import type { FileRailSections, FileRailSortMode } from '../fileRailModel';
import type { FileAtlasRailConfig } from '../config/fileAtlasConfig';

interface FileRailRowProps {
	doc: OpenDocMeta;
	activePath: string | null;
	onSelect: (path: string) => void;
	onClose: (path: string) => void;
}

const FileRailRow: React.FC<FileRailRowProps> = ({ doc, activePath, onSelect, onClose }) => (
	<div
		role="button"
		tabIndex={0}
		className={`pkfa-rail-item${doc.path === activePath ? ' is-active' : ''}${doc.open ? ' is-open' : ' is-recent'}`}
		data-unsaved={doc.unsaved ? 'true' : undefined}
		title={doc.path}
		onClick={() => onSelect(doc.path)}
		onKeyDown={(event) => {
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
		if (event.key === 'ArrowLeft') nextWidth -= 16;
		else if (event.key === 'ArrowRight') nextWidth += 16;
		else if (event.key === 'Home') nextWidth = widthLimits.minWidthPx;
		else if (event.key === 'End') nextWidth = widthLimits.maxWidthPx;
		else return;
		event.preventDefault();
		const clamped = clampWidth(nextWidth);
		onWidthChange(clamped);
		onWidthCommit(clamped);
	};

	return (
		<div className="pkfa-rail">
			<div className="pkfa-rail-head">
				<span className="pkfa-rail-title">
					<FileText />
					{title}
				</span>
				<Popover open={sortOpen} onOpenChange={setSortOpen}>
					<PopoverTrigger asChild>
						<Button
							variant="unstyled"
							type="button"
							className="pkfa-rail-sort"
							aria-haspopup="menu"
							aria-expanded={sortOpen}
							aria-label={`${sortLabel}: ${sortLabels[sortMode]}`}
						>
							<ArrowUpDown aria-hidden="true" />
							<span>{sortLabels[sortMode]}</span>
							<ChevronDown aria-hidden="true" />
						</Button>
					</PopoverTrigger>
					<PopoverContent
						className="pkfa-rail-sort-menu"
						align="end"
						sideOffset={6}
						role="menu"
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
					</PopoverContent>
				</Popover>
			</div>
			<div className="pkfa-rail-list">
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
