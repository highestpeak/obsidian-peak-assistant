import React, { useState } from 'react';
import { Notice } from 'obsidian';
import { Globe, BookOpen, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useChatViewStore } from '../../store/chatViewStore';
import { CAPABILITY_SUGGESTION_PATTERNS } from '@/core/constant';
import type { ChatMessage } from '@/service/chat/types';

type SuggestionKind = 'webSearch' | 'vaultSearch';

interface SuggestionConfig {
	icon: React.ElementType;
	label: string;
	description: string;
	enableAction: () => void;
}

const SUGGESTION_CONFIGS: Record<SuggestionKind, SuggestionConfig> = {
	webSearch: {
		icon: Globe,
		label: 'Enable Web Search',
		description: 'This might need web access.',
		enableAction: () => {
			useChatViewStore.getState().setEnableWebSearch(true);
			new Notice('Web Search enabled — try asking again');
		},
	},
	vaultSearch: {
		icon: BookOpen,
		label: 'Enable Vault Search',
		description: 'This might need access to your notes.',
		enableAction: () => {
			useChatViewStore.getState().setEnableVaultSearch(true);
			new Notice('Vault Search enabled — try asking again');
		},
	},
};

function detectSuggestion(text: string): SuggestionKind | null {
	const { enableWebSearch, enableVaultSearch } = useChatViewStore.getState();

	if (!enableWebSearch) {
		for (const pattern of CAPABILITY_SUGGESTION_PATTERNS.webSearch) {
			if (pattern.test(text)) return 'webSearch';
		}
	}

	if (!enableVaultSearch) {
		for (const pattern of CAPABILITY_SUGGESTION_PATTERNS.vaultSearch) {
			if (pattern.test(text)) return 'vaultSearch';
		}
	}

	return null;
}

export function CapabilitySuggestion({ message }: { message: ChatMessage }) {
	const [dismissed, setDismissed] = useState(false);

	if (dismissed || message.role !== 'assistant') return null;

	const text = typeof message.content === 'string' ? message.content : '';
	const kind = detectSuggestion(text);
	if (!kind) return null;

	const config = SUGGESTION_CONFIGS[kind];
	const Icon = config.icon;

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-2 pktw-min-h-[38px] pktw-px-2 pktw-py-1.5 pktw-rounded-md pktw-bg-pk-surface-raised pktw-border pktw-border-pk-border-soft pktw-text-pk-sm">
			<Icon className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-text-tertiary pktw-flex-shrink-0" />
			<span className="pktw-flex-1 pktw-min-w-0 pktw-text-pk-text-secondary">{config.description}</span>
			<Button
				variant="outline"
				size="sm"
				className="pktw-ml-auto pktw-h-6 pktw-text-pk-sm"
				onClick={() => {
					config.enableAction();
					setDismissed(true);
				}}
			>
				{config.label}
			</Button>
			<button
				onClick={() => setDismissed(true)}
				className="pktw-p-0.5 pktw-rounded hover:pktw-bg-pk-surface-sunken pktw-text-pk-text-tertiary"
				aria-label="Dismiss"
			>
				<X className="pktw-w-3 pktw-h-3" />
			</button>
		</div>
	);
}
