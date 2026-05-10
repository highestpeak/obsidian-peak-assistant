import React from 'react';
import { MessageSquare, Bot, ListChecks, Palette, Ruler, Wrench, type LucideIcon } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { ConversationType } from '@/service/chat/conversation-types';

const ICONS: Record<string, LucideIcon> = {
	chat: MessageSquare,
	agent: Bot,
	plan: ListChecks,
	canvas: Palette,
	template: Ruler,
	custom: Wrench,
};

export const ConversationTypeIcon: React.FC<{ type: ConversationType; className?: string }> = ({ type, className }) => {
	const Icon = ICONS[type.kind] ?? MessageSquare;
	return <Icon className={cn('pktw-w-4 pktw-h-4', className)} />;
};
