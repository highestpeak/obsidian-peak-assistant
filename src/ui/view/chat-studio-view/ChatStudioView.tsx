import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationList } from '@/ui/view/chat-view/components/conversation-list';
import { ConversationIndex } from '@/ui/view/chat-view/components/ConversationIndex';
import { ChatViewComponent } from '@/ui/view/chat-view/ChatViewComponent';
import { useChatViewStore, ViewMode } from '@/ui/view/chat-view/store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';

const LEFT_DEFAULT = 280;
const LEFT_MIN = 200;
const LEFT_MAX = 500;
const RIGHT_DEFAULT = 320;
const RIGHT_MIN = 240;
const RIGHT_MAX = 480;

/**
 * ChatStudioPanel — single-leaf three-column chat workspace.
 *
 * Renders ConversationList | ChatViewComponent | ConversationIndex side by
 * side inside one Obsidian leaf (opened as a detached window via
 * workspace.getLeaf('window')). All three columns share chatViewStore so
 * navigation and state stay coherent without prop drilling.
 */
export const ChatStudioPanel: React.FC = () => {
	const viewMode = useChatViewStore((s) => s.viewMode);
	const projectForOverview = useChatViewStore((s) => s.projectForOverview);
	const activeConversation = useChatDataStore((s) => s.activeConversation);

	const leftProjectId = derivedProjectId(
		viewMode,
		projectForOverview?.meta.id,
		activeConversation?.meta.projectId,
	);

	const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
	const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);

	return (
		<div className="pktw-flex pktw-h-full pktw-w-full pktw-overflow-hidden">
			<div
				className="pktw-h-full pktw-overflow-auto pktw-border-r pktw-border-border"
				style={{ width: leftWidth, flexShrink: 0 }}
			>
				<ConversationList
					projectId={leftProjectId}
					containerClass="pktw-w-full pktw-px-2 pktw-py-2"
					maxPreviewLength={60}
					emptyText="No conversations."
				/>
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

function derivedProjectId(
	viewMode: ViewMode | null,
	overviewProjectId: string | undefined,
	convProjectId: string | undefined,
): string | undefined {
	if (viewMode === ViewMode.PROJECT_OVERVIEW || viewMode === ViewMode.PROJECT_CONVERSATIONS_LIST) {
		return overviewProjectId;
	}
	if (viewMode === ViewMode.CONVERSATION_IN_PROJECT) {
		return convProjectId;
	}
	return undefined;
}

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

	const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		lastXRef.current = e.clientX;
		const handleMove = (ev: MouseEvent) => {
			if (lastXRef.current === null) return;
			const dx = ev.clientX - lastXRef.current;
			lastXRef.current = ev.clientX;
			onResizeRef.current(dx);
		};
		const handleUp = () => {
			lastXRef.current = null;
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleUp);
		};
		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleUp);
	}, []);

	return (
		<div
			className="pktw-w-1 pktw-h-full pktw-cursor-col-resize pktw-bg-border hover:pktw-bg-accent"
			style={{ flexShrink: 0 }}
			onMouseDown={handleMouseDown}
		/>
	);
};
