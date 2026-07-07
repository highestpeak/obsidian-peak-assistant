/**
 * T5 (2026-07-07 heading-mode UI): right zone of the heading-mode
 * surface. Owns snippet rendering for the currently-active heading
 * only (spec §Selection And Detail Pane).
 *
 * Data flow:
 *  - Parent supplies `filePath`, `section` ({ lineStart, lineEnd, title,
 *    level }), and `queryText`.
 *  - We fetch snippets via `useServiceContext().headingMode.getSectionSnippets`.
 *  - Empty section (`section === null`): render a hint prompting the
 *    user to type or pick a section.
 *  - Empty query: T2b returns first N non-heading preview lines, which
 *    we render with no highlight styling (spec empty-state UX).
 *
 * Keyboard focus for snippets is coordinated by the container via
 * `activeSnippetIndex` + `onOpenActiveSnippet` — this component just
 * renders the list and reports its length.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { SectionSnippet } from '@/service/search/heading/sectionSnippets';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';
import { HEADING_MODE_STRINGS } from './strings';

export interface ActiveSection {
	title: string;
	level: 1 | 2 | 3 | 4 | 5 | 6;
	lineStart: number;
	lineEnd: number;
	matchCount: number;
}

interface SectionDetailPaneProps {
	filePath: string;
	queryText: string;
	section: ActiveSection | null;
	activeSnippetIndex: number;
	onSnippetsChange: (snippets: SectionSnippet[]) => void;
	onOpenSnippet: (snippet: SectionSnippet) => void;
}

const SectionHeader: React.FC<{ section: ActiveSection }> = ({ section }) => (
	<span className="pktw-flex pktw-flex-col pktw-gap-1 pktw-px-4 pktw-py-3 pktw-border-b pktw-border-pk-border/40">
		<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-[10px] pktw-font-mono pktw-text-pk-text-tertiary pktw-tabular-nums">
			<span className="pktw-uppercase pktw-tracking-wide">H{section.level}</span>
			<span>{section.lineStart}{HEADING_MODE_STRINGS.sectionRangeSeparator}{section.lineEnd}</span>
			{section.matchCount > 0 && (
				<span className="pktw-text-pk-accent">{HEADING_MODE_STRINGS.sectionMatchesLabel(section.matchCount)}</span>
			)}
		</span>
		<span className="pktw-text-sm pktw-font-medium pktw-text-pk-text-primary pktw-truncate" title={section.title}>
			{section.title || '(untitled)'}
		</span>
	</span>
);

const SnippetLine: React.FC<{
	snippet: SectionSnippet;
	isActive: boolean;
	onClick: () => void;
}> = ({ snippet, isActive, onClick }) => {
	// Rebuild the line with <mark>-style spans at highlight offsets.
	const parts = useMemo(() => {
		if (snippet.highlights.length === 0) return [{ text: snippet.text, hit: false }];
		const out: Array<{ text: string; hit: boolean }> = [];
		let cursor = 0;
		for (const h of snippet.highlights) {
			if (h.start > cursor) out.push({ text: snippet.text.slice(cursor, h.start), hit: false });
			out.push({ text: snippet.text.slice(h.start, h.end), hit: true });
			cursor = h.end;
		}
		if (cursor < snippet.text.length) out.push({ text: snippet.text.slice(cursor), hit: false });
		return out;
	}, [snippet]);

	return (
		<span
			role="listitem"
			onClick={onClick}
			className={cn(
				'pktw-flex pktw-items-baseline pktw-gap-2 pktw-px-4 pktw-py-1 pktw-text-xs pktw-cursor-pointer pktw-min-w-0',
				isActive ? 'pktw-bg-pk-accent-tint' : 'hover:pktw-bg-pk-surface-2',
			)}
		>
			<span className="pktw-shrink-0 pktw-font-mono pktw-text-[10px] pktw-text-pk-text-tertiary pktw-tabular-nums pktw-w-8 pktw-text-right">
				{snippet.line}
			</span>
			<span className="pktw-min-w-0 pktw-flex-1 pktw-text-pk-text-secondary pktw-whitespace-normal pktw-break-words pktw-leading-snug">
				{parts.map((p, i) =>
					p.hit ? (
						<span key={i} className="pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-font-medium pktw-rounded-sm pktw-px-0.5">
							{p.text}
						</span>
					) : (
						<span key={i}>{p.text}</span>
					),
				)}
			</span>
		</span>
	);
};

const EmptyDetail: React.FC<{ text: string }> = ({ text }) => (
	<span className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-p-6 pktw-text-xs pktw-text-pk-text-tertiary">
		{text}
	</span>
);

export const SectionDetailPane: React.FC<SectionDetailPaneProps> = ({
	filePath,
	queryText,
	section,
	activeSnippetIndex,
	onSnippetsChange,
	onOpenSnippet,
}) => {
	const { headingMode } = useServiceContext();
	const [snippets, setSnippets] = useState<SectionSnippet[]>([]);

	useEffect(() => {
		if (!headingMode || !section) {
			setSnippets([]);
			onSnippetsChange([]);
			return;
		}
		let cancelled = false;
		headingMode
			.getSectionSnippets(filePath, { lineStart: section.lineStart, lineEnd: section.lineEnd }, queryText)
			.then((s) => {
				if (cancelled) return;
				setSnippets(s);
				onSnippetsChange(s);
			})
			.catch((err) => {
				console.warn('[SectionDetailPane] getSectionSnippets failed', err);
				if (!cancelled) {
					setSnippets([]);
					onSnippetsChange([]);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [headingMode, filePath, section?.lineStart, section?.lineEnd, queryText]);

	if (!section) {
		return <EmptyDetail text={queryText ? HEADING_MODE_STRINGS.emptyDetailNoActive : HEADING_MODE_STRINGS.emptyDetailHint} />;
	}

	return (
		<span className="pktw-flex pktw-flex-col pktw-min-w-0 pktw-h-full">
			<SectionHeader section={section} />
			<span role="list" className="pktw-flex pktw-flex-col pktw-py-1 pktw-overflow-y-auto pktw-flex-1">
				{snippets.length === 0 ? (
					<EmptyDetail text={queryText ? 'No matches in this section.' : HEADING_MODE_STRINGS.emptyDetailHint} />
				) : (
					snippets.map((snippet, i) => (
						<SnippetLine
							key={`${snippet.line}-${i}`}
							snippet={snippet}
							isActive={i === activeSnippetIndex}
							onClick={() => onOpenSnippet(snippet)}
						/>
					))
				)}
			</span>
		</span>
	);
};
