import React, { useState } from 'react';
import { Database, Globe, Briefcase, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, Chip } from '@/ui/components/primitives';
import { useComposerStore } from '../../store/composerStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

/**
 * Source combinator (chat-studio §8.4 / COMP-04).
 *
 * Project base is ALWAYS included for project conversations — shown as an
 * "Always" badge, never a disabled switch. Vault and Web search are
 * independent switches; the popover stays open so users can combine them.
 * Vault Search renders unavailable while the retrieval port is unwired
 * (RUN-01) — it is never a fake toggle. Rows are flat (mock source menu):
 * icon box + name + static purpose subtitle + switch/badge.
 */

const SourceToggleRow: React.FC<{
	icon: React.ReactNode;
	label: string;
	description: string;
	on: boolean;
	disabled?: boolean;
	disabledReason?: string;
	onToggle: () => void;
}> = ({ icon, label, description, on, disabled, disabledReason, onToggle }) => (
	<button
		type="button"
		className="pkchat-runpop__row pkchat-runpop__row--flat pkchat-runpop__row--toggle"
		data-on={on && !disabled ? 'true' : undefined}
		disabled={disabled}
		aria-pressed={on && !disabled}
		onClick={(e) => {
			e.preventDefault();
			if (!disabled) onToggle();
		}}
	>
		<span className="pkchat-runpop__row-ico">{icon}</span>
		<span className="pkchat-runpop__row-body">
			<span className="pkchat-runpop__row-name">{label}</span>
			<span className="pkchat-runpop__row-sub">{disabled && disabledReason ? disabledReason : description}</span>
		</span>
		{!disabled && <span className="pkchat-runpop__switch" aria-hidden />}
	</button>
);

function useSourceSummary(projectIncluded: boolean, vault: boolean, web: boolean): string {
	const strings = useChatStudioStrings();
	const parts: string[] = [];
	if (projectIncluded) parts.push(strings.composer.sourceProject);
	if (vault) parts.push(strings.composer.sourceVault);
	if (web) parts.push(strings.composer.sourceWeb);
	return parts.length > 0 ? parts.join(' + ') : strings.composer.sourceSummaryNone;
}

export const ComposerSourcesPopover: React.FC<{
	onSurfaceOpenChange?: (open: boolean) => void;
}> = ({ onSurfaceOpenChange }) => {
	const strings = useChatStudioStrings();
	const { manager } = useServiceContext();
	const [open, setOpen] = useState(false);
	const changeOpen = (next: boolean) => {
		setOpen(next);
		onSurfaceOpenChange?.(next);
	};

	const activeKey = useComposerStore((s) => s.activeKey);
	const draft = useComposerStore((s) => s.drafts[activeKey]);
	const activeProject = useChatDataStore((s) => s.activeProject);
	const vaultAvailable = manager.conv.isVaultSearchAvailable();

	const vaultOn = draft?.vaultSearch ?? false;
	const webOn = draft?.webSearch ?? false;
	const projectIncluded = activeProject != null;
	const summary = useSourceSummary(projectIncluded, vaultOn && vaultAvailable, webOn);

	const toggleVault = () => {
		const next = !vaultOn;
		useComposerStore.getState().updateDraft({ vaultSearch: next });
		useChatViewStore.getState().setEnableVaultSearch(next);
	};
	const toggleWeb = () => {
		const next = !webOn;
		useComposerStore.getState().updateDraft({ webSearch: next });
		useChatViewStore.getState().setEnableWebSearch(next);
	};

	return (
		<Popover open={open} onOpenChange={changeOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="pkchat-run-chip pkchat-run-chip--ghost"
					data-state={open ? 'open' : 'closed'}
					aria-label={strings.composer.sourcesLabel}
					title={strings.composer.sourcesLabel}
					data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.chatStudio.composer.sources}
					data-peak-keytip-label={strings.composer.sourcesLabel}
				>
					<Database aria-hidden />
					<span className="pkchat-run-chip__mid">{summary}</span>
					<ChevronDown />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" side="top" sideOffset={8} className="pktw-p-0">
				<div className="pkchat-runpop pkchat-runpop--sources">
					<div className="pkchat-runpop__head">
						<span className="pkchat-runpop__title">{strings.composer.sourcesMenuTitle}</span>
						<span className="pkchat-runpop__sub">{strings.composer.sourcesSubtitle}</span>
					</div>
					{projectIncluded && (
						<div className="pkchat-runpop__row pkchat-runpop__row--flat" data-selected="true">
							<span className="pkchat-runpop__row-ico"><Briefcase /></span>
							<span className="pkchat-runpop__row-body">
								<span className="pkchat-runpop__row-name">{strings.composer.sourceProject}</span>
								<span className="pkchat-runpop__row-sub">{strings.composer.sourceProjectDescription}</span>
							</span>
							<Chip variant="neutral">{strings.composer.sourceProjectAlways}</Chip>
						</div>
					)}
					<SourceToggleRow
						icon={<Database />}
						label={strings.composer.sourceVault}
						description={strings.composer.sourceVaultDescription}
						on={vaultOn}
						disabled={!vaultAvailable}
						disabledReason={strings.composer.sourceVaultUnavailable}
						onToggle={toggleVault}
					/>
					<SourceToggleRow
						icon={<Globe />}
						label={strings.composer.sourceWeb}
						description={strings.composer.sourceWebDescription}
						on={webOn}
						onToggle={toggleWeb}
					/>
				</div>
			</PopoverContent>
		</Popover>
	);
};
