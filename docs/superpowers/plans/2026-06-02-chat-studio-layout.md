# Chat Studio Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single Obsidian command, `Open Chat Studio Layout`, that opens the chat workflow as three native panes — left sidebar conversation list, main chat view, right sidebar conversation index — so users can write articles in the main area while chatting alongside.

**Architecture:** A new left-sidebar `PeakConversationListView` ItemView wraps the existing `ConversationList` React component, subscribes to `chatViewStore` + `chatDataStore` to derive the active project id, and reuses Obsidian's native sidebar layout. The existing `ConversationOutlineView` (right sidebar) and `ChatView` (main) are reused unchanged. The Studio command coexists with the legacy chat layout (which uses `ProjectListView` on the left); a small change to `ViewSwitchConsistentHandler` lets both left views count as a valid chat-layout left companion so the handler doesn't clobber the Studio layout.

**Tech Stack:** TypeScript, React, Obsidian Plugin API (`ItemView`, `WorkspaceLeaf`), Zustand stores (`chatViewStore`, `chatDataStore`), esbuild bundling.

**Spec:** `docs/superpowers/specs/2026-06-02-chat-studio-layout-design.md`

---

## File Structure

**Created:**
- `src/ui/view/PeakConversationListView.ts` — outer Obsidian `ItemView` class
- `src/ui/view/peak-conversation-list-view/PeakConversationListView.tsx` — React panel that derives `projectId` from stores and renders `<ConversationList>`

**Modified:**
- `src/app/view/types.ts` — add `PEAK_CONVERSATION_LIST_VIEW_TYPE` constant; add it to `STANDALONE_PEAK_VIEW_TYPES`
- `src/app/view/ViewManager.ts` — register the new view; add `openChatStudioLayout()` method
- `src/app/view/ViewSwitchConsistentHandler.ts` — accept either `PROJECT_LIST_VIEW_TYPE` or `PEAK_CONVERSATION_LIST_VIEW_TYPE` as the chat layout's left companion
- `src/app/commands/PeakCommandActions.ts` — add `openChatStudioLayout()` action
- `src/app/commands/Register.ts` — register the new palette command

**Why this split:** Outer `ItemView` class and the React panel live in separate files to match the existing `ConversationOutlineView` / `ConversationOutlinePanel` convention. View-type constants stay centralized in `types.ts` so the layout handler can reference them without circular imports.

---

## Task 1: Add view-type constant

**Files:**
- Modify: `src/app/view/types.ts`

- [ ] **Step 1: Add the constant and include it in `STANDALONE_PEAK_VIEW_TYPES`**

Open `src/app/view/types.ts`. After the existing `CONVERSATION_OUTLINE_VIEW_TYPE` line, add:

```ts
export const PEAK_CONVERSATION_LIST_VIEW_TYPE = 'peak-conversation-list-view';
```

In the `STANDALONE_PEAK_VIEW_TYPES` set, add `PEAK_CONVERSATION_LIST_VIEW_TYPE` alongside `CONVERSATION_OUTLINE_VIEW_TYPE`. The block becomes:

```ts
export const STANDALONE_PEAK_VIEW_TYPES = new Set<string>([
	GRAPH_FULLSCREEN_VIEW_TYPE,
	AMBIENT_PUSH_VIEW_TYPE,
	USAGE_DASHBOARD_VIEW_TYPE,
	VAULT_XRAY_VIEW_TYPE,
	GAP_ANALYSIS_VIEW_TYPE,
	KNOWLEDGE_CENTER_VIEW_TYPE,
	// Conversation Outline lives in Obsidian's right sidebar (companion to
	// the chat view). Marked standalone so that focusing it / clicking inside
	// it does NOT cause ViewSwitchConsistentHandler to flip the entire
	// layout back to document mode (which was replacing the chat leaf with
	// a markdown file when users clicked any outline item).
	CONVERSATION_OUTLINE_VIEW_TYPE,
	// PeakConversationListView is the Studio Layout's left-sidebar companion
	// to the chat view (alternative to ProjectListView). Same standalone
	// treatment as the outline — clicking a conversation inside must not
	// trigger a document-mode flip.
	PEAK_CONVERSATION_LIST_VIEW_TYPE,
]);
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Pass (no new errors; the constant is unused so far but exported, so TS is happy).

- [ ] **Step 3: Commit**

```bash
git add src/app/view/types.ts
git commit -m "feat(view-types): add PEAK_CONVERSATION_LIST_VIEW_TYPE constant"
```

---

## Task 2: Create the React panel

**Files:**
- Create: `src/ui/view/peak-conversation-list-view/PeakConversationListView.tsx`

- [ ] **Step 1: Create the directory and the panel file**

Run: `mkdir -p src/ui/view/peak-conversation-list-view`

- [ ] **Step 2: Write the React panel**

Create `src/ui/view/peak-conversation-list-view/PeakConversationListView.tsx` with this content:

```tsx
import React from 'react';
import { ConversationList } from '@/ui/view/chat-view/components/conversation-list';
import { ChatStringsProvider } from '@/ui/view/chat-view/chatStringsContext';
import { useChatViewStore, ViewMode } from '@/ui/view/chat-view/store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';

/**
 * PeakConversationListPanel — React entry for the Studio Layout's left-sidebar
 * conversation list.
 *
 * Mirrors ConversationOutlinePanel's shape: a thin shell around an existing
 * chat-view component that reads its own state from the global Zustand stores.
 * Project filtering follows the main chat area:
 *   - viewMode in {PROJECT_OVERVIEW, PROJECT_CONVERSATIONS_LIST} → project's id
 *   - viewMode === CONVERSATION_IN_PROJECT → active conversation's projectId
 *   - else → undefined (standalone conversations only)
 */
export const PeakConversationListPanel: React.FC = () => {
	const viewMode = useChatViewStore((s) => s.viewMode);
	const projectForOverview = useChatViewStore((s) => s.projectForOverview);
	const activeConversation = useChatDataStore((s) => s.activeConversation);

	const projectId = derivedProjectId(viewMode, projectForOverview?.id, activeConversation?.meta.projectId);

	return (
		<ChatStringsProvider>
			<ConversationList
				projectId={projectId}
				containerClass="pktw-w-full pktw-px-2 pktw-py-2"
				maxPreviewLength={60}
				emptyText="No conversations."
			/>
		</ChatStringsProvider>
	);
};

function derivedProjectId(
	viewMode: ViewMode | null,
	overviewProjectId: string | undefined,
	convProjectId: string | undefined,
): string | undefined {
	if (viewMode === ViewMode.PROJECT_OVERVIEW || viewMode === ViewMode.PROJECT_CONVERSATIONS_LIST) {
		return overviewProjectId;
	}
	if (viewMode === ViewMode.CONVERSATION_IN_PROJECT) {
		return convProjectId;
	}
	return undefined;
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Pass. If any import path resolves incorrectly, fix before moving on.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/peak-conversation-list-view/PeakConversationListView.tsx
git commit -m "feat(chat-studio): add PeakConversationListPanel React shell"
```

---

## Task 3: Create the Obsidian ItemView class

**Files:**
- Create: `src/ui/view/PeakConversationListView.ts`

- [ ] **Step 1: Write the ItemView**

Create `src/ui/view/PeakConversationListView.ts` with this content:

```ts
import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { PeakConversationListPanel } from './peak-conversation-list-view/PeakConversationListView';
import type { AppContext } from '@/app/context/AppContext';
import { CHAT_VIEW_TYPE, PEAK_CONVERSATION_LIST_VIEW_TYPE } from '@/app/view/types';

export { PEAK_CONVERSATION_LIST_VIEW_TYPE };

/**
 * PeakConversationListView — left-sidebar ItemView hosting the conversation
 * list (Studio Layout companion to ChatView).
 *
 * Modeled on ConversationOutlineView: same React-renderer + service-element
 * mount pattern, same auto-hide-when-no-chat behavior so the left sidebar
 * stays clean while editing a regular document.
 */
export class PeakConversationListView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return PEAK_CONVERSATION_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Conversation List';
	}

	getIcon(): IconName {
		return 'messages-square';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-conversation-list-view');
		this.containerEl.addClass('peak-design-root');
		this.containerEl.addClass('pktw-root');

		this.checkChatViewAndUpdateVisibility();
		this.registerEvent(
			this.app.workspace.on('layout-change', () => {
				this.checkChatViewAndUpdateVisibility();
			}),
		);

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
	}

	private checkChatViewAndUpdateVisibility(): void {
		const hasChatView = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).length > 0;
		this.containerEl.style.display = hasChatView ? '' : 'none';
	}

	async onClose(): Promise<void> {
		if (this.openRafId != null) {
			cancelAnimationFrame(this.openRafId);
			this.openRafId = null;
		}
		if (this.reactRenderer) {
			this.reactRenderer.unmount();
			this.reactRenderer = null;
		}
		this.containerEl.empty();
	}

	private render(): void {
		if (!this.reactRenderer) return;
		this.reactRenderer.render(
			createReactElementWithServices(
				PeakConversationListPanel,
				{},
				this.appContext,
			),
		);
	}
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/PeakConversationListView.ts
git commit -m "feat(chat-studio): add PeakConversationListView ItemView"
```

---

## Task 4: Register the view + add the activation method

**Files:**
- Modify: `src/app/view/ViewManager.ts`

- [ ] **Step 1: Add the import**

In `src/app/view/ViewManager.ts`, after the existing `ConversationOutlineView` import (line 11), add:

```ts
import { PeakConversationListView, PEAK_CONVERSATION_LIST_VIEW_TYPE } from '@/ui/view/PeakConversationListView';
```

- [ ] **Step 2: Register the view creator**

After the `CONVERSATION_OUTLINE_VIEW_TYPE` entry in the constructor's `viewCreators.set(...)` block (around line 55-57), add:

```ts
this.viewCreators.set(PEAK_CONVERSATION_LIST_VIEW_TYPE, (leaf) => {
	return new PeakConversationListView(leaf, appContext);
});
```

- [ ] **Step 3: Add the `openChatStudioLayout()` method**

At the bottom of the class (after `promptForInput`), add:

```ts
	/**
	 * Open the Chat Studio Layout: ChatView in the main area, conversation
	 * list in the left sidebar, and the conversation outline in the right
	 * sidebar. The user can split the main area to write an article alongside.
	 *
	 * Idempotent — re-running the command reveals existing leaves rather than
	 * creating duplicates.
	 */
	async openChatStudioLayout(): Promise<void> {
		const { workspace } = this.plugin.app;

		// Main area: open or reveal a ChatView leaf.
		const existingChatLeaves = workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		const centerLeaf = existingChatLeaves[0] ?? workspace.getLeaf(false);
		if (centerLeaf) {
			await centerLeaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
		}

		// Left sidebar: open or reveal PeakConversationListView.
		const existingLeftLeaves = workspace.getLeavesOfType(PEAK_CONVERSATION_LIST_VIEW_TYPE);
		const leftLeaf = existingLeftLeaves[0] ?? workspace.getLeftLeaf(false);
		if (leftLeaf) {
			await leftLeaf.setViewState({
				type: PEAK_CONVERSATION_LIST_VIEW_TYPE,
				state: {},
				active: false,
			});
			workspace.revealLeaf(leftLeaf);
		}

		// Right sidebar: open or reveal ConversationOutlineView (the existing
		// 4-tab index). Mirrors the side-leaf placement logic from
		// ViewSwitchConsistentHandler.activateChatView so we don't clobber an
		// existing AmbientPushView occupying the right sidebar.
		const existingOutlineLeaves = workspace.getLeavesOfType(CONVERSATION_OUTLINE_VIEW_TYPE);
		let outlineLeaf: import('obsidian').WorkspaceLeaf | null = existingOutlineLeaves[0] ?? null;
		if (!outlineLeaf && typeof workspace.getRightLeaf === 'function') {
			const candidate = workspace.getRightLeaf(false);
			if (candidate && candidate.view?.getViewType() === AMBIENT_PUSH_VIEW_TYPE) {
				outlineLeaf = workspace.getRightLeaf(true) ?? candidate;
			} else {
				outlineLeaf = candidate;
			}
		}
		if (outlineLeaf) {
			await outlineLeaf.setViewState({
				type: CONVERSATION_OUTLINE_VIEW_TYPE,
				state: {},
				active: false,
			});
			workspace.revealLeaf(outlineLeaf);
		}

		if (centerLeaf) workspace.revealLeaf(centerLeaf);
	}
```

- [ ] **Step 4: Verify all referenced imports exist**

The new method references `CHAT_VIEW_TYPE`, `AMBIENT_PUSH_VIEW_TYPE`, `CONVERSATION_OUTLINE_VIEW_TYPE`, and `PEAK_CONVERSATION_LIST_VIEW_TYPE`. The first three are already imported in `ViewManager.ts`; the last was added in Step 1. No additional imports needed.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: Pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/view/ViewManager.ts
git commit -m "feat(chat-studio): register view + add openChatStudioLayout()"
```

---

## Task 5: Make `ViewSwitchConsistentHandler` aware of the new left view

**Files:**
- Modify: `src/app/view/ViewSwitchConsistentHandler.ts`

**Background:** `activateChatView()` is called by `handleActiveLeafChange()` every time the user focuses a chat-related leaf. Today it ensures `PROJECT_LIST_VIEW_TYPE` is on the left — if the left already has `PeakConversationListView`, the handler would replace it, clobbering the Studio Layout. The fix: treat either view as a valid "chat layout left companion".

- [ ] **Step 1: Add the import**

In `src/app/view/ViewSwitchConsistentHandler.ts`, extend the existing types import (around lines 2-9) to include `PEAK_CONVERSATION_LIST_VIEW_TYPE`:

```ts
import {
	AMBIENT_PUSH_VIEW_TYPE,
	CHAT_VIEW_TYPE,
	CONVERSATION_OUTLINE_VIEW_TYPE,
	PEAK_CONVERSATION_LIST_VIEW_TYPE,
	PROJECT_LIST_VIEW_TYPE,
	STANDALONE_PEAK_VIEW_TYPES,
	TRACKED_VIEW_TYPES,
} from '@/app/view/types';
```

- [ ] **Step 2: Update the early-return guard in `activateChatView()`**

Locate the `hasProjectList` block (around lines 82-91). Replace:

```ts
		const hasProjectList =
			this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE).length > 0;
		if (
			this.isChatLayoutActive &&
			activeViewType === CHAT_VIEW_TYPE &&
			hasOutline &&
			hasProjectList
		) {
			return;
		}
```

with:

```ts
		// The chat layout's left companion is either ProjectListView (legacy)
		// or PeakConversationListView (Studio Layout). Treat both as valid so
		// re-entering chat focus doesn't clobber the Studio Layout's left pane.
		const hasLeftCompanion =
			this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE).length > 0 ||
			this.app.workspace.getLeavesOfType(PEAK_CONVERSATION_LIST_VIEW_TYPE).length > 0;
		if (
			this.isChatLayoutActive &&
			activeViewType === CHAT_VIEW_TYPE &&
			hasOutline &&
			hasLeftCompanion
		) {
			return;
		}
```

- [ ] **Step 3: Update the left-leaf creation block in `activateChatView()`**

Locate the existing left-leaf block (around lines 102-109):

```ts
			// Find existing project-list leaf or create new one
			const existingProjectListLeaves = this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE);
			const leftLeaf = existingProjectListLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({ type: PROJECT_LIST_VIEW_TYPE, state: {}, active: true });
				// revealLeaf expands the left sidebar if collapsed.
				this.app.workspace.revealLeaf(leftLeaf);
			}
```

Replace with:

```ts
			// Left sidebar: keep whichever chat-layout companion is already
			// present (Studio Layout uses PeakConversationListView, legacy
			// layout uses ProjectListView). If neither exists, fall back to
			// the legacy ProjectListView since that's the default layout.
			const existingPeakListLeaves =
				this.app.workspace.getLeavesOfType(PEAK_CONVERSATION_LIST_VIEW_TYPE);
			const existingProjectListLeaves = this.app.workspace.getLeavesOfType(PROJECT_LIST_VIEW_TYPE);
			if (existingPeakListLeaves[0]) {
				// Studio layout already active — just reveal it, don't replace.
				this.app.workspace.revealLeaf(existingPeakListLeaves[0]);
			} else {
				const leftLeaf = existingProjectListLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
				if (leftLeaf) {
					await leftLeaf.setViewState({ type: PROJECT_LIST_VIEW_TYPE, state: {}, active: true });
					this.app.workspace.revealLeaf(leftLeaf);
				}
			}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: Pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/view/ViewSwitchConsistentHandler.ts
git commit -m "feat(chat-studio): preserve Studio left pane in layout handler"
```

---

## Task 6: Add the command action

**Files:**
- Modify: `src/app/commands/PeakCommandActions.ts`

- [ ] **Step 1: Add the action**

In `src/app/commands/PeakCommandActions.ts`, after the `openKnowledgeCenter()` export (around line 147-149), add:

```ts
export function openChatStudioLayout(): void {
	void getContext().viewManager.openChatStudioLayout();
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: Pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/commands/PeakCommandActions.ts
git commit -m "feat(chat-studio): add openChatStudioLayout command action"
```

---

## Task 7: Register the palette command

**Files:**
- Modify: `src/app/commands/Register.ts`

- [ ] **Step 1: Add the action to the import block**

Extend the existing destructured import from `@/app/commands/PeakCommandActions` (lines 8-15) to include `openChatStudioLayout`:

```ts
import {
	openChatStudioLayout,
	openCopilotPanel,
	openCopilotReviewHistory,
	openHarnessSetupWizard,
	openKnowledgeCenter,
	openQuickSearch,
	openSettingsModal,
} from '@/app/commands/PeakCommandActions';
```

- [ ] **Step 2: Add the command to the returned array**

In the `return [...]` block (lines 44-75), insert a new entry. Place it after `peak-knowledge-center` so it sits next to the other "open a view" commands:

```ts
		{
			id: 'peak-open-chat-studio-layout',
			name: 'Open Chat Studio Layout',
			callback: openChatStudioLayout,
		},
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat(chat-studio): register Open Chat Studio Layout command"
```

---

## Task 8: Build + manual verification

**Files:** none modified.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: Build completes without errors; `main.js` is regenerated.

- [ ] **Step 2: Reload the plugin in Obsidian**

In Obsidian: Settings → Community plugins → toggle this plugin off and on. (Or use the dev-mode reload shortcut.)

- [ ] **Step 3: Verify the command appears**

Open the Obsidian command palette (Cmd+P) → type "Studio".
Expected: `Open Chat Studio Layout` is listed.

- [ ] **Step 4: Run the command and verify the three-pane layout**

Run the command from the palette.
Expected:
- Main area: `ChatView`.
- Left sidebar: `Conversation List` (the new view, icon `messages-square`).
- Right sidebar: `Conversation Outline` (existing).
- The left list shows standalone conversations if you started on Home; if a project is open in the main area, the list filters to that project.

- [ ] **Step 5: Verify project filter follows main-area context**

Inside the main `ChatView`, navigate into a project's overview (e.g. click a project tile from Home).
Expected: The left sidebar list immediately updates to show that project's conversations.

Navigate back to Home or an `ALL_CONVERSATIONS` view.
Expected: The left sidebar list reverts to standalone conversations.

- [ ] **Step 6: Verify idempotence**

Close the left sidebar leaf (X on the Conversation List tab), then re-run `Open Chat Studio Layout`.
Expected: The Conversation List leaf reappears in the left sidebar.

Close the right sidebar's Conversation Outline leaf, re-run the command.
Expected: It reappears.

- [ ] **Step 7: Verify the layout handler does not clobber the Studio left pane**

With Studio Layout active, click around inside the main `ChatView` (which triggers `handleActiveLeafChange` → `activateChatView()`).
Expected: The left sidebar **stays** as Conversation List — it does NOT get replaced by `ProjectListView`.

- [ ] **Step 8: Verify Split right for article workflow**

In the main area, right-click the `ChatView` tab → `Split right` → open or create a markdown file in the new pane.
Expected: Three sidebar panes intact; main area now hosts chat (left half) and the markdown editor (right half) side-by-side.

- [ ] **Step 9: Verify workspace persistence**

Reload Obsidian (or disable+enable the plugin).
Expected: The Studio Layout (including the new left view) is restored from Obsidian's persisted workspace state.

- [ ] **Step 10: Final commit (if anything was tweaked during verification)**

If you made small adjustments during manual testing (e.g. tweaked CSS classes for sidebar density), commit them as a separate `fix` commit. If nothing changed, skip this step.

---

## Self-Review Summary

**Spec coverage check:**
- ✓ Three-pane layout: Tasks 3, 4 (ItemView + activation method)
- ✓ Reuse `ConversationList` + `ConversationOutlineView`: Task 2 panel + Task 4 method
- ✓ Project-aware left sidebar: Task 2 (`derivedProjectId`)
- ✓ Single command, idempotent: Tasks 4, 7
- ✓ No `studioMode` flag: confirmed by design — no state tracking added
- ✓ Sidebar compact styling: Task 2 (custom `containerClass` + `maxPreviewLength`)
- ✓ Handler coexistence: Task 5
- ✓ No new unit tests: per spec; replaced with `tsc --noEmit` + manual checklist

**Placeholder scan:** None. Every code block contains the actual content.

**Type consistency:** `PEAK_CONVERSATION_LIST_VIEW_TYPE` is defined in Task 1 and used identically in Tasks 3, 4, 5. `PeakConversationListView` (class) and `PeakConversationListPanel` (React) are referenced with consistent names throughout. `derivedProjectId` signature matches its usage in the panel.
