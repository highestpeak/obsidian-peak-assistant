# Chat Studio Layout v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single Obsidian palette command `Open Chat Studio` that opens **one new `ChatStudioView` leaf in a detached macOS window**, internally rendering a horizontal three-column layout (left `ConversationList`, middle `ChatViewComponent`, right `ConversationIndex`) with resizable column dividers. On open, the existing legacy chat layout leaves are detached so the original positions disappear.

**Architecture:** One outer `ItemView` (`ChatStudioView`) hosts a single React panel (`ChatStudioPanel`) that lays out three existing chat components side-by-side in a flex row with two custom `StudioResizerHandle` dividers between them. All three columns share `chatViewStore` (Zustand singleton), so state stays coherent without prop-drilling. The Studio leaf is registered in `STANDALONE_PEAK_VIEW_TYPES` so it does not trigger document-mode flips.

**Tech Stack:** TypeScript, React, Obsidian Plugin API (`ItemView`, `WorkspaceLeaf`, `workspace.getLeaf('window')`), Zustand stores, esbuild bundling.

**Spec:** `docs/superpowers/specs/2026-06-02-chat-studio-layout-v2-design.md`

**Supersedes:** v1 plan `docs/superpowers/plans/2026-06-02-chat-studio-layout.md` (left for history; the feature branch was reset and v2 starts fresh from master).

---

## File Structure

**Created:**
- `src/ui/view/ChatStudioView.ts` — outer Obsidian `ItemView`.
- `src/ui/view/chat-studio-view/ChatStudioView.tsx` — `ChatStudioPanel` React shell + internal `StudioResizerHandle` component.

**Modified:**
- `src/app/view/types.ts` — add `CHAT_STUDIO_VIEW_TYPE`; add it to `STANDALONE_PEAK_VIEW_TYPES`.
- `src/app/view/ViewManager.ts` — register the new view in `viewCreators`; add `openChatStudio()` method.
- `src/app/commands/PeakCommandActions.ts` — add `openChatStudio()` action.
- `src/app/commands/Register.ts` — register `peak-open-chat-studio` command.

**Why this split:** Outer ItemView and the React panel live in separate files to match the existing `ConversationOutlineView` / `ConversationOutlinePanel` convention. The resizer is small (~30 lines) and only used here, so it lives in the same file as `ChatStudioPanel`.

---

## Task 1: Add view-type constant

**Files:**
- Modify: `src/app/view/types.ts`

- [ ] **Step 1: Add the constant**

After the existing `CONVERSATION_OUTLINE_VIEW_TYPE` line, add:

```ts
export const CHAT_STUDIO_VIEW_TYPE = 'peak-chat-studio-view';
```

- [ ] **Step 2: Add it to `STANDALONE_PEAK_VIEW_TYPES`**

In the `STANDALONE_PEAK_VIEW_TYPES` Set, add `CHAT_STUDIO_VIEW_TYPE` at the end (after `CONVERSATION_OUTLINE_VIEW_TYPE`):

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
	// ChatStudioView is the all-in-one three-column chat experience opened
	// in a detached window. Standalone so its focus events don't summon or
	// dismiss the legacy chat layout.
	CHAT_STUDIO_VIEW_TYPE,
]);
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "types\.ts" | head -5` → should return empty.

- [ ] **Step 4: Commit**

```bash
git add src/app/view/types.ts
git commit -m "feat(view-types): add CHAT_STUDIO_VIEW_TYPE constant"
```

---

## Task 2: Create the React panel + resizer

**Files:**
- Create: `src/ui/view/chat-studio-view/ChatStudioView.tsx`

- [ ] **Step 1: Create the directory**

Run: `mkdir -p src/ui/view/chat-studio-view`

- [ ] **Step 2: Write the panel**

Create `src/ui/view/chat-studio-view/ChatStudioView.tsx` with this content:

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationList } from '@/ui/view/chat-view/components/conversation-list';
import { ConversationIndex } from '@/ui/view/chat-view/components/ConversationIndex';
import { ChatViewComponent } from '@/ui/view/chat-view/ChatViewComponent';
import { useChatViewStore, ViewMode } from '@/ui/view/chat-view/store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';

const LEFT_DEFAULT = 280;
const LEFT_MIN = 200;
const LEFT_MAX = 500;
const RIGHT_DEFAULT = 320;
const RIGHT_MIN = 240;
const RIGHT_MAX = 480;

/**
 * ChatStudioPanel — single-leaf three-column chat workspace.
 *
 * Renders ConversationList | ChatViewComponent | ConversationIndex side by
 * side inside one Obsidian leaf (opened as a detached window via
 * workspace.getLeaf('window')). All three columns share chatViewStore so
 * navigation and state stay coherent without prop drilling.
 */
export const ChatStudioPanel: React.FC = () => {
	const viewMode = useChatViewStore((s) => s.viewMode);
	const projectForOverview = useChatViewStore((s) => s.projectForOverview);
	const activeConversation = useChatDataStore((s) => s.activeConversation);

	const leftProjectId = derivedProjectId(
		viewMode,
		projectForOverview?.meta.id,
		activeConversation?.meta.projectId,
	);

	const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT);
	const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT);

	return (
		<div className="pktw-flex pktw-h-full pktw-w-full pktw-overflow-hidden">
			<div
				className="pktw-h-full pktw-overflow-auto pktw-border-r pktw-border-border"
				style={{ width: leftWidth, flexShrink: 0 }}
			>
				<ConversationList
					projectId={leftProjectId}
					containerClass="pktw-w-full pktw-px-2 pktw-py-2"
					maxPreviewLength={60}
					emptyText="No conversations."
				/>
			</div>
			<StudioResizerHandle
				onResize={(dx) => setLeftWidth((w) => clamp(w + dx, LEFT_MIN, LEFT_MAX))}
			/>
			<div className="pktw-flex-1 pktw-min-w-0 pktw-h-full pktw-overflow-hidden">
				<ChatViewComponent />
			</div>
			<StudioResizerHandle
				onResize={(dx) => setRightWidth((w) => clamp(w - dx, RIGHT_MIN, RIGHT_MAX))}
			/>
			<div
				className="pktw-h-full pktw-overflow-auto pktw-border-l pktw-border-border"
				style={{ width: rightWidth, flexShrink: 0 }}
			>
				<ConversationIndex />
			</div>
		</div>
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

function clamp(v: number, min: number, max: number): number {
	if (v < min) return min;
	if (v > max) return max;
	return v;
}

interface StudioResizerHandleProps {
	onResize: (dx: number) => void;
}

const StudioResizerHandle: React.FC<StudioResizerHandleProps> = ({ onResize }) => {
	const lastXRef = useRef<number | null>(null);
	const onResizeRef = useRef(onResize);
	useEffect(() => {
		onResizeRef.current = onResize;
	}, [onResize]);

	const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
		e.preventDefault();
		lastXRef.current = e.clientX;
		const handleMove = (ev: MouseEvent) => {
			if (lastXRef.current === null) return;
			const dx = ev.clientX - lastXRef.current;
			lastXRef.current = ev.clientX;
			onResizeRef.current(dx);
		};
		const handleUp = () => {
			lastXRef.current = null;
			document.removeEventListener('mousemove', handleMove);
			document.removeEventListener('mouseup', handleUp);
		};
		document.addEventListener('mousemove', handleMove);
		document.addEventListener('mouseup', handleUp);
	}, []);

	return (
		<div
			className="pktw-w-1 pktw-h-full pktw-cursor-col-resize pktw-bg-border hover:pktw-bg-accent"
			style={{ flexShrink: 0 }}
			onMouseDown={handleMouseDown}
		/>
	);
};
```

- [ ] **Step 3: Verify imports resolve**

Confirm by reading the source files (do not rely on memory):
- `@/ui/view/chat-view/components/conversation-list` exports `ConversationList`
- `@/ui/view/chat-view/components/ConversationIndex` exports `ConversationIndex`
- `@/ui/view/chat-view/ChatViewComponent` exports `ChatViewComponent`
- `@/ui/view/chat-view/store/chatViewStore` exports `useChatViewStore` and `ViewMode`
- `@/ui/store/chatDataStore` exports `useChatDataStore` and `activeConversation` has shape `{ meta: { projectId?: string } }`

If anything is wrong, fix the import.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "ChatStudio|chat-studio" | head -10` → should return empty.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/chat-studio-view/ChatStudioView.tsx
git commit -m "feat(chat-studio): add ChatStudioPanel three-column React shell"
```

---

## Task 3: Create the Obsidian ItemView class

**Files:**
- Create: `src/ui/view/ChatStudioView.ts`

- [ ] **Step 1: Write the ItemView**

Create `src/ui/view/ChatStudioView.ts`:

```ts
import { type IconName, ItemView, type WorkspaceLeaf } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { ChatStudioPanel } from './chat-studio-view/ChatStudioView';
import type { AppContext } from '@/app/context/AppContext';
import { CHAT_STUDIO_VIEW_TYPE } from '@/app/view/types';

export { CHAT_STUDIO_VIEW_TYPE };

/**
 * ChatStudioView — all-in-one three-column chat workspace.
 *
 * Hosts ChatStudioPanel which renders ConversationList | ChatViewComponent
 * | ConversationIndex side by side in a single leaf. Designed to be opened
 * in a detached window via workspace.getLeaf('window') so the user can
 * place it alongside the main Obsidian window while writing.
 */
export class ChatStudioView extends ItemView {
	private reactRenderer: ReactRenderer | null = null;
	private openRafId: number | null = null;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly appContext: AppContext,
	) {
		super(leaf);
	}

	getViewType(): string {
		return CHAT_STUDIO_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Chat Studio';
	}

	getIcon(): IconName {
		return 'layout-grid';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-chat-studio-view');
		this.containerEl.addClass('peak-design-root');
		this.containerEl.addClass('pktw-root');

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.openRafId = requestAnimationFrame(() => {
			this.openRafId = null;
			this.render();
		});
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
				ChatStudioPanel,
				{},
				this.appContext,
			),
		);
	}
}
```

**Note vs. ConversationOutlineView:** Studio does NOT need the `checkChatViewAndUpdateVisibility` auto-hide pattern — it's not a sidebar companion to ChatView; it IS the chat. It should always show its content when the leaf is open.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "ChatStudio|chat-studio" | head -10` → should return empty.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/ChatStudioView.ts
git commit -m "feat(chat-studio): add ChatStudioView ItemView"
```

---

## Task 4: Register the view + add the activation method

**Files:**
- Modify: `src/app/view/ViewManager.ts`

- [ ] **Step 1: Add the import**

In `src/app/view/ViewManager.ts`, after the existing `ConversationOutlineView` import (line 11), add:

```ts
import { ChatStudioView, CHAT_STUDIO_VIEW_TYPE } from '@/ui/view/ChatStudioView';
```

Also extend the `obsidian` import (line 14) to include `WorkspaceLeaf` if not already present:

```ts
import { App, ViewCreator, WorkspaceLeaf } from 'obsidian';
```

(Read the current line 14 first — if `WorkspaceLeaf` is already imported, skip this part. As of master at the time of writing, it is NOT imported.)

- [ ] **Step 2: Register the view creator**

After the `CONVERSATION_OUTLINE_VIEW_TYPE` entry in the constructor (around lines 55-57), add:

```ts
this.viewCreators.set(CHAT_STUDIO_VIEW_TYPE, (leaf) => {
	return new ChatStudioView(leaf, appContext);
});
```

- [ ] **Step 3: Add the `openChatStudio()` method**

At the bottom of the class (after `promptForInput`), add:

```ts
	/**
	 * Open the Chat Studio: a single ItemView in a detached macOS window
	 * that internally renders ConversationList | ChatViewComponent |
	 * ConversationIndex side by side.
	 *
	 * On first open, detaches any existing legacy chat-layout leaves so the
	 * user's original positions disappear (matching the user-requested
	 * "原来的位置都消失了" behavior). Re-running the command while Studio is
	 * already open just reveals the existing leaf.
	 */
	async openChatStudio(): Promise<void> {
		const { workspace } = this.plugin.app;

		// Idempotence: if Studio leaf already exists, just focus it.
		const existing = workspace.getLeavesOfType(CHAT_STUDIO_VIEW_TYPE);
		if (existing.length > 0) {
			workspace.revealLeaf(existing[0]);
			return;
		}

		// Tear down the legacy chat layout so the original positions disappear.
		const legacyTypes: string[] = [
			CHAT_VIEW_TYPE,
			PROJECT_LIST_VIEW_TYPE,
			CONVERSATION_OUTLINE_VIEW_TYPE,
		];
		for (const type of legacyTypes) {
			for (const leaf of workspace.getLeavesOfType(type)) {
				leaf.detach();
			}
		}

		// Open the Studio in a detached macOS window.
		const studioLeaf: WorkspaceLeaf = workspace.getLeaf('window');
		await studioLeaf.setViewState({ type: CHAT_STUDIO_VIEW_TYPE, active: true });
		workspace.revealLeaf(studioLeaf);
	}
```

**Verify imports:** `CHAT_VIEW_TYPE`, `PROJECT_LIST_VIEW_TYPE`, `CONVERSATION_OUTLINE_VIEW_TYPE` should already be imported at the top of `ViewManager.ts`. Verify before adding redundant imports.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "ViewManager|ChatStudio|chat-studio" | head -10` → should return empty (one pre-existing TS2322 on `activateAmbientPushView` line is allowed — verify by stashing if uncertain).

- [ ] **Step 5: Commit**

```bash
git add src/app/view/ViewManager.ts
git commit -m "feat(chat-studio): register view + add openChatStudio() activator"
```

---

## Task 5: Add the command action

**Files:**
- Modify: `src/app/commands/PeakCommandActions.ts`

- [ ] **Step 1: Add the action**

After the `openKnowledgeCenter()` export (around line 147-149), add:

```ts
export function openChatStudio(): void {
	void getContext().viewManager.openChatStudio();
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "PeakCommandActions" | head -5` → should return empty.

- [ ] **Step 3: Commit**

```bash
git add src/app/commands/PeakCommandActions.ts
git commit -m "feat(chat-studio): add openChatStudio command action"
```

---

## Task 6: Register the palette command

**Files:**
- Modify: `src/app/commands/Register.ts`

- [ ] **Step 1: Add to the destructured import**

Extend the existing import from `@/app/commands/PeakCommandActions` (lines 8-15) to include `openChatStudio` in alphabetical position:

```ts
import {
	openChatStudio,
	openCopilotPanel,
	openCopilotReviewHistory,
	openHarnessSetupWizard,
	openKnowledgeCenter,
	openQuickSearch,
	openSettingsModal,
} from '@/app/commands/PeakCommandActions';
```

- [ ] **Step 2: Add the command entry**

Insert a new entry after `peak-knowledge-center` (so it sits next to other "open a view" commands):

```ts
		{
			id: 'peak-open-chat-studio',
			name: 'Open Chat Studio',
			callback: openChatStudio,
		},
```

Tabs for indentation.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "Register\.ts" | head -5` → should return empty.

- [ ] **Step 4: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat(chat-studio): register Open Chat Studio command"
```

---

## Task 7: Build + manual verification

**Files:** none modified.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: Build completes without errors; `main.js` regenerated.

- [ ] **Step 2: Reload the plugin**

Settings → Community plugins → toggle this plugin off and on.

- [ ] **Step 3: Command appears**

Cmd+P → search "Studio".
Expected: `Open Chat Studio` command listed.

- [ ] **Step 4: Single detached window with three columns**

Run the command.
Expected:
- A new detached macOS window opens (separate from Obsidian's main window).
- Inside the window: three columns side by side — `ConversationList` on the left (~280px), `ChatViewComponent` in the middle (flex), `ConversationIndex` on the right (~320px).
- Legacy chat layout leaves (left ProjectList tab, the original ChatView tab, right Conversation Outline tab) are GONE from the main window.

- [ ] **Step 5: Resizable column dividers**

Hover the thin vertical bars between columns → cursor turns to `col-resize`. Drag left/right.
Expected: columns resize within their min/max bounds (left 200–500px, right 240–480px). Middle column flexes to fill remaining space.

- [ ] **Step 6: Cross-column state coherence**

In the middle ChatViewComponent, click a project tile to enter that project.
Expected: the left ConversationList immediately filters to that project's conversations; the right ConversationIndex updates for the current conversation context.

Click a conversation in the LEFT ConversationList.
Expected: the middle ChatViewComponent navigates to that conversation; the right ConversationIndex shows that conversation's outline.

- [ ] **Step 7: Idempotence**

While Studio is open, run `Open Chat Studio` again from the command palette.
Expected: the existing Studio window is revealed/focused — no second window is opened.

- [ ] **Step 8: Closing Studio does not auto-restore legacy**

Close the Studio window (Cmd+W on the window or macOS red close button).
Expected: the main Obsidian window remains as it was after detach (no chat-related leaves auto-restored). User can click the ribbon `message-circle` icon to bring back the legacy chat layout.

- [ ] **Step 9: Re-summoning legacy chat after Studio**

Click the ribbon icon.
Expected: the legacy three-pane chat layout (left ProjectList sidebar / center ChatView / right Conversation Outline) is restored in the main window. Studio window (if still open) keeps working independently.

- [ ] **Step 10: Workspace persistence**

With Studio window open, reload Obsidian.
Expected: Obsidian restores the Studio window with its three columns intact.

- [ ] **Step 11: Optional commit for tweaks**

If anything was adjusted during manual testing, commit as a separate `fix` commit.

---

## Self-Review Summary

**Spec coverage:**
- ✓ Single ItemView with internal 3-column layout: Tasks 2, 3
- ✓ Detached window via `getLeaf('window')`: Task 4
- ✓ Detach legacy chat layout on open: Task 4
- ✓ Project-aware ConversationList filter: Task 2 (`derivedProjectId`)
- ✓ Resizable dividers between columns: Task 2 (`StudioResizerHandle`)
- ✓ Reuse ChatViewComponent / ConversationList / ConversationIndex verbatim: Task 2
- ✓ Idempotence: Task 4
- ✓ STANDALONE_PEAK_VIEW_TYPES registration: Task 1
- ✓ Palette command: Tasks 5, 6
- ✓ No global `studioMode` flag, no auto-restore on close: by design — confirmed nothing in the plan introduces one
- ✓ Build + manual checklist: Task 7

**Placeholder scan:** None.

**Type consistency:** `CHAT_STUDIO_VIEW_TYPE` defined in Task 1 and used identically in Tasks 3, 4. `ChatStudioView` (class) and `ChatStudioPanel` (React) are named consistently throughout. `StudioResizerHandle` props match its usage in the panel. `derivedProjectId` signature matches its call sites.
