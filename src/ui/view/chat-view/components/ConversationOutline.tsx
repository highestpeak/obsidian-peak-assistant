import React, { useState } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { ChevronDown, ChevronRight, X } from 'lucide-react';

interface OutlineMessage {
	id: string;
	role: 'user' | 'assistant';
	content: string;
	topic?: string;
}

interface Props {
	messages: OutlineMessage[];
	activeMessageId: string | null;
	onMessageClick: (messageId: string) => void;
	onClose: () => void;
}

export const ConversationOutline: React.FC<Props> = ({ messages, activeMessageId, onMessageClick, onClose }) => {
	// Group messages by topic
	const groups = new Map<string, OutlineMessage[]>();
	for (const msg of messages) {
		const topic = msg.topic ?? 'General';
		if (!groups.has(topic)) groups.set(topic, []);
		groups.get(topic)!.push(msg);
	}

	return (
		<div className="pktw-w-[240px] pktw-border-l pktw-border-border pktw-flex pktw-flex-col pktw-h-full pktw-bg-background pktw-flex-shrink-0">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-3 pktw-py-2 pktw-border-b pktw-border-border">
				<span className="pktw-text-xs pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">Outline</span>
				<span
					className="pktw-cursor-pointer pktw-text-muted-foreground hover:pktw-text-foreground pktw-transition-colors"
					onClick={onClose}
				>
					<X size={14} />
				</span>
			</div>
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-py-1">
				{[...groups.entries()].map(([topic, msgs]) => (
					<TopicGroup
						key={topic}
						topic={topic}
						messages={msgs}
						activeMessageId={activeMessageId}
						onMessageClick={onMessageClick}
					/>
				))}
			</div>
		</div>
	);
};

const TopicGroup: React.FC<{
	topic: string;
	messages: OutlineMessage[];
	activeMessageId: string | null;
	onMessageClick: (id: string) => void;
}> = ({ topic, messages, activeMessageId, onMessageClick }) => {
	const [collapsed, setCollapsed] = useState(false);
	const Icon = collapsed ? ChevronRight : ChevronDown;

	return (
		<div>
			<div
				className="pktw-flex pktw-items-center pktw-gap-1 pktw-px-3 pktw-py-1.5 pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
				onClick={() => setCollapsed(!collapsed)}
			>
				<Icon size={12} className="pktw-text-muted-foreground" />
				<span className="pktw-text-[11px] pktw-font-semibold pktw-text-foreground">{topic}</span>
				<span className="pktw-text-[9px] pktw-text-muted-foreground pktw-ml-auto">{messages.length}</span>
			</div>
			{!collapsed && messages.map(msg => (
				<div
					key={msg.id}
					className={cn(
						"pktw-flex pktw-items-start pktw-gap-1.5 pktw-px-3 pktw-pl-6 pktw-py-1 pktw-cursor-pointer pktw-transition-colors",
						msg.id === activeMessageId
							? "pktw-border-l-2 pktw-border-l-[var(--pk-accent,#6d28d9)] pktw-bg-accent/5"
							: "hover:pktw-bg-muted"
					)}
					onClick={() => onMessageClick(msg.id)}
				>
					<span className="pktw-text-[9px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-flex-shrink-0 pktw-mt-px">
						{msg.role === 'user' ? 'You' : 'AI'}
					</span>
					<span className="pktw-text-[11px] pktw-text-muted-foreground pktw-line-clamp-2">{msg.content.slice(0, 100)}</span>
				</div>
			))}
		</div>
	);
};
