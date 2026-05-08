import React, { useMemo, useState, useRef } from 'react';
import { ChatMessage } from '@/service/chat/types';
import { cn } from '@/ui/react/lib/utils';
import { Copy, RefreshCw, Star, Check, ChevronDown } from 'lucide-react';
import { MessageAction } from '@/ui/component/ai-elements';
import { formatTimestampLocale } from '@/core/utils/date-utils';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { ProviderBrandIcon } from '@/ui/component/mine/provider-brand-icons';

// ── Metadata helpers (assistant messages only) ────────────────────────

/**
 * Inline model badge: "provider/model" in mono text on muted background.
 */
const ModelBadge: React.FC<{ message: ChatMessage }> = ({ message }) => {
	const modelInfo = useMemo(() => {
		if (!message.model) return null;
		return `${message.provider || ''}/${message.model}`.replace(/^\//, '');
	}, [message.model, message.provider]);

	if (!modelInfo) return null;

	return (
		<span className="pktw-text-[9px] pktw-font-mono pktw-text-muted-foreground pktw-bg-muted pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-select-text">
			{modelInfo}
		</span>
	);
};

/**
 * Inline token count.
 */
const TokenBadge: React.FC<{ message: ChatMessage }> = ({ message }) => {
	const tokenCount = useMemo(() => {
		if (!message.tokenUsage) return null;
		const usage = message.tokenUsage as any;
		return usage.totalTokens ?? usage.total_tokens ??
			((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
	}, [message.tokenUsage]);

	if (tokenCount === null) return null;

	return (
		<span className="pktw-text-[9px] pktw-font-mono pktw-text-muted-foreground pktw-select-text">
			{tokenCount} tok
		</span>
	);
};

/**
 * Inline timestamp — short format (time only for today, date+time otherwise).
 */
const TimestampBadge: React.FC<{ message: ChatMessage }> = ({ message }) => {
	const timeStr = useMemo(() => {
		if (!message.createdAtTimestamp) return null;
		const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		return formatTimestampLocale(message.createdAtTimestamp, userTimezone);
	}, [message.createdAtTimestamp]);

	if (!timeStr) return null;

	return (
		<span className="pktw-text-[9px] pktw-font-mono pktw-text-muted-foreground pktw-select-text">
			{timeStr}
		</span>
	);
};

/** Small separator dot between metadata items. */
const Dot: React.FC = () => (
	<span className="pktw-text-[8px] pktw-text-muted-foreground pktw-select-none">·</span>
);

/** Thin vertical separator between metadata and actions. */
const Separator: React.FC<{ className?: string }> = ({ className }) => (
	<span className={cn("pktw-w-px pktw-h-3 pktw-bg-border pktw-mx-0.5", className)} />
);

/**
 * Split button: click regenerates with current model, chevron opens model picker.
 */
const RegenerateWithModelButton: React.FC<{
	messageId: string;
	models: ModelInfoForSwitch[];
	onRegenerate: (messageId: string, modelOverride?: { provider: string; modelId: string }) => void;
}> = ({ messageId, models, onRegenerate }) => {
	const [showPicker, setShowPicker] = useState(false);
	const triggerRef = useRef<HTMLDivElement>(null);
	const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

	const handleTogglePicker = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (showPicker) {
			setShowPicker(false);
			return;
		}
		// Calculate position relative to viewport so popover escapes overflow:hidden parents
		if (triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			setPickerPos({ top: rect.top, left: rect.left });
		}
		setShowPicker(true);
	};

	return (
		<div className="pktw-relative pktw-flex pktw-items-center" ref={triggerRef}>
			<MessageAction
				tooltip="Regenerate response"
				label="Regenerate response"
				className="pktw-h-6 pktw-w-6 pktw-rounded-r-none"
				onClick={(e) => {
					e.stopPropagation();
					onRegenerate(messageId);
				}}
			>
				<RefreshCw size={16} strokeWidth={2} />
			</MessageAction>
			<MessageAction
				tooltip="Regenerate with different model"
				label="Choose model"
				className="pktw-h-6 pktw-w-4 pktw-rounded-l-none pktw-border-l pktw-border-border"
				onClick={handleTogglePicker}
			>
				<ChevronDown size={12} strokeWidth={2} />
			</MessageAction>

			{showPicker && pickerPos && (
				<ModelPickerPopover
					models={models}
					position={pickerPos}
					onSelect={(provider, modelId) => {
						setShowPicker(false);
						onRegenerate(messageId, { provider, modelId });
					}}
					onClose={() => setShowPicker(false)}
				/>
			)}
		</div>
	);
};

/**
 * Floating model picker popover — shows available models grouped by provider.
 */
const ModelPickerPopover: React.FC<{
	models: ModelInfoForSwitch[];
	position: { top: number; left: number };
	onSelect: (provider: string, modelId: string) => void;
	onClose: () => void;
}> = ({ models, position, onSelect, onClose }) => {
	const ref = useRef<HTMLDivElement>(null);

	// Close on click outside
	React.useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		};
		document.addEventListener('mousedown', handler);
		return () => document.removeEventListener('mousedown', handler);
	}, [onClose]);

	// Group models by provider
	const grouped = useMemo(() => {
		const map = new Map<string, ModelInfoForSwitch[]>();
		for (const m of models) {
			const list = map.get(m.provider) || [];
			list.push(m);
			map.set(m.provider, list);
		}
		return map;
	}, [models]);

	return (
		<div
			ref={ref}
			className="pktw-fixed pktw-z-[9999] pktw-bg-popover pktw-border pktw-border-border pktw-rounded-md pktw-shadow-lg pktw-py-1 pktw-min-w-[200px] pktw-max-h-[240px] pktw-overflow-y-auto"
			style={{ top: position.top - 4, left: position.left, transform: 'translateY(-100%)' }}
		>
			{[...grouped.entries()].map(([provider, providerModels]) => (
				<div key={provider}>
					<div className="pktw-px-3 pktw-py-1 pktw-text-[10px] pktw-font-medium pktw-text-muted-foreground pktw-uppercase pktw-tracking-wide">
						{provider}
					</div>
					{providerModels.map((m) => (
						<div
							key={`${m.provider}-${m.id}`}
							className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-cursor-pointer hover:pktw-bg-accent pktw-rounded-sm pktw-mx-1"
							onClick={() => onSelect(m.provider, m.id)}
						>
							<ProviderBrandIcon provider={m.provider} size={14} />
							<span className="pktw-text-xs pktw-truncate">{m.displayName}</span>
						</div>
					))}
				</div>
			))}
		</div>
	);
};

// ── Main component ────────────────────────────────────────────────────

export const MessageActionsList: React.FC<{
	message: ChatMessage;
	isStreaming: boolean;
	isLastMessage?: boolean;
	copied: boolean;
	models: ModelInfoForSwitch[];
	onToggleStar: (messageId: string, starred: boolean) => void;
	onCopy: () => void;
	onRegenerate: (messageId: string, modelOverride?: { provider: string; modelId: string }) => void;
}> = ({ message, isStreaming, isLastMessage, copied, models, onToggleStar, onCopy, onRegenerate }) => {
	if (isStreaming) return null;

	const isAssistant = message.role === 'assistant';

	// Action buttons: always visible on last message, hover-fade on others
	const hoverFade = isLastMessage ? "" : "pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity";

	// ── Assistant messages: metadata (always visible) + actions (hover-fade) ──
	if (isAssistant) {
		return (
			<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mt-1 pktw-flex-wrap">
				{/* Always-visible metadata */}
				<ModelBadge message={message} />
				<TokenBadge message={message} />
				{(message.tokenUsage || message.model) && message.createdAtTimestamp && <Dot />}
				<TimestampBadge message={message} />

				{/* Separator between metadata and actions */}
				<Separator className={hoverFade} />

				{/* Hover-fade action buttons */}
				<div className={cn("pktw-flex pktw-items-center pktw-gap-0.5", hoverFade)}>
					<MessageAction
						tooltip={copied ? 'Copied!' : 'Copy message'}
						label="Copy message"
						className="pktw-h-6 pktw-w-6 pktw-rounded"
						onClick={(e) => {
							e.stopPropagation();
							onCopy();
						}}
					>
						{copied ? (
							<Check size={16} strokeWidth={copied ? 3 : 2} />
						) : (
							<Copy size={16} strokeWidth={2} />
						)}
					</MessageAction>

					<RegenerateWithModelButton
						messageId={message.id}
						models={models}
						onRegenerate={onRegenerate}
					/>

					<MessageAction
						tooltip={message.starred ? 'Unstar message' : 'Star message'}
						label={message.starred ? 'Unstar message' : 'Star message'}
						className="pktw-h-6 pktw-w-6 pktw-rounded"
						onClick={(e) => {
							e.stopPropagation();
							onToggleStar(message.id, !message.starred);
						}}
					>
						<Star
							size={16}
							strokeWidth={2}
							className={cn(message.starred && 'pktw-fill-red-500 pktw-text-red-500')}
						/>
					</MessageAction>
				</div>
			</div>
		);
	}

	// User messages handled directly in MessageViewItem
	return null;
};
