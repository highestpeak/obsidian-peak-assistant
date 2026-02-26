import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion, LayoutGroup } from 'framer-motion';
import { Copy, MessageCircle } from 'lucide-react';
import { StreamdownIsolated } from '@/ui/component/mine';
import type { DashboardBlock, DashboardBlockItem } from '@/service/agents/AISearchAgent';
import { getMermaidInner, wrapMermaidCode } from '@/core/utils/mermaid-utils';
import { Button } from '@/ui/component/shared-ui/button';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/ui/component/shared-ui/hover-card';
import { useAIAnalysisInteractionsStore } from '../../store/aiAnalysisStore';

/** Content-proportional width: more content => wider; floor >= 1 so row always fills (no blank). */
const MIN_WIDTH_FLOOR = 200;
const MIN_WIDTH_CEIL = 720;
/** Min flexGrow so every block can stretch when alone and row fills. */
const FLEX_GROW_FLOOR = 1;
const FLEX_GROW_CEIL = 5;
/** Chars per 1 unit of content score; lower = same text gives higher score => wider. */
const CHARS_PER_SCORE = 280;
/** Items add to content score so TILE/ACTION_GROUP scale by item count. */
const SCORE_PER_ITEM = 0.9;
/** minWidth = FLOOR + score * this; higher => long content gets wider faster. */
const MIN_WIDTH_PER_SCORE = 135;
const MIN_WIDTH_DEFAULT = '280px';

/** Default weight when block has none. Used for grid layout. */
const DEFAULT_BLOCK_WEIGHT = 6;

/** Effective weight for grid layout (1-3 small, 4-6 medium, 7-10 full-width). */
function getEffectiveWeight(block: DashboardBlock): number {
	if (block.weight != null) return block.weight;
	return DEFAULT_BLOCK_WEIGHT;
}

/** Content score from block: more content => higher. Used for proportional width. */
function getContentScore(block: DashboardBlock): number {
	if (block.renderEngine === 'MERMAID') return 0;
	const mdLen = block.markdown?.length ?? 0;
	const itemsCount = block.items?.length ?? 0;
	return mdLen / CHARS_PER_SCORE + itemsCount * SCORE_PER_ITEM;
}

/** Flexible layout: Mermaid fixed; others get flexGrow/minWidth by content score (more content => wider). */
function getBlockFlexStyle(
	weight: number,
	isMermaid: boolean,
	contentScore: number
): { flexGrow: number; flexBasis: string; minWidth?: string; maxWidth?: string } {
	if (weight >= 9) {
		return { flexGrow: 1, flexBasis: '100%', minWidth: '100%' };
	}
	// Mermaid: fixed min width but flexGrow 1 so row fills and single block stretches
	if (isMermaid) {
		return { flexGrow: 1, flexBasis: MIN_WIDTH_DEFAULT, minWidth: MIN_WIDTH_DEFAULT, maxWidth: '100%' };
	}
	// Content-proportional: flexGrow and minWidth scale with content score; no maxWidth so row fills
	const clampedScore = Math.max(0, contentScore);
	const flexGrow = Math.max(FLEX_GROW_FLOOR, Math.min(FLEX_GROW_CEIL, clampedScore * 0.95));
	const minWidthPx = Math.round(Math.max(MIN_WIDTH_FLOOR, Math.min(MIN_WIDTH_CEIL, MIN_WIDTH_FLOOR + clampedScore * MIN_WIDTH_PER_SCORE)));
	const minWidth = `${minWidthPx}px`;
	if (clampedScore < 1.5) {
		return { flexGrow, flexBasis: `${MIN_WIDTH_FLOOR}px`, minWidth };
	}
	return { flexGrow, flexBasis: '0', minWidth };
}

/** Strip markdown syntax from block title for display. */
function stripMarkdownFromTitle(raw: string): string {
	if (!raw || typeof raw !== 'string') return raw;
	return raw
		.replace(/^#+\s*/, '')
		.replace(/\*\*([^*]+)\*\*/g, '$1')
		.replace(/\*([^*]+)\*/g, '$1')
		.replace(/^[-*]\s*/, '')
		.trim();
}

/** Plain text for copy: markdown, mermaidCode, or items list. */
function getBlockCopyText(block: DashboardBlock): string {
	if (block.markdown?.trim()) return block.markdown.trim();
	if (block.mermaidCode?.trim()) return block.mermaidCode.trim();
	if (block.items?.length) {
		return block.items.map((i) => `${i.title}: ${i.description ?? ''}`).join('\n');
	}
	return '';
}

/** Dedupes items by (title, description) to avoid duplicate cards from AI output. */
function dedupeBlockItems(items: DashboardBlockItem[]): DashboardBlockItem[] {
	const seen = new Set<string>();
	return items.filter((item) => {
		const key = `${(item.title ?? '').trim()}|${(item.description ?? '').trim()}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/** Renders a single dashboard block by renderEngine. To add a new type: 1) add schema in DashboardUpdateToolBuilder, 2) add case here. */
const BlockContent: React.FC<{
	block: DashboardBlock;
	isStreaming?: boolean;
	onOpenChatForItem?: (block: DashboardBlock, item: DashboardBlockItem) => void;
	followupSlot?: React.ReactNode | null;
	anchorItemId?: string | null;
}> = ({ block, isStreaming = false, onOpenChatForItem, followupSlot, anchorItemId }) => {
	const { renderEngine, items: rawItems, markdown, mermaidCode, title } = block;
	const items = rawItems?.length ? dedupeBlockItems(rawItems) : rawItems;
	const label = title || 'Block';
	const hasItemChat = !!onOpenChatForItem;
	const showSlotAfterItem = (itemId: string) => !!followupSlot && anchorItemId === itemId;

	if (renderEngine === 'TILE' && items?.length) {
		return (
			<div className="pktw-grid pktw-grid-cols-1 pktw-md:grid-cols-2 pktw-gap-3">
				{items.map((item: DashboardBlockItem, idx: number) => (
					<React.Fragment key={`${block.id}-item-${idx}`}>
						<motion.div
							initial={{ opacity: 0, scale: 0.96 }}
							animate={{ opacity: 1, scale: 1 }}
							transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
							className="pktw-select-text pktw-bg-white pktw-rounded-lg pktw-overflow-hidden pktw-border pktw-border-[#e5e7eb] hover:pktw-border-[#7c3aed]/30 pktw-transition-colors pktw-flex pktw-group/item"
						>
							<div
								className="pktw-w-1 pktw-flex-shrink-0"
								style={{ backgroundColor: (item as any).color || '#7c3aed' }}
							/>
							<div className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-flex-1 pktw-min-w-0">
								<div className="pktw-flex-1 pktw-min-w-0">
									<div className="pktw-font-medium pktw-text-[#2e3338] pktw-text-sm pktw-mb-1 pktw-line-clamp-1">
										{stripMarkdownFromTitle(item.title)}
									</div>
									{item.description ? (
										<div className="pktw-text-[#6c757d] pktw-text-xs pktw-leading-relaxed pktw-line-clamp-3">
											{item.description}
										</div>
									) : null}
								</div>
								{hasItemChat ? (
									<Button
										variant="ghost"
										size="icon"
										style={{ cursor: 'pointer' }}
										onClick={() => onOpenChatForItem?.(block, item)}
										className="pktw-shadow-none pktw-flex-shrink-0 pktw-inline-flex pktw-items-center pktw-justify-center pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white hover:pktw-bg-[#f9fafb] pktw-transition-opacity pktw-opacity-0 group-hover/item:pktw-opacity-100"
										title="Chat about this item"
									>
										<MessageCircle className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
									</Button>
								) : null}
							</div>
						</motion.div>
						{showSlotAfterItem(item.id) ? (
							<motion.div
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.2 }}
								className="pktw-mt-2 pktw-md:col-span-2"
							>
								{followupSlot}
							</motion.div>
						) : null}
					</React.Fragment>
				))}
			</div>
		);
	}

	if (renderEngine === 'ACTION_GROUP' && items?.length) {
		return (
			<div className="pktw-space-y-3">
				{items.map((item: DashboardBlockItem, idx: number) => (
					<React.Fragment key={`${block.id}-item-${idx}`}>
						<motion.div
							initial={{ opacity: 0, x: -8 }}
							animate={{ opacity: 1, x: 0 }}
							transition={{ duration: 0.28, delay: idx * 0.05, ease: [0.22, 1, 0.36, 1] }}
							className="pktw-select-text pktw-bg-white pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-p-3 hover:pktw-border-[#7c3aed]/30 hover:pktw-bg-[#fafafa] pktw-transition-colors pktw-flex pktw-items-start pktw-gap-2 pktw-group/item"
						>
							<div className="pktw-flex-1 pktw-min-w-0">
								<div className="pktw-font-medium pktw-text-[#2e3338] pktw-text-sm pktw-mb-1">{stripMarkdownFromTitle(item.title)}</div>
								{item.description ? (
									<div className="pktw-text-[#6c757d] pktw-text-xs pktw-leading-relaxed">{item.description}</div>
								) : null}
							</div>
							{hasItemChat ? (
								<Button
									variant="ghost"
									size="icon"
									style={{ cursor: 'pointer' }}
									onClick={() => onOpenChatForItem?.(block, item)}
									className="pktw-shadow-none pktw-flex-shrink-0 pktw-inline-flex pktw-items-center pktw-justify-center pktw-w-7 pktw-h-7 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white hover:pktw-bg-[#f9fafb] pktw-transition-opacity pktw-opacity-0 group-hover/item:pktw-opacity-100"
									title="Chat about this item"
								>
									<MessageCircle className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
								</Button>
							) : null}
						</motion.div>
						{showSlotAfterItem(item.id) ? (
							<motion.div
								initial={{ opacity: 0, y: -4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.2 }}
								className="pktw-mt-2"
							>
								{followupSlot}
							</motion.div>
						) : null}
					</React.Fragment>
				))}
			</div>
		);
	}

	if (renderEngine === 'MERMAID' && (mermaidCode?.trim() || markdown?.trim())) {
		const raw = mermaidCode?.trim() || markdown?.trim() || '';
		const inner = getMermaidInner(raw);
		const content = inner.trim() ? wrapMermaidCode(inner) : '';
		return (
			<StreamdownIsolated
				className="pktw-select-text pktw-w-full pktw-min-w-0 pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none"
				isAnimating={isStreaming}
			>
				{content}
			</StreamdownIsolated>
		);
	}

	if ((renderEngine === 'MARKDOWN' || renderEngine === 'MERMAID') && markdown?.trim()) {
		return (
			<StreamdownIsolated
				className="pktw-select-text pktw-w-full pktw-text-left pktw-text-sm pktw-text-[#2e3338] pktw-prose pktw-prose-sm pktw-max-w-none"
				isAnimating={isStreaming}
			>
				{markdown}
			</StreamdownIsolated>
		);
	}

	return null;
};

export const DashboardBlocksSection: React.FC<{
	blocks: DashboardBlock[];
	blockRef?: React.RefObject<HTMLDivElement>;
	isStreaming?: boolean;
	followupOpen?: boolean;
	followupSlot?: React.ReactNode;
	/** When set, followup is rendered near this block (or item); otherwise not shown. */
	anchor?: { blockId: string; itemId?: string } | null;
	onOpenChatForBlock?: (block: DashboardBlock) => void;
	onOpenChatForItem?: (block: DashboardBlock, item: DashboardBlockItem) => void;
}> = ({ blocks, blockRef, isStreaming = false, followupOpen, followupSlot, anchor, onOpenChatForBlock, onOpenChatForItem }) => {
	const [copiedBlockId, setCopiedBlockId] = useState<string | null>(null);
	const blocksFollowupHistoryByBlockId = useAIAnalysisInteractionsStore((s) => s.blocksFollowupHistoryByBlockId);
	const setContextChatModal = useAIAnalysisInteractionsStore((s) => s.setContextChatModal);

	const handleCopyBlock = useCallback(async (block: DashboardBlock) => {
		const text = getBlockCopyText(block);
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
			setCopiedBlockId(block.id);
			setTimeout(() => setCopiedBlockId(null), 2000);
		} catch (e) {
			console.warn('[DashboardBlocksSection] Copy failed:', e);
		}
	}, []);

	if (!blocks?.length) return null;

	const hasChat = !!(onOpenChatForBlock || onOpenChatForItem);
	const showSlotAfterBlockHeader = followupOpen && anchor?.blockId && !anchor.itemId;
	const showSlotAfterItem = followupOpen && !!anchor?.itemId;

	const renderBlock = (block: DashboardBlock, index: number) => {
		const rawLabel = block.title || 'Block';
		const label = stripMarkdownFromTitle(rawLabel) || 'Block';
		const isAnchorBlock = anchor?.blockId === block.id;
		const weight = getEffectiveWeight(block);
		const isMermaid = block.renderEngine === 'MERMAID';
		const contentScore = getContentScore(block);
		const flexStyle = getBlockFlexStyle(weight, isMermaid, contentScore);
		const copyText = getBlockCopyText(block);
		const showCopy = copyText.length > 0;
		return (
			<motion.div
				key={`${block.id}-${index}`}
				layout
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{
					duration: 0.35,
					delay: index * 0.06,
					ease: [0.22, 1, 0.36, 1],
				}}
				id={`block-${block.id}`}
				className="dashboard-blocks-section-block pktw-select-text pktw-bg-[#f9fafb] pktw-rounded-lg pktw-p-4 pktw-border pktw-border-[#e5e7eb] pktw-scroll-mt-4 pktw-flex pktw-flex-col pktw-min-h-0 pktw-overflow-visible pktw-group"
				style={{
					flexGrow: flexStyle.flexGrow,
					flexBasis: flexStyle.flexBasis,
					minWidth: flexStyle.minWidth,
					maxWidth: flexStyle.maxWidth,
				}}
			>
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-2">
					<span className="pktw-text-xs pktw-font-semibold pktw-text-[#6b7280]">{label}</span>
					<div className="pktw-ml-auto pktw-flex pktw-items-center pktw-gap-1">
						{showCopy ? (
							<Button
								variant="ghost"
								style={{ cursor: 'pointer' }}
								size="icon"
								onClick={() => handleCopyBlock(block)}
								className="pktw-shadow-none pktw-inline-flex pktw-items-center pktw-justify-center pktw-w-7 pktw-min-w-7 pktw-h-7 pktw-flex-shrink-0 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white hover:pktw-bg-[#f9fafb] pktw-transition-opacity pktw-opacity-0 group-hover:pktw-opacity-100"
								title={copiedBlockId === block.id ? 'Copied' : 'Copy content'}
							>
								{copiedBlockId === block.id ? (
									<span className="pktw-text-[10px] pktw-text-[#22c55e]">OK</span>
								) : (
									<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
								)}
							</Button>
						) : null}
						{hasChat && onOpenChatForBlock ? (
							<HoverCard openDelay={100} closeDelay={150}>
								<HoverCardTrigger asChild>
									<Button
										variant="ghost"
										style={{ cursor: 'pointer' }}
										size="icon"
										onClick={() => onOpenChatForBlock(block)}
										className="pktw-shadow-none pktw-inline-flex pktw-items-center pktw-justify-center pktw-w-7 pktw-h-7 pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-white hover:pktw-bg-[#f9fafb] pktw-transition-opacity pktw-opacity-0 group-hover:pktw-opacity-100"
										title={followupOpen ? 'Hide follow-up' : 'Open follow-up'}
									>
										<MessageCircle className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#6c757d]" />
									</Button>
								</HoverCardTrigger>
								{(blocksFollowupHistoryByBlockId[block.id]?.length ?? 0) > 0 ? (
									<HoverCardContent align="end" className="pktw-w-56 pktw-max-w-[min(90vw,320px)] pktw-p-1 pktw-z-[10000] pktw-max-h-[min(60vh,420px)] pktw-overflow-y-auto">
										{(blocksFollowupHistoryByBlockId[block.id] ?? []).map((item, idx) => (
											<Button
												key={idx}
												variant="ghost"
												style={{ cursor: 'pointer' }}
												onClick={() => setContextChatModal((prev) => {
													const messages = blocksFollowupHistoryByBlockId[block.id] ?? [];
													if (prev && prev.type === 'blocks' && prev.blockId === block.id) {
														return { ...prev, activeQuestion: item.question };
													}
													return { type: 'blocks', blockId: block.id, title: 'Blocks Follow-up', messages, activeQuestion: item.question };
												})}
												className="pktw-w-full pktw-justify-start pktw-px-2 pktw-py-1.5 pktw-text-sm pktw-font-normal pktw-shadow-none pktw-min-w-0 pktw-text-left pktw-line-clamp-2"
											>
												<span className="pktw-truncate pktw-block">{item.question}</span>
											</Button>
										))}
									</HoverCardContent>
								) : null}
							</HoverCard>
						) : null}
					</div>
				</div>
				<AnimatePresence>
					{showSlotAfterBlockHeader && isAnchorBlock ? (
						<motion.div
							key="block-followup"
							initial={{ opacity: 0, y: -6 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -6 }}
							transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
							className="pktw-mb-3"
						>
							{followupSlot}
						</motion.div>
					) : null}
				</AnimatePresence>
				<div className="pktw-flex-1 pktw-min-h-0 pktw-flex pktw-flex-col pktw-overflow-visible">
					<BlockContent
						block={block}
						isStreaming={isStreaming}
						onOpenChatForItem={onOpenChatForItem}
						followupSlot={showSlotAfterItem && isAnchorBlock ? followupSlot : null}
						anchorItemId={anchor?.itemId ?? null}
					/>
				</div>
			</motion.div>
		);
	};

	return (
		<div ref={blockRef} className="pktw-select-text pktw-scroll-mt-24 pktw-w-full">
			<LayoutGroup>
				<motion.div
					className="pktw-flex pktw-flex-wrap pktw-gap-3 pktw-items-stretch pktw-w-full"
					layout
				>
					{blocks.map((block, index) => renderBlock(block, index))}
				</motion.div>
			</LayoutGroup>
		</div>
	);
};
