/**
 * File Atlas — Atlas Tree (Phase 1).
 *
 * Renders the ordered block tree with real collapse. Row layout:
 * [line gutter · start line only] [twisty] [type icon] [name+sub] [add-to-tray] [badge].
 * Collapsed heading rows show a "N blocks · N res" summary (the only allowed
 * count usage per the spec).
 */

import React, { useMemo, useRef } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { iconForKind } from '../config/kindIcons';
import { flattenAtlasRows, foldSummary, isGroupNode } from '../atlasTreeModel';
import { displayIdentity, isProjectionRow } from '../atlasDisplayModel';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_A11Y_STRINGS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

interface AtlasTreeProps {
	blocks: DocumentBlock[];
	config: FileAtlasConfig;
	visible: Set<string>;
	visibleKinds: Set<DocumentBlock['kind']>;
	showFrontmatterSummary: boolean;
	collapsed: Set<string>;
	selectedId: string | null;
	trayIds: Set<string>;
	onSelect: (block: DocumentBlock) => void;
	onOpenInEditor: (block: DocumentBlock) => void;
	onToggleFold: (id: string) => void;
	onAddToTray: (block: DocumentBlock) => void;
	flattened?: boolean;
}

export const AtlasTree: React.FC<AtlasTreeProps> = (props) => {
	const treeRef = useRef<HTMLDivElement>(null);
	const blockById = useMemo(() => {
		const map = new Map<string, DocumentBlock>();
		const visit = (blocks: DocumentBlock[]): void => {
			for (const block of blocks) {
				map.set(block.id, block);
				visit(block.children ?? []);
			}
		};
		visit(props.blocks);
		return map;
	}, [props.blocks]);
	useRovingComposite(treeRef, {
		itemSelector: '[role="treeitem"]',
		orientation: 'vertical',
		rememberBy: 'data-block-id',
		onActiveItem: (item) => {
			const block = blockById.get(item.dataset.blockId ?? '');
			if (block) props.onSelect(block);
		},
	});

	if (props.flattened) {
		const rows = flattenAtlasRows(
			props.blocks,
			props.visible,
			props.visibleKinds,
			props.showFrontmatterSummary,
			props.config,
		);
		return (
			<div
				ref={treeRef}
				className="pkfa-tree pkfa-tree--flattened"
				role="tree"
				aria-label={PEAK_KEYBOARD_A11Y_STRINGS.documentBlocks}
			>
				{rows.map((row) => (
					<AtlasNode
						key={row.block.id}
						block={row.block}
						depth={0}
						parentId={null}
						suppressChildren
						{...props}
					/>
				))}
			</div>
		);
	}
	return (
		<div
			ref={treeRef}
			className="pkfa-tree"
			role="tree"
			aria-label={PEAK_KEYBOARD_A11Y_STRINGS.documentBlocks}
		>
			{props.blocks.map((block) => (
				<AtlasNode key={block.id} block={block} depth={0} parentId={null} {...props} />
			))}
		</div>
	);
};

interface AtlasNodeProps extends AtlasTreeProps {
	block: DocumentBlock;
	depth: number;
	ownerContext?: string;
	suppressChildren?: boolean;
	parentId: string | null;
}

const AtlasNode: React.FC<AtlasNodeProps> = ({
	block,
	depth,
	ownerContext,
	suppressChildren = false,
	parentId,
	...props
}) => {
	const {
		config,
		visible,
		visibleKinds,
		showFrontmatterSummary,
		collapsed,
		selectedId,
		trayIds,
	} = props;
	if (!visible.has(block.id)) return null;

	const isHeading = block.kind === RawBlockKind.Heading;
	const isFrontmatter = block.kind === RawBlockKind.Frontmatter;
	const display = displayIdentity(block, config, { ownerContext });
	const projectionRow = isProjectionRow(block, visibleKinds, showFrontmatterSummary);
	if (!projectionRow) {
		const promotedOwner = isFrontmatter ? ownerContext : display.primary;
		return (
			<>
				{(block.children ?? []).map((child) => (
					<AtlasNode
						key={child.id}
						block={child}
						depth={depth}
						ownerContext={promotedOwner}
						parentId={parentId}
						{...props}
					/>
				))}
			</>
		);
	}

	const hasChildren = Boolean(
		block.children?.some((child) => visible.has(child.id)),
	);
	const isGroup = isGroupNode(block) && hasChildren;
	const kindCfg = config.kinds[block.kind];
	const isCollapsed = collapsed.has(block.id);
	const Icon = iconForKind(block.kind, block.level);

	const badgeText = isHeading ? `H${block.level}` : kindCfg?.badge ?? block.kind;
	const badgeClass = isHeading ? 'pkfa-badge--h' : `pkfa-badge--${kindCfg?.badgeClass ?? 'block'}`;
	const typeClass = isHeading
		? 'pkfa-type-heading'
		: isFrontmatter
			? 'pkfa-type-frontmatter'
			: `pkfa-type-${kindCfg?.type ?? 'block'}`;
	const inTray = trayIds.has(block.id);
	const summary = isGroup && isCollapsed ? foldSummary(block, config.kinds) : '';
	const showBadge = !isFrontmatter
		&& block.kind !== RawBlockKind.Task
		&& block.kind !== RawBlockKind.ListItem;

	const onRowClick = (): void => props.onSelect(block);

	return (
		<>
			<div
				role="treeitem"
				tabIndex={selectedId === block.id ? 0 : -1}
				aria-level={depth + 1}
				aria-selected={selectedId === block.id}
				aria-expanded={isGroup ? !isCollapsed : undefined}
				data-block-id={block.id}
				data-parent-id={parentId ?? undefined}
				data-peak-focus-id={block.id}
				className={`pkfa-node ${typeClass}${selectedId === block.id ? ' is-selected' : ''}${
					isCollapsed ? ' is-collapsed' : ''
				}`}
				data-kind={block.kind}
				onClick={onRowClick}
				onDoubleClick={() => props.onOpenInEditor(block)}
				onKeyDown={(e) => {
					if (e.key === 'ArrowRight' && isGroup) {
						e.preventDefault();
						if (isCollapsed) {
							props.onToggleFold(block.id);
							return;
						}
						const escapedId = e.currentTarget.ownerDocument.defaultView?.CSS.escape(block.id)
							?? block.id.replace(/["\\]/g, '\\$&');
						const child = e.currentTarget.parentElement?.querySelector<HTMLElement>(
							`[role="treeitem"][data-parent-id="${escapedId}"]`,
						);
						child?.focus({ preventScroll: true });
						return;
					}
					if (e.key === 'ArrowLeft') {
						e.preventDefault();
						if (isGroup && !isCollapsed) {
							props.onToggleFold(block.id);
							return;
						}
						if (!parentId) return;
						const escapedParentId = e.currentTarget.ownerDocument.defaultView?.CSS.escape(parentId)
							?? parentId.replace(/["\\]/g, '\\$&');
						const tree = e.currentTarget.closest('[role="tree"]');
						tree?.querySelector<HTMLElement>(
							`[role="treeitem"][data-block-id="${escapedParentId}"]`,
						)?.focus({ preventScroll: true });
						return;
					}
					if (e.shiftKey && e.key === 'F10') {
						e.preventDefault();
						e.currentTarget.querySelector<HTMLElement>('.pkfa-add-btn')?.focus();
						return;
					}
					if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
						e.preventDefault();
						props.onOpenInEditor(block);
						return;
					}
					if (e.key === 'Enter') {
						e.preventDefault();
						props.onOpenInEditor(block);
						return;
					}
					if (e.key === ' ') {
						e.preventDefault();
						props.onAddToTray(block);
					}
				}}
			>
				<span className="pkfa-line-ref">{block.anchor.lineStart}</span>
				<div className="pkfa-node-body" style={{ paddingLeft: `${4 + depth * 10}px` }}>
					{isGroup && hasChildren ? (
						<Button
							variant="unstyled"
							type="button"
							className="pkfa-twisty"
							aria-label="Toggle section"
							tabIndex={-1}
							onClick={(e) => {
								e.stopPropagation();
								props.onToggleFold(block.id);
							}}
							onDoubleClick={(e) => e.stopPropagation()}
						>
							<ChevronDown />
						</Button>
					) : (
						<span className="pkfa-twisty is-empty" />
					)}
					<span className="pkfa-icon">
						<Icon />
					</span>
					<span className="pkfa-label">
						<span className="pkfa-name">{display.primary}</span>
						{!suppressChildren && display.secondary && (
							<span className="pkfa-sub">{display.secondary}</span>
						)}
					</span>
					{summary && <span className="pkfa-fold-sum">{summary}</span>}
					<Button
						variant="unstyled"
						type="button"
						className={`pkfa-add-btn${inTray ? ' is-in-tray' : ''}`}
						aria-label="Add to tray"
						title="Add to tray"
						tabIndex={-1}
						onClick={(e) => {
							e.stopPropagation();
							props.onAddToTray(block);
						}}
						onDoubleClick={(e) => e.stopPropagation()}
					>
						<Plus />
					</Button>
					{showBadge && <span className={`pkfa-badge ${badgeClass}`}>{badgeText}</span>}
				</div>
			</div>

			{!suppressChildren && isGroup && hasChildren && (
				<div
					role="group"
					className={`pkfa-kids${isFrontmatter ? ' pkfa-frontmatter-kids' : ''}${
						isCollapsed ? ' is-collapsed' : ''
					}`}
				>
					{block.children!.map((child) => (
						<AtlasNode
							key={child.id}
							block={child}
							depth={(
								(block.kind === RawBlockKind.ListItem || block.kind === RawBlockKind.Task)
								&& child.kind === RawBlockKind.List
							) ? depth : depth + 1}
							parentId={block.id}
							{...props}
						/>
					))}
				</div>
			)}
		</>
	);
};
