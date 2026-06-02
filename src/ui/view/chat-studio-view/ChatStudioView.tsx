import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectListViewComponent } from '@/ui/view/project-list-view/ProjectListView';
import { ConversationIndex } from '@/ui/view/chat-view/components/ConversationIndex';
import { ChatViewComponent } from '@/ui/view/chat-view/ChatViewComponent';

const LEFT_DEFAULT = 280;
const LEFT_MIN = 200;
const LEFT_MAX = 500;
const RIGHT_DEFAULT = 320;
const RIGHT_MIN = 240;
const RIGHT_MAX = 480;

/**
 * ChatStudioPanel — single-leaf three-column chat workspace.
 *
 * Left:   ProjectListViewComponent — same toolbar (Home / Refresh / Collapse)
 *         + search + ProjectsSection + ConversationsSection as the legacy
 *         left sidebar leaf. Reused as-is to keep feature parity.
 * Middle: ChatViewComponent — full router (Home / AllProjects / Messages /
 *         ProjectOverview / etc).
 * Right:  ConversationIndex — 4-tab outline.
 *
 * All three columns share `chatViewStore` + `chatDataStore` (Zustand
 * singletons), so navigation and selection stay coherent across columns
 * without any prop drilling.
 */
export const ChatStudioPanel: React.FC = () => {
	const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
	const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);

	return (
		<div className="pktw-flex pktw-h-full pktw-w-full pktw-overflow-hidden">
			<div
				className="pktw-h-full pktw-overflow-auto pktw-border-r pktw-border-border"
				style={{ width: leftWidth, flexShrink: 0 }}
			>
				<ProjectListViewComponent />
			</div>
			<StudioResizerHandle
				onResize={(dx) => setLeftWidth((w) => clamp(w + dx, LEFT_MIN, LEFT_MAX))}
			/>
			<div className="pktw-flex-1 pktw-min-w-0 pktw-h-full pktw-overflow-hidden">
				<ChatViewComponent />
			</div>
			<StudioResizerHandle
				onResize={(dx) => setRightWidth((w) => clamp(w - dx, RIGHT_MIN, RIGHT_MAX))}
			/>
			<div
				className="pktw-h-full pktw-overflow-auto pktw-border-l pktw-border-border"
				style={{ width: rightWidth, flexShrink: 0 }}
			>
				<ConversationIndex />
			</div>
		</div>
	);
};

function clamp(v: number, min: number, max: number): number {
	if (v < min) return min;
	if (v > max) return max;
	return v;
}

interface StudioResizerHandleProps {
	onResize: (dx: number) => void;
}

const StudioResizerHandle: React.FC<StudioResizerHandleProps> = ({ onResize }) => {
	const lastXRef = useRef<number | null>(null);
	const onResizeRef = useRef(onResize);
	useEffect(() => {
		onResizeRef.current = onResize;
	}, [onResize]);

	useEffect(() => {
		// If we unmount mid-drag, null the tracking ref so any lingering
		// document-level handleMove becomes a no-op until the user releases
		// the mouse (at which point handleUp self-removes both listeners).
		return () => {
			lastXRef.current = null;
		};
	}, []);

	const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		lastXRef.current = e.clientX;
		// CRITICAL: detached Obsidian windows have their own `document`.
		// Listening on the global `document` would miss mouse events when
		// the user drags inside the Studio window. Always listen on the
		// handle's ownerDocument so the drag works in both regular tabs
		// and detached windows.
		const ownerDoc = e.currentTarget.ownerDocument;
		const handleMove = (ev: MouseEvent) => {
			if (lastXRef.current === null) return;
			const dx = ev.clientX - lastXRef.current;
			lastXRef.current = ev.clientX;
			onResizeRef.current(dx);
		};
		const handleUp = () => {
			lastXRef.current = null;
			ownerDoc.removeEventListener('mousemove', handleMove);
			ownerDoc.removeEventListener('mouseup', handleUp);
		};
		ownerDoc.addEventListener('mousemove', handleMove);
		ownerDoc.addEventListener('mouseup', handleUp);
	}, []);

	return (
		<div
			className="pktw-w-1.5 pktw-h-full pktw-cursor-col-resize pktw-bg-border/60 hover:pktw-bg-accent pktw-transition-colors"
			style={{ flexShrink: 0 }}
			onMouseDown={handleMouseDown}
		/>
	);
};
