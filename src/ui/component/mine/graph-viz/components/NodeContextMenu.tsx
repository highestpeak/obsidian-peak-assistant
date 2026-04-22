/**
 * Built-in node context menu for GraphVisualization.
 * Renders when nodeContextMenu config is provided; items shown per callback presence.
 */

import React, { useEffect } from 'react';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import type { GraphVizNodeInfo } from '../types';
import type { NodeContextMenuConfig } from '../types';

/** Default copy implementation when onCopyLabel/onCopyPath are not provided. */
const defaultCopy = async (text: string) => {
	await navigator.clipboard.writeText(text);
};

/** Single menu row: label + optional icon, onClick. */
const ContextMenuItem: React.FC<{
	children: React.ReactNode;
	onClick: () => void | Promise<void>;
	disabled?: boolean;
	icon?: React.ReactNode;
	className?: string;
}> = ({ children, onClick, disabled, icon, className = '' }) => (
	<Button
		variant="ghost"
		size="sm"
		style={{ cursor: 'pointer' }}
		disabled={disabled}
		className={`pktw-shadow-none pktw-w-full pktw-flex pktw-justify-start pktw-text-[#2e3338] disabled:pktw-opacity-50 ${icon ? 'pktw-gap-2' : ''} ${className}`.trim()}
		onClick={onClick}
	>
		{icon ?? null}
		{children}
	</Button>
);

export type NodeContextMenuProps = {
	node: GraphVizNodeInfo;
	clientX: number;
	clientY: number;
	config: NodeContextMenuConfig;
	onClose: () => void;
	menuLeaveTimerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

export const NodeContextMenu: React.FC<NodeContextMenuProps> = ({
	node,
	clientX,
	clientY,
	config,
	onClose,
	menuLeaveTimerRef,
}) => {
	const {
		onOpenSource,
		onCopyLabel,
		onCopyPath,
		runGraphTool,
		pathStart,
		setPathStart,
		onOpenChatForNode,
		onToggleFollowup,
	} = config;

	const closeAnd = (fn: () => void | Promise<void>) => async () => {
		try {
			await fn();
		} finally {
			onClose();
		}
	};

	const hasPath = !!node.path;
	const hasChat = !!(onOpenChatForNode || onToggleFollowup);
	const hasGraphTools = !!runGraphTool && hasPath;
	const hasPathStart = !!(pathStart != null && setPathStart);

	return (
		<div
			data-graph-node-context-menu
			className="pktw-fixed pktw-z-[100] pktw-bg-white pktw-border pktw-border-pk-border pktw-rounded-md pktw-shadow-lg pktw-overflow-hidden pktw-min-w-[190px] pktw-transition-opacity pktw-duration-150 pktw-ease-out"
			style={{ left: clientX, top: clientY }}
			onMouseEnter={() => {
				if (menuLeaveTimerRef.current) {
					clearTimeout(menuLeaveTimerRef.current);
					menuLeaveTimerRef.current = null;
				}
			}}
			onMouseLeave={() => {
				menuLeaveTimerRef.current = setTimeout(() => {
					onClose();
					menuLeaveTimerRef.current = null;
				}, 600);
			}}
		>
			<div className="pktw-px-2.5 pktw-py-2 pktw-border-b pktw-border-[#f3f4f6]">
				<div className="pktw-text-xs pktw-font-semibold pktw-text-[#2e3338] pktw-truncate">
					{node.label || node.id}
				</div>
				<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-truncate">
					{node.path ? node.path : node.type}
				</div>
			</div>

			<div className="pktw-py-1">
				{hasPath && onOpenSource ? (
					<ContextMenuItem onClick={closeAnd(() => node.path && onOpenSource(node.path))}>
						Open
					</ContextMenuItem>
				) : null}

				{(node.label || node.id) ? (
					<ContextMenuItem
						onClick={closeAnd(() => (onCopyLabel ?? defaultCopy)(node.label || node.id || ''))}
					>
						Copy label
					</ContextMenuItem>
				) : null}

				{hasPath ? (
					<ContextMenuItem
						onClick={closeAnd(() => node.path && (onCopyPath ?? defaultCopy)(node.path))}
					>
						Copy path
					</ContextMenuItem>
				) : null}
			</div>

			{hasGraphTools ? (
				<div className="pktw-border-t pktw-border-[#f3f4f6] pktw-py-1">
					<ContextMenuItem
						onClick={closeAnd(() =>
							node.path && runGraphTool!('inspect_note_context', { note_path: node.path })
						)}
					>
						Inspect context
					</ContextMenuItem>
					<ContextMenuItem
						onClick={closeAnd(() =>
							node.path && runGraphTool!('graph_traversal', { start_note_path: node.path })
						)}
					>
						Expand neighborhood
					</ContextMenuItem>
					{hasPathStart ? (
						<>
							<ContextMenuItem
								onClick={() => {
									setPathStart!(node.path || null);
									onClose();
								}}
							>
								Set as path start
							</ContextMenuItem>
							<ContextMenuItem
								disabled={!pathStart || pathStart === node.path}
								className="pktw-px-3 pktw-py-2 pktw-text-xs"
								onClick={closeAnd(async () => {
									if (!node.path || !pathStart || pathStart === node.path) return;
									await runGraphTool!('find_path', {
										start_note_path: pathStart,
										end_note_path: node.path,
									});
								})}
							>
								Find path from start
								{pathStart ? (
									<span className="pktw-ml-2 pktw-text-[11px]">
										({pathStart.split('/').pop()})
									</span>
								) : null}
							</ContextMenuItem>
						</>
					) : null}
				</div>
			) : null}

			{hasChat ? (
				<div className="pktw-border-t pktw-border-[#f3f4f6] pktw-py-1">
					<ContextMenuItem
						icon={<MessageCircle className="pktw-w-3.5 pktw-h-3.5" />}
						onClick={() => {
							if (onOpenChatForNode) onOpenChatForNode(node);
							else onToggleFollowup?.();
							onClose();
						}}
					>
						Chat about this node
					</ContextMenuItem>
				</div>
			) : null}
		</div>
	);
};
