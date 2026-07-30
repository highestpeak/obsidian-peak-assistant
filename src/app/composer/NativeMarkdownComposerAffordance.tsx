import * as React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
	App,
	MarkdownView,
	Notice,
	type EventRef,
	type WorkspaceLeaf,
} from 'obsidian';
import { PanelsTopLeft } from 'lucide-react';
import { Button } from '@/ui/components/primitives';

export interface NativeMarkdownComposerAffordanceOptions {
	label: string;
	conversionFailed: string;
	convert(leaf: WorkspaceLeaf): Promise<void>;
}

interface MountedAffordance {
	container: HTMLElement;
	root: Root;
	viewContentEl: HTMLElement;
}

/**
 * App-owned, leaf-local bridge from Obsidian's native MarkdownView into
 * Composer. It observes all Markdown leaves, mounts one restrained React
 * affordance per leaf and never adds another Command Palette entry.
 */
export class NativeMarkdownComposerAffordance {
	private readonly refs: EventRef[] = [];
	private readonly mounts = new Map<WorkspaceLeaf, MountedAffordance>();
	private syncTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(
		private readonly app: App,
		private readonly options: NativeMarkdownComposerAffordanceOptions,
	) {
		const schedule = () => this.scheduleSync();
		this.refs.push(
			this.app.workspace.on('layout-change', schedule),
			this.app.workspace.on('active-leaf-change', schedule),
			this.app.workspace.on('file-open', schedule),
		);
		this.scheduleSync();
	}

	dispose(): void {
		if (this.syncTimer) clearTimeout(this.syncTimer);
		this.syncTimer = null;
		for (const ref of this.refs) this.app.workspace.offref(ref);
		this.refs.length = 0;
		for (const leaf of [...this.mounts.keys()]) this.unmount(leaf);
	}

	private scheduleSync(): void {
		if (this.syncTimer) return;
		this.syncTimer = setTimeout(() => {
			this.syncTimer = null;
			this.sync();
		}, 0);
	}

	private sync(): void {
		const markdownLeaves = new Set(
			this.app.workspace
				.getLeavesOfType('markdown')
				.filter((leaf) => leaf.view instanceof MarkdownView && leaf.view.file?.extension === 'md'),
		);
		for (const leaf of [...this.mounts.keys()]) {
			const mount = this.mounts.get(leaf);
			if (markdownLeaves.has(leaf) && mount?.container.isConnected) continue;
			this.unmount(leaf);
		}
		for (const leaf of markdownLeaves) {
			if (this.mounts.has(leaf)) continue;
			this.mount(leaf);
		}
	}

	private mount(leaf: WorkspaceLeaf): void {
		if (!(leaf.view instanceof MarkdownView)) return;
		const contentEl = leaf.view.contentEl;
		const container = contentEl.ownerDocument.createElement('div');
		container.className = 'peak-design-root pk-native-composer-affordance';
		contentEl.classList.add('pk-native-composer-affordance-host');
		contentEl.appendChild(container);
		const root = createRoot(container);
		root.render(
			<Button
				className="pk-native-composer-affordance__button"
				variant="outline"
				size="sm"
				onClick={() => {
					void this.options.convert(leaf).catch(() => {
						new Notice(this.options.conversionFailed);
					});
				}}
			>
				<PanelsTopLeft aria-hidden />
				<span>{this.options.label}</span>
			</Button>,
		);
		this.mounts.set(leaf, { container, root, viewContentEl: contentEl });
	}

	private unmount(leaf: WorkspaceLeaf): void {
		const mount = this.mounts.get(leaf);
		if (!mount) return;
		this.mounts.delete(leaf);
		mount.root.unmount();
		mount.container.remove();
		if (!mount.viewContentEl.querySelector('.pk-native-composer-affordance')) {
			mount.viewContentEl.classList.remove('pk-native-composer-affordance-host');
		}
	}
}
