import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CuratorPushModal } from './CuratorPushModal';
import { registerMessageReceiptRenderer } from '@/ui/view/chat-view/integration/messageReceiptSlot';
import { InlineReceipt } from '../components/InlineReceipt';

/**
 * Mounts a hidden React root at plugin init that hosts the curator-push
 * Modal and registers the dashboard's contribution to the chat message
 * receipt slot (carrier A). The composer slot (carrier C / ContextRing)
 * is intentionally not registered: chat-side never pushed context
 * utilization updates, so the slot stayed empty in production. The
 * Overview screen reads `useCurrentContextUtilization` directly when
 * data is available.
 */
export function mountCuratorPushRoot(): () => void {
	registerMessageReceiptRenderer((props) => React.createElement(InlineReceipt, props));

	let root: Root | null = null;
	let host: HTMLElement | null = null;

	try {
		host = document.createElement('div');
		host.classList.add('peak-design-root', 'usage-dashboard', 'peak-curator-push-root');
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
