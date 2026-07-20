/**
 * T5 (2026-07-07 heading-mode UI): optional footer under the two-zone
 * heading-mode surface. Shows outgoing (+ optional backlink) link
 * positions grouped by which heading section they fall in.
 *
 * Spec §Link Positions calls this out as optional; the footer collapses
 * on click and starts collapsed by default so it doesn't compete for
 * vertical space with the tree + snippet pane.
 *
 * When the backlink reader is unavailable (the current compose omits
 * one — vault edge repo has no per-line offsets), the Backlinks column
 * simply displays "No indexed backlinks." — no failure state, no
 * placeholder rows.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link2 } from 'lucide-react';
import type { HeadingTreeNode } from '@/service/search/heading/headingTree';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { cn } from '@/ui/react/lib/utils';
import { HEADING_MODE_STRINGS } from './strings';

interface LinkOccurrence {
	line: number;
	target: string;
	kind: 'outgoing' | 'backlink';
}

interface LinkPositionsFooterProps {
	filePath: string;
	tree: HeadingTreeNode[];
	onOpenLine: (line: number) => void;
}

/**
 * Walk the tree in document order and produce a flat list of leaf-most
 * sections keyed by their range. This is what we bucket link
 * occurrences into.
 */
function flattenSections(tree: HeadingTreeNode[]): Array<{ title: string; lineStart: number; lineEnd: number }> {
	const out: Array<{ title: string; lineStart: number; lineEnd: number }> = [];
	const walk = (nodes: HeadingTreeNode[]): void => {
		for (const n of nodes) {
			out.push({ title: n.title, lineStart: n.lineStart, lineEnd: n.lineEnd });
			walk(n.children);
		}
	};
	walk(tree);
	return out;
}

function bucketByLine(
	sections: ReturnType<typeof flattenSections>,
	occurrences: LinkOccurrence[],
): Map<string, LinkOccurrence[]> {
	const buckets = new Map<string, LinkOccurrence[]>();
	// Prefer the deepest matching section (last-inserted wins because
	// deeper subsections were pushed after their parents in the walk).
	for (const occ of occurrences) {
		let key = '(unassigned)';
		for (const s of sections) {
			if (occ.line >= s.lineStart && occ.line <= s.lineEnd) {
				key = `${s.title || '(untitled)'} · ${s.lineStart}${HEADING_MODE_STRINGS.sectionRangeSeparator}${s.lineEnd}`;
			}
		}
		const list = buckets.get(key) ?? [];
		list.push(occ);
		buckets.set(key, list);
	}
	return buckets;
}

const KindColumn: React.FC<{
	title: string;
	occurrences: LinkOccurrence[];
	emptyText: string;
	sections: ReturnType<typeof flattenSections>;
	onOpenLine: (line: number) => void;
}> = ({ title, occurrences, emptyText, sections, onOpenLine }) => {
	const buckets = useMemo(() => bucketByLine(sections, occurrences), [sections, occurrences]);
	if (occurrences.length === 0) {
		return (
			<span className="pktw-flex pktw-flex-col pktw-gap-1 pktw-flex-1 pktw-min-w-0">
				<span className="pktw-text-pk-xs pktw-uppercase pktw-tracking-wide pktw-text-pk-text-tertiary">{title}</span>
				<span className="pktw-text-xs pktw-text-pk-text-tertiary">{emptyText}</span>
			</span>
		);
	}
	return (
		<span className="pktw-flex pktw-flex-col pktw-gap-1 pktw-flex-1 pktw-min-w-0">
			<span className="pktw-text-pk-xs pktw-uppercase pktw-tracking-wide pktw-text-pk-text-tertiary">{title}</span>
			{Array.from(buckets.entries()).map(([bucketKey, list]) => (
				<span key={bucketKey} className="pktw-flex pktw-flex-col pktw-gap-0.5">
					<span className="pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-truncate" title={bucketKey}>{bucketKey}</span>
					{list.map((occ, i) => (
						<span
							key={`${occ.line}-${i}`}
							onClick={() => onOpenLine(occ.line)}
							className="pktw-flex pktw-items-baseline pktw-gap-2 pktw-text-xs pktw-cursor-pointer hover:pktw-bg-pk-surface-2 pktw-px-1 pktw-rounded"
						>
							<span className="pktw-font-mono pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-tabular-nums pktw-shrink-0">{occ.line}</span>
							<span className="pktw-truncate pktw-min-w-0 pktw-text-pk-text-secondary">→ {occ.target}</span>
						</span>
					))}
				</span>
			))}
		</span>
	);
};

export const LinkPositionsFooter: React.FC<LinkPositionsFooterProps> = ({ filePath, tree, onOpenLine }) => {
	const { headingMode } = useServiceContext();
	const [occurrences, setOccurrences] = useState<LinkOccurrence[]>([]);

	useEffect(() => {
		if (!headingMode) return;
		let cancelled = false;
		headingMode.getLinkPositions(filePath).then((occ) => {
			if (!cancelled) setOccurrences(occ);
		}).catch((err) => {
			console.warn('[LinkPositionsFooter] getLinkPositions failed', err);
			if (!cancelled) setOccurrences([]);
		});
		return () => {
			cancelled = true;
		};
	}, [headingMode, filePath]);

	const sections = useMemo(() => flattenSections(tree), [tree]);
	const outgoing = useMemo(() => occurrences.filter((o) => o.kind === 'outgoing'), [occurrences]);
	const backlinks = useMemo(() => occurrences.filter((o) => o.kind === 'backlink'), [occurrences]);

	return (
		<span className={cn(
			'pktw-flex pktw-flex-col pktw-border-t pktw-border-pk-border/40 pktw-bg-pk-surface-sunken/30',
		)}>
			<span className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1 pktw-text-pk-sm pktw-text-pk-text-secondary">
				<Link2 className="pktw-w-3 pktw-h-3 pktw-opacity-70" />
				{HEADING_MODE_STRINGS.linksFooterTitle}
			</span>
			<span className="pktw-flex pktw-gap-4 pktw-px-3 pktw-py-2 pktw-min-w-0">
				<KindColumn
					title={HEADING_MODE_STRINGS.outgoingHeader}
					occurrences={outgoing}
					emptyText={HEADING_MODE_STRINGS.noOutgoingLinks}
					sections={sections}
					onOpenLine={onOpenLine}
				/>
				<KindColumn
					title={HEADING_MODE_STRINGS.backlinkHeader}
					occurrences={backlinks}
					emptyText={HEADING_MODE_STRINGS.noBacklinks}
					sections={sections}
					onOpenLine={onOpenLine}
				/>
			</span>
		</span>
	);
};
