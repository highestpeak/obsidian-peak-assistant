/**
 * File Atlas — Selection Tray (Phase 1).
 *
 * Bottom-docked tray of collected blocks. Chips are removable; >4 collapse into
 * a "+N more" chip. "Send to Copilot" is disabled (Phase 3 handoff) with a
 * tooltip. This is a context-collection surface, not an execution panel.
 */

import React from 'react';
import { Send, X, Inbox } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { iconForKind } from '../config/kindIcons';
import type { FileAtlasConfig } from '../config/fileAtlasConfig';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_KEYBOARD_ZONE_LABELS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

export interface TrayItem {
	id: string;
	title: string;
	kind: string;
	path?: string;
}

interface AtlasTrayProps {
	items: TrayItem[];
	config: FileAtlasConfig;
	onRemove: (id: string) => void;
	onReveal: (item: TrayItem) => void;
}

const MAX_CHIPS = 4;

export const AtlasTray: React.FC<AtlasTrayProps> = ({ items, config, onRemove, onReveal }) => {
	const shown = items.slice(0, MAX_CHIPS);
	const overflow = items.length - MAX_CHIPS;
	const itemsRef = React.useRef<HTMLDivElement>(null);
	useRovingComposite(itemsRef, {
		itemSelector: '[role="option"]',
		orientation: 'horizontal',
		rememberBy: 'data-tray-id',
	});

	return (
		<footer
			className="pkfa-tray"
			data-peak-keyboard-zone={items.length > 0 ? 'fa-selection-tray' : undefined}
			data-peak-keyboard-zone-label={
				items.length > 0 ? PEAK_KEYBOARD_ZONE_LABELS['fa-selection-tray'] : undefined
			}
			data-peak-keyboard-order={items.length > 0 ? '5' : undefined}
		>
			<span className="pkfa-tray-title">
				<Inbox />
				{config.strings.trayTitle}
				<span className="pkfa-tray-count">{items.length}</span>
			</span>
			<div ref={itemsRef} className="pkfa-tray-items" role="listbox" aria-label={config.strings.trayTitle}>
				{shown.map((item) => {
					const Icon = iconForKind(item.kind);
					return (
						<div
							className="pkfa-chip"
							key={item.id}
							role="option"
							tabIndex={item === shown[0] ? 0 : -1}
							aria-selected="true"
							data-tray-id={item.id}
							data-peak-focus-id={item.id}
							onKeyDown={(event) => {
								if (event.key === 'Delete' || event.key === 'Backspace') {
									event.preventDefault();
									onRemove(item.id);
									return;
								}
								if (event.key === 'Enter') {
									event.preventDefault();
									onReveal(item);
								}
							}}
						>
							<Icon />
							<span>{item.title}</span>
							<Button
								variant="unstyled"
								type="button"
								className="pkfa-chip-remove"
								aria-label={`Remove ${item.title}`}
								tabIndex={-1}
								onClick={() => onRemove(item.id)}
							>
								<X />
							</Button>
						</div>
					);
				})}
				{overflow > 0 && <span className="pkfa-chip pkfa-overflow">+{overflow} more</span>}
			</div>
			<Button
				variant="unstyled"
				type="button"
				className="pkfa-primary-btn"
				disabled
				title={config.strings.sendToCopilotHint}
			>
				<Send />
				{config.strings.sendToCopilot}
			</Button>
		</footer>
	);
};
