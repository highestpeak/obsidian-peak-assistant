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

export interface TrayItem {
	id: string;
	title: string;
	kind: string;
}

interface AtlasTrayProps {
	items: TrayItem[];
	config: FileAtlasConfig;
	onRemove: (id: string) => void;
}

const MAX_CHIPS = 4;

export const AtlasTray: React.FC<AtlasTrayProps> = ({ items, config, onRemove }) => {
	const shown = items.slice(0, MAX_CHIPS);
	const overflow = items.length - MAX_CHIPS;

	return (
		<footer className="pkfa-tray">
			<span className="pkfa-tray-title">
				<Inbox />
				{config.strings.trayTitle}
				<span className="pkfa-tray-count">{items.length}</span>
			</span>
			<div className="pkfa-tray-items">
				{shown.map((item) => {
					const Icon = iconForKind(item.kind);
					return (
						<span className="pkfa-chip" key={item.id}>
							<Icon />
							<span>{item.title}</span>
							<Button
								variant="unstyled"
								type="button"
								className="pkfa-chip-remove"
								aria-label={`Remove ${item.title}`}
								onClick={() => onRemove(item.id)}
							>
								<X />
							</Button>
						</span>
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
