/**
 * File Atlas — Atlas Tree (Phase 1).
 *
 * Renders the ordered block tree with real collapse. Row layout:
 * [line gutter · start line only] [twisty] [type icon] [name+sub] [add-to-tray] [badge].
 * Collapsed heading rows show a "N blocks · N res" summary (the only allowed
 * count usage per the spec).
 */

import React from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind } from '@/core/document/atlas/types';
import { Button } from '@/ui/component/shared-ui/button';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { iconForKind } from '../config/kindIcons';
import { flattenAtlasRows, foldSummary, isGroupNode } from '../atlasTreeModel';
import { displayIdentity, isProjectionRow } from '../atlasDisplayModel';

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
	if (props.flattened) {
		const rows = flattenAtlasRows(
			props.blocks,
			props.visible,
			props.visibleKinds,
			props.showFrontmatterSummary,
			props.config,
		);
		return (
			<div className="pkfa-tree pkfa-tree--flattened">
				{rows.map((row) => (
					<AtlasNode
						key={row.block.id}
						block={row.block}
						depth={0}
						ownerContext={row.ownerContext}
						flatBreadcrumb={row.breadcrumb}
						suppressChildren
						{...props}
					/>
				))}
			</div>
		);
	}
	return (
		<div className="pkfa-tree">
			{props.blocks.map((block) => (
				<AtlasNode key={block.id} block={block} depth={0} {...props} />
			))}
		</div>
	);
};

interface AtlasNodeProps extends AtlasTreeProps {
	block: DocumentBlock;
	depth: number;
	ownerContext?: string;
	flatBreadcrumb?: string;
	suppressChildren?: boolean;
}

const AtlasNode: React.FC<AtlasNodeProps> = ({
	block,
	depth,
	ownerContext,
	flatBreadcrumb,
	suppressChildren = false,
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
	const Icon = iconForKind(block.kind);

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
				role="button"
				tabIndex={0}
				className={`pkfa-node ${typeClass}${selectedId === block.id ? ' is-selected' : ''}${
					isCollapsed ? ' is-collapsed' : ''
				}`}
				data-kind={block.kind}
				onClick={onRowClick}
				onDoubleClick={() => props.onOpenInEditor(block)}
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
						e.preventDefault();
						props.onOpenInEditor(block);
						return;
					}
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						onRowClick();
					}
				}}
			>
				<span className="pkfa-line-ref">{block.anchor.lineStart}</span>
				<div className="pkfa-node-body" style={{ paddingLeft: `${6 + depth * 16}px` }}>
					{isGroup && hasChildren ? (
						<Button
							variant="unstyled"
							type="button"
							className="pkfa-twisty"
							aria-label="Toggle section"
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
						{flatBreadcrumb && <span className="pkfa-breadcrumb">{flatBreadcrumb}</span>}
						<span className="pkfa-name">{display.primary}</span>
						{display.secondary && <span className="pkfa-sub">{display.secondary}</span>}
					</span>
					{summary && <span className="pkfa-fold-sum">{summary}</span>}
					<Button
						variant="unstyled"
						type="button"
						className={`pkfa-add-btn${inTray ? ' is-in-tray' : ''}`}
						aria-label="Add to tray"
						title="Add to tray"
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
					className={`pkfa-kids${isFrontmatter ? ' pkfa-frontmatter-kids' : ''}${
						isCollapsed ? ' is-collapsed' : ''
					}`}
				>
					{block.children!.map((child) => (
						<AtlasNode key={child.id} block={child} depth={depth + 1} {...props} />
					))}
				</div>
			)}
		</>
	);
};
