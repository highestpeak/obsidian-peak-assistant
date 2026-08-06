import { createRoot, Root } from 'react-dom/client';
import React from 'react';
import { PortalContainerProvider } from './PortalContainerContext';

/**
 * Stable per-`Document` identity counter. When a leaf is adopted into a
 * detached Obsidian popout window (`workspace.moveLeafToPopout`), its DOM
 * subtree — and therefore the React root's container — moves to a NEW
 * `Document` without the view being rebuilt. Every mount-time capture in the
 * subtree (ResizeObserver's window, IntersectionObserver scroll-spy, Radix
 * portal target) is then bound to the OLD window and stops working.
 *
 * We derive a React `key` from the container's owning `Document`. When a
 * re-render happens after adoption, the key changes, so React unmounts the
 * stale subtree and mounts a fresh one whose effects re-run in the correct
 * window. For views that never move between documents the key is stable, so
 * this is a no-op (no spurious remount).
 */
const documentKeys = new WeakMap<Document, number>();
let nextDocumentKey = 1;

function keyForDocument(doc: Document): number {
	let key = documentKeys.get(doc);
	if (key === undefined) {
		key = nextDocumentKey++;
		documentKeys.set(doc, key);
	}
	return key;
}

/**
 * Per-`Document` dedicated portal host. Radix primitives (Modal / Popover /
 * DropdownMenu) portal to a target element; the Radix/plugin default was
 * `ownerDoc.body`, which sits OUTSIDE any `.pktw-root` / `.peak-design-root`
 * scope. Every `var(--pk-*)` inside a portaled surface then fails to resolve
 * (fonts fall back to Obsidian defaults) and the obsidian-reset defense never
 * applies. We instead portal into a scoped host div — `.pktw-root
 * .peak-design-root .pk-portal-host` — appended to the body, so tokens resolve
 * and the dark-token block (`.theme-dark .pktw-root`, with `.theme-dark` on the
 * body and the host as a body child) still matches.
 *
 * One host per Document (keyed in a WeakMap like `keyForDocument`). Obsidian can
 * tear down a popout window's body, leaving a cached host detached — so we
 * re-verify `isConnected` before reuse and re-append the same node (it belongs
 * to `doc`, since the WeakMap is keyed by `doc`) when it went stale.
 */
const portalHosts = new WeakMap<Document, HTMLElement>();
const attachedPortalHosts = new Set<HTMLElement>();
const portalHostUnloadListeners = new Map<HTMLElement, { ownerWindow: Window; listener: () => void }>();

function trackPortalHost(host: HTMLElement, doc: Document): void {
	attachedPortalHosts.add(host);
	if (portalHostUnloadListeners.has(host)) return;
	const ownerWindow = doc.defaultView;
	if (!ownerWindow) return;
	const listener = (): void => {
		attachedPortalHosts.delete(host);
		portalHostUnloadListeners.delete(host);
		host.remove();
	};
	ownerWindow.addEventListener('unload', listener, { once: true });
	portalHostUnloadListeners.set(host, { ownerWindow, listener });
}

export function portalHostForDocument(doc: Document): HTMLElement {
	let host = portalHosts.get(doc);
	if (!host) {
		host = doc.createElement('div');
		// Styles-neutral scope root: only carries the inherited --pk-* tokens +
		// reset defense; `.pk-portal-host` keeps it from generating a layout box.
		host.className = 'pktw-root peak-design-root pk-portal-host';
		portalHosts.set(doc, host);
	}
	// Fresh host, or a cached one whose (popout) body was torn down: (re)attach.
	if (!host.isConnected) doc.body.appendChild(host);
	trackPortalHost(host, doc);
	return host;
}

/** Remove document-body portal roots created by this plugin generation. */
export function clearPortalHostsForUnload(): void {
	for (const host of attachedPortalHosts) {
		const tracked = portalHostUnloadListeners.get(host);
		tracked?.ownerWindow.removeEventListener('unload', tracked.listener);
		host.remove();
	}
	attachedPortalHosts.clear();
	portalHostUnloadListeners.clear();
}

/**
 * Utility for rendering React components in Obsidian views
 */
export class ReactRenderer {
	private root: Root | null = null;
	private container: HTMLElement;
	private pendingElement: React.ReactElement | null = null;
	private pendingRafId: number | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Render a React component
	 */
	render(element: React.ReactElement): void {
		// Determine target container:
		// For Obsidian Views: containerEl has structure [header, content], use children[1]
		// For PluginSettingTab: containerEl is the direct container
		const targetContainer = (this.container.children[1] as HTMLElement) || this.container;

		// Wrap with PortalContainerProvider so Radix-based primitives mounted
		// anywhere in this tree default to a SCOPED portal host in the right
		// window — critical on two axes: (1) detached Obsidian windows, where the
		// global `document.body` is the MAIN window rather than this leaf's; and
		// (2) design-token resolution — the host is `.pktw-root .peak-design-root`
		// so `var(--pk-*)` + obsidian-reset defense apply inside portaled surfaces
		// (portalling to a bare `body` broke both — the "View all" modal's alien
		// typography). The host is per-Document + isConnected-checked below.
		//
		// The `key` is derived from the container's current owning Document.
		// If a re-render is triggered after the leaf was adopted into a popout
		// window, the Document (and therefore the key) changes, forcing React
		// to remount the whole subtree so mount-time captures rebind to the
		// correct window. Within a single Document the key is stable.
		const ownerDoc = targetContainer.ownerDocument;
		const wrapped = React.createElement(
			PortalContainerProvider,
			{ key: `doc-${keyForDocument(ownerDoc)}`, container: portalHostForDocument(ownerDoc), children: element },
		);

		// Check if root exists and if it's still valid
		if (this.root) {
			try {
				this.root.render(wrapped);
				return;
			} catch (error) {
				// If render fails, the root may be invalid, so recreate it
				console.warn('[ReactRenderer] Error rendering to existing root, recreating:', error);
				this.root = null;
			}
		}

		// Ensure the container is in the DOM
		if (!targetContainer.isConnected) {
			this.pendingElement = element;
			this.pendingRafId = requestAnimationFrame(() => {
				this.pendingRafId = null;
				if (this.pendingElement) {
					const next = this.pendingElement;
					this.pendingElement = null;
					this.render(next);
				}
			});
			return;
		}

		// Stamp BOTH scope classes on every React view root. `pktw-root` alone
		// carries the `--pk-*` tokens + the root font pin, but the
		// obsidian-reset bare-tag defense (button/input/h1-6/… neutralisation)
		// is keyed on `.peak-design-root`. Without it, every React surface that
		// wasn't a modal opting in by hand (settings, project list, briefing,
		// confirm/cost/indexing/copilot modals) inherited Obsidian's global
		// chrome on any bare tag. These trees are pure design-system React (no
		// imperative `new Setting()` native rows — verified), so the reset is
		// strictly corrective here. Bare DOM modals that still WANT Obsidian
		// button chrome (mod-cta/mod-warning) must NOT come through here — they
		// add only `pktw-root` themselves (see HubCurationPlanModal et al.).
		targetContainer.classList.add('pktw-root', 'peak-design-root');
		this.root = createRoot(targetContainer);
		this.root.render(wrapped);
	}

	/**
	 * Unmount the React component. Clears pending delayed render to avoid holding closures.
	 */
	unmount(): void {
		if (this.pendingRafId != null) {
			cancelAnimationFrame(this.pendingRafId);
			this.pendingRafId = null;
		}
		this.pendingElement = null;
		if (this.root) {
			try {
				this.root.unmount();
			} catch (error) {
				// Ignore errors if the container was already removed from DOM
				console.warn('[ReactRenderer] Error during unmount:', error);
			} finally {
				this.root = null;
			}
		}
	}
}
