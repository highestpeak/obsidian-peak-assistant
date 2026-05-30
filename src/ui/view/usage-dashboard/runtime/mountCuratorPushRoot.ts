import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CuratorPushModal } from './CuratorPushModal';
import { registerMessageReceiptRenderer } from '../integration/chatBridge';
import { registerComposerSlotRenderer } from '../integration/chatBridge';
import { InlineReceipt } from '../components/InlineReceipt';
import { ContextRing } from '../components/ContextRing';

/**
 * Mounts a hidden React root at plugin init that hosts:
 *
 *   - `<CuratorPushModal>` — listens to the curator-push Zustand store,
 *     renders the recommendation Modal when triggered.
 *
 * Also registers the dashboard's contributions to the chat integration slots:
 *
 *   - `registerMessageReceiptRenderer(<InlineReceipt>)` — carrier A.
 *   - `registerComposerSlotRenderer(<ContextRing>)` — carrier C.
 *
 * Returns an unmount function for the unload path.
 */
export function mountCuratorPushRoot(): () => void {
	registerMessageReceiptRenderer((props) => React.createElement(InlineReceipt, props));
	registerComposerSlotRenderer(() => React.createElement(ContextRing));

	let root: Root | null = null;
	let host: HTMLElement | null = null;

	try {
		host = document.createElement('div');
		host.classList.add('peak-design-root', 'usage-dashboard', 'peak-curator-push-root');
		// Keep the host inert visually; the Modal portal handles its own overlay.
		host.style.position = 'fixed';
		host.style.zIndex = '0';
		host.style.width = '0';
		host.style.height = '0';
		host.style.overflow = 'hidden';
		document.body.appendChild(host);

		root = createRoot(host);
		root.render(React.createElement(CuratorPushModal));
	} catch (e) {
		console.warn('[Peak Assistant] Failed to mount Curator push root:', e);
	}

	return () => {
		try { root?.unmount(); } catch { /* ignore */ }
		root = null;
		if (host && host.parentNode) host.parentNode.removeChild(host);
		host = null;
	};
}
