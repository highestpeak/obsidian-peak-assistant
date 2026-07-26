import * as React from 'react';
import { Plus } from 'lucide-react';
import type { ComposerBlock } from '@/core/composer';
import { buildInsertFrontmatterHeadOperations } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { useComposerChrome } from '../../chrome/ComposerChromeContext';
import { DEFAULT_FRONTMATTER_CONFIG } from './frontmatterConfig';

/**
 * Peak Composer — "添加属性" entrance for a document that has no frontmatter
 * (WP5 integration). The property grid only exists once a frontmatter block
 * does, so a note without one has no hover entrance to add properties; this
 * chrome-level affordance sits at the document head in the editing state and
 * inserts a fresh frontmatter block (seeded with an empty `tags` list so the
 * grid renders something to build on) through the transaction hub — the same
 * atomic, undoable path every other structural edit uses.
 *
 * It renders NOTHING when the document already has a frontmatter block, when the
 * runtime is read-only (no hub), or outside the editing state — so it never
 * duplicates the grid and never becomes a dead button.
 */
export function AddFrontmatterEntry({ editing }: { editing: boolean }): React.ReactElement | null {
	const chrome = useComposerChrome();
	const hub = chrome.runtime.hub;
	const snapshot = chrome.snapshot;

	if (!editing || !hub || !snapshot) return null;
	if (snapshot.blocks.some((b: ComposerBlock) => b.kind === 'frontmatter')) return null;

	const add = async (): Promise<void> => {
		const built = buildInsertFrontmatterHeadOperations(snapshot, [{ key: 'tags', value: [] }]);
		if (!built.ok) return;
		try {
			await hub.commit({
				origin: 'deterministic',
				label: chrome.config.chrome.actions.directEdit,
				operations: built.operations,
				...(built.target ? { target: built.target } : {}),
				expectedBlockDelta: built.expectedBlockDelta,
			});
		} catch {
			// conflict — surfaced via lifecycle staleness
		}
	};

	return (
		<div className="pk-fm-add" data-chrome="true">
			<Button variant="ghost" size="sm" onClick={() => void add()}>
				<Plus size={13} />
				{DEFAULT_FRONTMATTER_CONFIG.grid.addProperty}
			</Button>
		</div>
	);
}
