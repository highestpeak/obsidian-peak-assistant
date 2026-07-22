import React, { useState } from 'react';
import { Paperclip, BookOpen, Link, Plus } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger, IconButton, Button } from '@/ui/components/primitives';
import { usePromptInputContext } from '@/ui/component/prompt-input';
import { useComposerStore } from '../../store/composerStore';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';

/**
 * `+` menu — SOLE owner of INPUT-SIDE RESOURCE entry points (chat-studio
 * §8.3 / COMP-03): files/images (native dialog), Vault document (reuses the
 * `[[` picker), external link (adds a url ExplicitContextRef chip). Rows
 * carry a monogram icon box + title + purpose subtitle per the composer mock.
 *
 * Generation actions (Generate image / video / music) live on the `/` slash
 * palette (workflow + action surface) — NOT here. Keeping the `+` menu
 * strictly to "materials the user brings in" means the two entry points
 * cannot mint duplicate items, and the mental model is one-hop clear.
 */

export interface ComposerPlusMenuProps {
	/** Inserts text at the caret in the editor (used to open the `[[` picker). */
	insertAtCaret: (text: string) => void;
}

const MenuRow: React.FC<{
	icon: React.ReactNode;
	title: string;
	description: string;
	onClick: () => void;
	disabled?: boolean;
}> = ({ icon, title, description, onClick, disabled }) => (
	<button
		type="button"
		className="pkchat-plusmenu__row"
		onClick={onClick}
		disabled={disabled}
		aria-disabled={disabled}
	>
		<span className="pkchat-plusmenu__mono">{icon}</span>
		<span className="pktw-min-w-0">
			<span className="pktw-block pktw-truncate pktw-text-pk-sm pktw-font-semibold pktw-text-pk-text-primary">{title}</span>
			<span className="pktw-block pktw-truncate pktw-text-pk-xs pktw-text-pk-text-tertiary">{description}</span>
		</span>
	</button>
);

export const ComposerPlusMenu: React.FC<ComposerPlusMenuProps> = ({ insertAtCaret }) => {
	const strings = useChatStudioStrings();
	const { attachments } = usePromptInputContext();
	const [open, setOpen] = useState(false);
	const [linkMode, setLinkMode] = useState(false);
	const [linkValue, setLinkValue] = useState('');

	const addLink = () => {
		const url = linkValue.trim();
		if (!url) return;
		let title = url;
		try { title = new URL(url).hostname; } catch { /* keep raw */ }
		useComposerStore.getState().addExplicitRef({
			id: generateUuidWithoutHyphens(),
			kind: 'url',
			uri: url,
			title,
		});
		setLinkValue('');
		setLinkMode(false);
		setOpen(false);
	};

	return (
		<Popover
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) {
					setLinkMode(false);
					setLinkValue('');
				}
			}}
		>
			<PopoverTrigger asChild>
				<IconButton label={strings.composer.attachMenuLabel} title={strings.composer.attachMenuLabel}>
					<Plus />
				</IconButton>
			</PopoverTrigger>
			<PopoverContent align="start" side="top" sideOffset={8} className="pktw-p-0">
				<div className="pktw-w-[320px] pktw-p-1">
					<MenuRow
						icon={<Paperclip className="pktw-w-3.5 pktw-h-3.5" />}
						title={strings.composer.attachFilesLabel}
						description={strings.composer.attachFilesDescription}
						onClick={() => { attachments.openFileDialog(); setOpen(false); }}
					/>
					<MenuRow
						icon={<BookOpen className="pktw-w-3.5 pktw-h-3.5" />}
						title={strings.composer.attachVaultDocLabel}
						description={strings.composer.attachVaultDocDescription}
						onClick={() => { insertAtCaret('[['); setOpen(false); }}
					/>
					{!linkMode && (
						<MenuRow
							icon={<Link className="pktw-w-3.5 pktw-h-3.5" />}
							title={strings.composer.attachLinkLabel}
							description={strings.composer.attachLinkDescription}
							onClick={() => setLinkMode(true)}
						/>
					)}
					{linkMode && (
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2 pktw-py-1.5">
							<input
								type="text"
								autoFocus
								value={linkValue}
								onChange={(e) => setLinkValue(e.target.value)}
								onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
								placeholder={strings.composer.attachLinkPlaceholder}
								className="pktw-flex-1 pktw-min-w-0 pktw-bg-pk-surface-sunken pktw-border pktw-border-pk-border-soft pktw-rounded pktw-px-2 pktw-py-1 pktw-text-xs pktw-outline-none"
							/>
							<Button variant="secondary" size="sm" onClick={addLink} disabled={!linkValue.trim()}>
								{strings.projectHome.saveLabel}
							</Button>
						</div>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
};
