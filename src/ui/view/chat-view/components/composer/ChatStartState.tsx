import React from 'react';
import { History, FileText, Search, Route, Sparkles, type LucideIcon } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { useComposerStore } from '../../store/composerStore';
import { useChatStudioStrings } from '../../chatStudioStringsContext';

type StartScope = 'newChat' | 'project';

/**
 * Config-driven Lucide map for starter icons (chat-studio §7.1). Keys match the
 * `icon` field in `templates/config/chat-studio.json` starters — never a label.
 */
const STARTER_ICONS: Record<string, LucideIcon> = {
	history: History,
	'file-text': FileText,
	search: Search,
	route: Route,
};
const STARTER_ICON_FALLBACK: LucideIcon = Sparkles;

/**
 * New-conversation greeting (chat-studio §7.1). Two-line block: title + a short
 * configurable subtitle. Rendered ABOVE the composer. Starters are a separate
 * <ChatStarters /> rendered BELOW the composer (mock DOM order:
 * greeting → composer → starters).
 */
export const ChatStartState: React.FC<{ scope?: StartScope }> = ({ scope = 'newChat' }) => {
	const strings = useChatStudioStrings();
	const isProject = scope === 'project';
	const title = isProject ? strings.greeting.project : strings.greeting.newChat;
	const subtitle = isProject ? strings.greeting.projectSubtitle : strings.greeting.newChatSubtitle;

	return (
		<div className={`pkchat-start-greeting${isProject ? ' pkchat-start-greeting--project' : ''}`}>
			<span className="pkchat-start-greeting__title">{title}</span>
			{subtitle && <span className="pkchat-start-greeting__subtitle">{subtitle}</span>}
		</div>
	);
};

/**
 * Starter pills (chat-studio §7.1). Placed AFTER the composer. Each starter only
 * fills the editable draft — never auto-sends (C-EMPTY-03). Once the draft has
 * content the row fades out (opacity + translate) rather than unmounting, so the
 * composer does not jump.
 */
export const ChatStarters: React.FC<{ scope?: StartScope }> = ({ scope = 'newChat' }) => {
	const strings = useChatStudioStrings();
	const activeKey = useComposerStore((s) => s.activeKey);
	const hasDraft = useComposerStore((s) => (s.drafts[s.activeKey]?.text ?? '').trim().length > 0);

	const isProject = scope === 'project';
	const starters = isProject ? strings.starters.project : strings.starters.newChat;

	const fill = (draft: string) => {
		const store = useComposerStore.getState();
		store.updateDraft({ text: draft }, activeKey);
		store.requestComposerFocus();
	};

	return (
		<div
			className={`pkchat-starters${isProject ? ' pkchat-starters--project' : ''}`}
			data-has-draft={hasDraft ? 'true' : 'false'}
			aria-hidden={hasDraft ? true : undefined}
		>
			{starters.slice(0, 3).map((starter) => {
				const Icon = STARTER_ICONS[starter.icon] ?? STARTER_ICON_FALLBACK;
				return (
					<Button
						key={starter.id}
						variant="ghost"
						className="pkchat-starter"
						tabIndex={hasDraft ? -1 : 0}
						onClick={() => fill(starter.draft)}
					>
						<Icon />
						<span>{starter.label}</span>
					</Button>
				);
			})}
		</div>
	);
};
