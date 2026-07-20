import React, { useState } from 'react';
import {
	MessageCircle,
	MessageSquare,
	Wrench,
	AlertTriangle,
	FileOutput,
	ChevronDown,
	ChevronRight,
	Star,
} from 'lucide-react';
import {
	formatTime,
	type OutlineGroup,
	type OutlineItem,
	type OutlineNodeKind,
} from './outlineModel';

/**
 * OutlineTab — presentational rendering for the model derived by
 * `buildOutlineItems`. Ordering, grouping, and filtering are all done by the
 * model; this file is a dumb list. Icons follow spec §10.1: type icon per row,
 * no repeated "Bot" avatar on the default assistant row.
 *
 * Topic groups render as collapsible heads (chevron + name + count) matching
 * the Chat Studio mock `.topic-head`. Collapse is local view state; a live
 * search query forces every group open so results are never hidden behind a
 * collapsed head.
 */

function iconFor(kind: OutlineNodeKind): React.ReactNode {
	switch (kind) {
		case 'user': return <MessageCircle aria-hidden />;
		case 'assistant': return <MessageSquare aria-hidden />;
		case 'process': return <Wrench aria-hidden />;
		case 'error': return <AlertTriangle aria-hidden />;
		case 'artifact': return <FileOutput aria-hidden />;
	}
}

export interface OutlineTabProps {
	groups: OutlineGroup[];
	activeMessageId: string | null;
	onSelect: (item: OutlineItem) => void;
	/** Empty-state main line. */
	emptyTitle: string;
	/** Empty-state secondary line (optional). */
	emptySub?: string;
	untopicedLabel: string;
	/** When a search query is active every group renders expanded. */
	forceExpanded?: boolean;
}

function OutlineRow({
	item,
	isActive,
	onSelect,
}: {
	item: OutlineItem;
	isActive: boolean;
	onSelect: (item: OutlineItem) => void;
}): React.ReactElement {
	const sub = item.meta ?? formatTime(item.createdAt);
	return (
		<button
			type="button"
			className={`pkchat-idx-row${isActive ? ' pkchat-idx-row--active' : ''}`}
			data-outline-kind={item.kind}
			onClick={() => onSelect(item)}
			aria-current={isActive ? 'true' : undefined}
		>
			<span className="pkchat-idx-row__icon" data-kind={item.kind}>
				{iconFor(item.kind)}
			</span>
			<span className="pkchat-idx-row__body">
				<span className="pkchat-idx-row__title">{item.label}</span>
				{sub && <span className="pkchat-idx-row__sub">{sub}</span>}
			</span>
			{/* Starred turns surface a right-aligned accent star so they're
			    findable from the Outline (owner request). `__body` is flex:1, so
			    the star lands at the row's right edge without shifting the label. */}
			{item.starred && (
				<Star className="pkchat-idx-row__star" aria-hidden fill="currentColor" />
			)}
		</button>
	);
}

export const OutlineTab: React.FC<OutlineTabProps> = ({
	groups,
	activeMessageId,
	onSelect,
	emptyTitle,
	emptySub,
	untopicedLabel,
	forceExpanded = false,
}) => {
	// Default: every group expanded. We track the COLLAPSED set so a fresh
	// conversation (and any newly appearing topic) starts open without extra
	// bookkeeping.
	const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

	if (!groups.length) {
		return (
			<div className="pkchat-idx__empty">
				<span className="pkchat-idx__empty-title">{emptyTitle}</span>
				{emptySub && <span className="pkchat-idx__empty-sub">{emptySub}</span>}
			</div>
		);
	}

	// A single unnamed group is just the whole outline — drop its head.
	const suppressSingleGroupHeader = groups.length === 1 && groups[0].topic === '';

	const toggle = (groupId: string): void => {
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(groupId)) next.delete(groupId);
			else next.add(groupId);
			return next;
		});
	};

	return (
		<>
			{groups.map((g) => {
				const expanded = forceExpanded || !collapsed.has(g.id);
				return (
					<section className="pkchat-idx-topic" key={g.id}>
						{!suppressSingleGroupHeader && (
							<button
								type="button"
								className="pkchat-idx-topic__head"
								aria-expanded={expanded}
								onClick={() => toggle(g.id)}
							>
								<span className="pkchat-idx-topic__toggle" aria-hidden>
									{expanded ? <ChevronDown /> : <ChevronRight />}
								</span>
								<span className="pkchat-idx-topic__name">
									{g.topic || untopicedLabel}
								</span>
								<span className="pkchat-idx-topic__count">{g.items.length}</span>
							</button>
						)}
						{expanded &&
							g.items.map((item) => (
								<OutlineRow
									key={item.id}
									item={item}
									isActive={item.messageId === activeMessageId}
									onSelect={onSelect}
								/>
							))}
					</section>
				);
			})}
		</>
	);
};
