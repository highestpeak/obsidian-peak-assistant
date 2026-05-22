# Copilot Panel Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the selected UX direction for Copilot / Command Center: a Search-like pop-out panel with `Document / Vault / Setting` tabs, an `Auto` planner in every tab, and Analysis-style step visibility for every capability run.

**Architecture:** Keep existing `CopilotActionRegistry` and action result panels as the execution backend. Add an intent-hub layer that maps actions into `Document`, `Vault`, and `Setting`; add an auto-planner that selects capabilities from current context; replace the static card picker with a tabbed command panel; and extend Copilot run UI so both Auto and manual actions show planning, running, review, applied, and error states consistently. Reuse the existing AI Analysis step infrastructure (`V2ToolStep`, `ToolRow`, `BatchRow`, `CopilotStepTimeline`) instead of building a second timeline system.

**Tech Stack:** React 18, Obsidian Modal, existing shadcn `Button` / `Input`, Lucide React icons, existing `CopilotActionRegistry`, `DocumentContextBuilder`, `V2ToolStep`, existing `npm run test -- test/<file>.test.ts`, and `npm run build`.

**Design Source:** `docs/gstack/copilot-command-center-redesign-2026-05-14/evolution-report-rendered.html`

---

## Current Code Map

- `src/ui/view/copilot/CopilotPickerModal.tsx` currently renders the old static action catalog. This becomes the new pop-out panel shell.
- `src/ui/view/copilot/CopilotResultModal.tsx` already consumes `AsyncGenerator<LLMStreamEvent>` and shows `CopilotStepTimeline`.
- `src/ui/view/copilot/components/CopilotStepTimeline.tsx` already wraps AI Analysis timeline helpers and should be reused.
- `src/service/copilot/CopilotActionRegistry.ts` is the action source of truth. Keep it, but add intent-tab metadata outside of individual action definitions where possible.
- `src/service/copilot/actions/index.ts` registers all existing actions. Avoid rewriting action internals unless a specific action needs better step events.
- `src/ui/view/command-center/CommandCenterModal.tsx` still exposes old sections. It should route `Copilot` to the new panel and later collapse duplicate entries.
- `test/` has no Copilot tests yet. Add focused TypeScript tests for planner and view-model logic.

## Implementation Sequence

### Task 1: Add Intent Hub Types And Tab Mapping

**Files:**
- Create: `src/service/copilot/intent-hub.ts`
- Test: `test/copilot-intent-hub.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/copilot-intent-hub.test.ts`:

```ts
import assert from 'assert';
import {
	COPILOT_INTENT_TABS,
	getActionIntentTab,
	type IntentHubId,
	type IntentTabId,
} from '../src/service/copilot/intent-hub';
import type { CopilotAction } from '../src/service/copilot/CopilotActionRegistry';

function action(id: string, category: CopilotAction['category']): CopilotAction {
	return {
		id,
		label: id,
		description: id,
		icon: (() => null) as any,
		category,
		relevance: () => 0,
		execute: (async function* () { return { type: 'structured' as const, data: {} }; }) as any,
		ResultPanel: (() => null) as any,
	};
}

assert.deepStrictEqual(
	COPILOT_INTENT_TABS.map(tab => tab.id),
	['document', 'vault', 'setting'] satisfies IntentTabId[],
);

assert.deepStrictEqual(
	COPILOT_INTENT_TABS.map(tab => tab.hub),
	['copilot', 'vault-intelligence', 'manage-system'] satisfies IntentHubId[],
);

assert.equal(getActionIntentTab(action('suggest-links', 'document')), 'document');
assert.equal(getActionIntentTab(action('add-evidence', 'writing')), 'document');
assert.equal(getActionIntentTab(action('vault-health', 'vault')), 'vault');
assert.equal(getActionIntentTab(action('prompt-audit', 'vault')), 'setting');
assert.equal(getActionIntentTab(action('run-workflow', 'vault')), 'setting');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- test/copilot-intent-hub.test.ts
```

Expected: FAIL because `src/service/copilot/intent-hub.ts` does not exist.

- [ ] **Step 3: Add intent hub mapping**

Create `src/service/copilot/intent-hub.ts`:

```ts
import type { CopilotAction } from './CopilotActionRegistry';

export type IntentTabId = 'document' | 'vault' | 'setting';
export type IntentHubId = 'copilot' | 'vault-intelligence' | 'manage-system';

export interface IntentTabDefinition {
	id: IntentTabId;
	hub: IntentHubId;
	label: string;
	subtitle: string;
	searchPlaceholder: string;
	autoLabel: string;
}

export const COPILOT_INTENT_TABS: IntentTabDefinition[] = [
	{
		id: 'document',
		hub: 'copilot',
		label: 'Document',
		subtitle: '= Copilot',
		searchPlaceholder: 'Search or ask in current document... (# heading, @ note, ? help)',
		autoLabel: 'Auto',
	},
	{
		id: 'vault',
		hub: 'vault-intelligence',
		label: 'Vault',
		subtitle: '= Vault Intelligence',
		searchPlaceholder: 'Search or ask across vault... (# in-file, @ folder, ? help)',
		autoLabel: 'Auto',
	},
	{
		id: 'setting',
		hub: 'manage-system',
		label: 'Setting',
		subtitle: '= System',
		searchPlaceholder: 'Search settings, index, models, skills, prompts...',
		autoLabel: 'Auto',
	},
];

const SETTING_ACTION_IDS = new Set([
	'prompt-audit',
	'run-workflow',
]);

const DOCUMENT_WRITING_ACTION_IDS = new Set([
	'continue-writing',
	'rewrite-selection',
	'add-evidence',
	'writing-plan',
	'write-article',
]);

export function getActionIntentTab(action: Pick<CopilotAction, 'id' | 'category'>): IntentTabId {
	if (SETTING_ACTION_IDS.has(action.id)) return 'setting';
	if (action.category === 'document') return 'document';
	if (DOCUMENT_WRITING_ACTION_IDS.has(action.id)) return 'document';
	if (action.category === 'writing') return 'document';
	return 'vault';
}

export function getIntentTabDefinition(id: IntentTabId): IntentTabDefinition {
	return COPILOT_INTENT_TABS.find(tab => tab.id === id) ?? COPILOT_INTENT_TABS[0];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- test/copilot-intent-hub.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/copilot/intent-hub.ts test/copilot-intent-hub.test.ts
git commit -m "feat: add copilot intent hub mapping"
```

---

### Task 2: Add Auto Planner For Document / Vault / Setting

**Files:**
- Create: `src/service/copilot/CopilotAutoPlanner.ts`
- Test: `test/copilot-auto-planner.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/copilot-auto-planner.test.ts`:

```ts
import assert from 'assert';
import { planCopilotAutoRun } from '../src/service/copilot/CopilotAutoPlanner';
import type { CopilotAction, DocumentContext } from '../src/service/copilot/CopilotActionRegistry';

function makeCtx(overrides: Partial<DocumentContext>): DocumentContext {
	return {
		file: { path: 'Strategy Direction.md', basename: 'Strategy Direction' } as any,
		title: 'Strategy Direction',
		content: 'This is a long note about knowledge work, evidence, related notes, tasks, and product strategy. '.repeat(40),
		scope: 'full',
		wordCount: 420,
		tags: [],
		links: [],
		backlinks: 0,
		headingCount: 4,
		isOrphan: true,
		frontmatter: {},
		...overrides,
	};
}

function action(id: string, category: CopilotAction['category'], score: number): CopilotAction {
	return {
		id,
		label: id,
		description: id,
		icon: (() => null) as any,
		category,
		relevance: () => score,
		execute: (async function* () { return { type: 'structured' as const, data: {} }; }) as any,
		ResultPanel: (() => null) as any,
	};
}

const actions = [
	action('suggest-links', 'document', 0.9),
	action('add-evidence', 'writing', 0.8),
	action('polish', 'document', 0.7),
	action('vault-health', 'vault', 0.95),
	action('prompt-audit', 'vault', 1),
	action('translate', 'document', 0.1),
];

const documentPlan = planCopilotAutoRun({
	tab: 'document',
	ctx: makeCtx({ selection: 'selected claim', scope: 'selection' }),
	actions,
});
assert.equal(documentPlan.tab, 'document');
assert.deepStrictEqual(documentPlan.selectedActions.map(item => item.action.id), ['suggest-links', 'add-evidence', 'polish']);
assert.ok(documentPlan.analysisSummary.includes('selection'));
assert.ok(documentPlan.selectedActions[0].reason.length > 0);

const vaultPlan = planCopilotAutoRun({ tab: 'vault', ctx: makeCtx({}), actions });
assert.deepStrictEqual(vaultPlan.selectedActions.map(item => item.action.id), ['vault-health']);

const settingPlan = planCopilotAutoRun({ tab: 'setting', ctx: makeCtx({}), actions });
assert.deepStrictEqual(settingPlan.selectedActions.map(item => item.action.id), ['prompt-audit']);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- test/copilot-auto-planner.test.ts
```

Expected: FAIL because `CopilotAutoPlanner.ts` does not exist.

- [ ] **Step 3: Add deterministic planner**

Create `src/service/copilot/CopilotAutoPlanner.ts`:

```ts
import type { CopilotAction, DocumentContext } from './CopilotActionRegistry';
import { getActionIntentTab, type IntentTabId } from './intent-hub';

export interface PlannedCapability {
	action: CopilotAction;
	score: number;
	reason: string;
	risk: 'read-only' | 'suggests-change' | 'mutates-after-review';
}

export interface CopilotAutoPlan {
	tab: IntentTabId;
	analysisSummary: string;
	signals: string[];
	selectedActions: PlannedCapability[];
	skippedActions: Array<{ action: CopilotAction; reason: string }>;
}

const MAX_ACTIONS_PER_AUTO_RUN = 4;
const MIN_SCORE = 0.35;

function mutationRisk(action: CopilotAction): PlannedCapability['risk'] {
	if (['polish', 'format-polish', 'correct-content', 'rewrite-selection', 'add-evidence'].includes(action.id)) {
		return 'mutates-after-review';
	}
	if (['suggest-tags', 'suggest-links', 'suggest-semantic-links', 'smart-connections'].includes(action.id)) {
		return 'suggests-change';
	}
	return 'read-only';
}

function buildSignals(ctx: DocumentContext): string[] {
	const signals: string[] = [];
	signals.push(ctx.scope === 'selection' ? 'selection active' : 'current note scope');
	if (ctx.isOrphan) signals.push('orphan note');
	if (ctx.links.length < 3) signals.push('few outgoing links');
	if (ctx.tags.length === 0) signals.push('missing tags');
	if (ctx.backlinks === 0) signals.push('no backlinks');
	if (ctx.wordCount > 300) signals.push('long enough for review');
	if (ctx.headingCount > 2) signals.push('structured note');
	return signals;
}

function reasonFor(action: CopilotAction, ctx: DocumentContext, signals: string[]): string {
	if (action.id.includes('link') || action.id === 'smart-connections') {
		return signals.includes('orphan note') || signals.includes('few outgoing links')
			? 'Current note has weak connection signals, so related-note discovery is useful.'
			: 'Related-note discovery may improve navigation from this context.';
	}
	if (action.id === 'add-evidence') {
		return ctx.scope === 'selection'
			? 'Selection can be checked for source-backed support before editing.'
			: 'The note is long enough to inspect for unsupported claims.';
	}
	if (action.id === 'polish' || action.id === 'format-polish') {
		return 'The current note can be improved after recommendations are reviewed.';
	}
	if (action.id === 'vault-health') {
		return 'Vault tab should surface maintenance and health signals first.';
	}
	if (action.id === 'prompt-audit') {
		return 'Setting tab should diagnose system prompts and configuration health.';
	}
	return `Planner selected ${action.label} because it is relevant to the current ${ctx.scope}.`;
}

export function planCopilotAutoRun(params: {
	tab: IntentTabId;
	ctx: DocumentContext;
	actions: CopilotAction[];
}): CopilotAutoPlan {
	const signals = buildSignals(params.ctx);
	const tabActions = params.actions.filter(action => getActionIntentTab(action) === params.tab);
	const ranked = tabActions
		.map(action => ({ action, score: action.relevance(params.ctx) }))
		.sort((a, b) => b.score - a.score);

	const selectedActions = ranked
		.filter(item => item.score >= MIN_SCORE)
		.slice(0, MAX_ACTIONS_PER_AUTO_RUN)
		.map(item => ({
			action: item.action,
			score: item.score,
			reason: reasonFor(item.action, params.ctx, signals),
			risk: mutationRisk(item.action),
		}));

	const skippedActions = ranked
		.filter(item => !selectedActions.some(selected => selected.action.id === item.action.id))
		.map(item => ({
			action: item.action,
			reason: item.score < MIN_SCORE ? 'Low relevance for the current context.' : 'Not needed in the first Auto run.',
		}));

	return {
		tab: params.tab,
		signals,
		analysisSummary: `Auto analyzed ${params.ctx.scope === 'selection' ? 'the active selection' : 'the current note'} and found ${signals.join(', ')}.`,
		selectedActions,
		skippedActions,
	};
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- test/copilot-auto-planner.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/service/copilot/CopilotAutoPlanner.ts test/copilot-auto-planner.test.ts
git commit -m "feat: add copilot auto planner"
```

---

### Task 3: Extract Command Panel View Model

**Files:**
- Create: `src/ui/view/copilot/copilot-command-model.ts`
- Test: `test/copilot-command-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/copilot-command-model.test.ts`:

```ts
import assert from 'assert';
import { buildCopilotCommandModel } from '../src/ui/view/copilot/copilot-command-model';
import type { CopilotAction, DocumentContext } from '../src/service/copilot/CopilotActionRegistry';

function action(id: string, label: string, category: CopilotAction['category'], score: number): CopilotAction {
	return {
		id,
		label,
		description: `${label} description`,
		icon: (() => null) as any,
		category,
		relevance: () => score,
		execute: (async function* () { return { type: 'structured' as const, data: {} }; }) as any,
		ResultPanel: (() => null) as any,
	};
}

const ctx = {
	file: { path: 'A.md', basename: 'A' } as any,
	title: 'A',
	content: 'hello',
	scope: 'full',
	wordCount: 100,
	tags: [],
	links: [],
	backlinks: 0,
	headingCount: 1,
	isOrphan: true,
	frontmatter: {},
} satisfies DocumentContext;

const model = buildCopilotCommandModel({
	ctx,
	activeTab: 'document',
	query: 'link',
	actions: [
		action('suggest-links', 'Suggest Links', 'document', 0.9),
		action('polish', 'Polish Document', 'document', 0.7),
		action('vault-health', 'Vault Health', 'vault', 0.8),
	],
});

assert.equal(model.activeTab.id, 'document');
assert.deepStrictEqual(model.visibleActions.map(item => item.action.id), ['suggest-links']);
assert.deepStrictEqual(model.recommendedActions.map(item => item.action.id), ['suggest-links', 'polish']);
assert.ok(model.contextLine.includes('A.md'));
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- test/copilot-command-model.test.ts
```

Expected: FAIL because the model file does not exist.

- [ ] **Step 3: Add pure view-model builder**

Create `src/ui/view/copilot/copilot-command-model.ts`:

```ts
import type { CopilotAction, DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { COPILOT_INTENT_TABS, getActionIntentTab, getIntentTabDefinition, type IntentTabId } from '@/service/copilot/intent-hub';

export interface CopilotActionListItem {
	action: CopilotAction;
	score: number;
	tab: IntentTabId;
	recommended: boolean;
	disabledReason: string | null;
}

export interface CopilotCommandModel {
	tabs: typeof COPILOT_INTENT_TABS;
	activeTab: ReturnType<typeof getIntentTabDefinition>;
	contextLine: string;
	visibleActions: CopilotActionListItem[];
	recommendedActions: CopilotActionListItem[];
}

export function buildCopilotCommandModel(params: {
	ctx: DocumentContext | null;
	activeTab: IntentTabId;
	query: string;
	actions: CopilotAction[];
}): CopilotCommandModel {
	const normalizedQuery = params.query.trim().toLowerCase();
	const items = params.actions.map(action => {
		const score = params.ctx ? action.relevance(params.ctx) : 0;
		const guard = params.ctx ? action.guard?.(params.ctx) ?? null : action.category === 'document' ? 'Open a document first.' : null;
		return {
			action,
			score,
			tab: getActionIntentTab(action),
			recommended: score >= 0.65,
			disabledReason: guard,
		};
	});

	const visibleActions = items
		.filter(item => item.tab === params.activeTab)
		.filter(item => {
			if (!normalizedQuery) return true;
			return `${item.action.label} ${item.action.description} ${item.action.id}`.toLowerCase().includes(normalizedQuery);
		})
		.sort((a, b) => b.score - a.score);

	const recommendedActions = items
		.filter(item => item.tab === params.activeTab && item.recommended && !item.disabledReason)
		.sort((a, b) => b.score - a.score)
		.slice(0, 4);

	return {
		tabs: COPILOT_INTENT_TABS,
		activeTab: getIntentTabDefinition(params.activeTab),
		contextLine: params.ctx
			? `${params.ctx.file.path} · ${params.ctx.scope === 'selection' ? 'selection active' : 'current note'} · ${params.ctx.wordCount} words`
			: 'No active document · vault and setting actions available',
		visibleActions,
		recommendedActions,
	};
}
```

- [ ] **Step 4: Run tests**

Run:

```bash
npm run test -- test/copilot-command-model.test.ts
npm run test -- test/copilot-intent-hub.test.ts
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/copilot/copilot-command-model.ts test/copilot-command-model.test.ts
git commit -m "feat: add copilot command panel model"
```

---

### Task 4: Replace Static Copilot Picker With Search-Like Tabbed Panel

**Files:**
- Modify: `src/ui/view/copilot/CopilotPickerModal.tsx`
- Uses: `src/ui/view/copilot/copilot-command-model.ts`
- Uses: `src/service/copilot/intent-hub.ts`

- [ ] **Step 1: Implement local UI components**

In `src/ui/view/copilot/CopilotPickerModal.tsx`, replace `CATEGORY_META`, `CATEGORIES`, and old `CopilotPickerContent` with a tabbed panel. Keep the existing `CopilotPickerModal` class and `DocumentContextBuilder` usage.

Use this structure inside the new `CopilotPickerContent`:

```tsx
const CopilotPickerContent: React.FC<{
	onSelect: (action: CopilotAction) => void;
	onAuto: (tab: IntentTabId) => void;
	onBatchTag: () => void;
	ctx: DocumentContext | null;
}> = ({ onSelect, onAuto, ctx }) => {
	const registry = CopilotActionRegistry.getInstance();
	const [activeTab, setActiveTab] = useState<IntentTabId>('document');
	const [query, setQuery] = useState('');
	const model = useMemo(() => buildCopilotCommandModel({
		ctx,
		activeTab,
		query,
		actions: registry.getAll(),
	}), [ctx, activeTab, query]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-background">
			<div className="pktw-grid pktw-grid-cols-3 pktw-bg-muted/50 pktw-border-b pktw-border-border">
				{model.tabs.map(tab => (
					<Button
						key={tab.id}
						variant="ghost"
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							'pktw-relative pktw-flex pktw-h-[72px] pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-1 pktw-rounded-none pktw-bg-transparent pktw-text-sm pktw-font-semibold',
							activeTab === tab.id ? 'pktw-text-pk-accent pktw-bg-background after:pktw-content-[\"\"] after:pktw-absolute after:pktw-left-0 after:pktw-right-0 after:pktw-bottom-0 after:pktw-h-[3px] after:pktw-bg-pk-accent' : 'pktw-text-muted-foreground',
						)}
					>
						<span>{tab.label}</span>
						<span className="pktw-text-[11px] pktw-font-medium pktw-text-muted-foreground">{tab.subtitle}</span>
					</Button>
				))}
			</div>
			<div className="pktw-p-5 pktw-border-b pktw-border-border pktw-space-y-3">
				<div className="pktw-flex pktw-gap-3">
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={model.activeTab.searchPlaceholder}
						className="pktw-h-12 pktw-rounded-full pktw-text-sm"
						autoFocus
					/>
					<Button
						className="pktw-h-12 pktw-min-w-[112px] pktw-rounded-xl pktw-gap-2 pktw-font-semibold"
						onClick={() => onAuto(activeTab)}
					>
						<Sparkles className="pktw-w-4 pktw-h-4" />
						{model.activeTab.autoLabel}
					</Button>
				</div>
				<span className="pktw-block pktw-text-xs pktw-text-muted-foreground">{model.contextLine}</span>
			</div>
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5 pktw-space-y-5">
				<RecommendedActions actions={model.recommendedActions} onSelect={onSelect} />
				<CapabilityList actions={model.visibleActions} onSelect={onSelect} />
			</div>
		</div>
	);
};
```

Use `Button`, not raw `<button>` elements, for tabs and action rows.

- [ ] **Step 2: Add `RecommendedActions` and `CapabilityList`**

Add below `CopilotPickerContent`:

```tsx
function RecommendedActions({
	actions,
	onSelect,
}: {
	actions: CopilotActionListItem[];
	onSelect: (action: CopilotAction) => void;
}) {
	if (actions.length === 0) return null;
	return (
		<div className="pktw-space-y-2">
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Recommended now</span>
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2">
				{actions.map(item => <CapabilityButton key={item.action.id} item={item} onSelect={onSelect} />)}
			</div>
		</div>
	);
}

function CapabilityList({
	actions,
	onSelect,
}: {
	actions: CopilotActionListItem[];
	onSelect: (action: CopilotAction) => void;
}) {
	return (
		<div className="pktw-space-y-2">
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">All capabilities</span>
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2">
				{actions.map(item => <CapabilityButton key={item.action.id} item={item} onSelect={onSelect} />)}
			</div>
		</div>
	);
}

function CapabilityButton({
	item,
	onSelect,
}: {
	item: CopilotActionListItem;
	onSelect: (action: CopilotAction) => void;
}) {
	const Icon = item.action.icon;
	return (
		<Button
			variant="ghost"
			disabled={!!item.disabledReason}
			className={cn(
				'pktw-h-auto pktw-whitespace-normal pktw-justify-start pktw-items-start pktw-gap-3 pktw-p-3 pktw-border pktw-border-border pktw-rounded-lg pktw-text-left hover:pktw-bg-accent/60',
				item.recommended && 'pktw-border-pk-accent/40 pktw-bg-pk-highlight/40',
			)}
			onClick={() => onSelect(item.action)}
		>
			<Icon className="pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-flex-shrink-0 pktw-text-pk-accent" />
			<span className="pktw-flex pktw-flex-col pktw-gap-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">{item.action.label}</span>
				<span className="pktw-text-xs pktw-leading-snug pktw-text-muted-foreground">
					{item.disabledReason ?? item.action.description}
				</span>
			</span>
		</Button>
	);
}
```

- [ ] **Step 3: Wire `onAuto` in `CopilotPickerModal.onOpen()`**

Change the render props:

```ts
onAuto: (tab: IntentTabId) => {
	this.close();
	if (ctx) new CopilotAutoRunModal(app, { tab, ctx }).open();
},
```

At this step `CopilotAutoRunModal` does not exist yet. Temporarily import it after Task 5, or leave this step uncommitted until Task 5 is done. The final commit for Task 4 should compile together with Task 5.

- [ ] **Step 4: Update modal dimensions**

Set:

```ts
this.modalEl.style.width = '980px';
this.modalEl.style.maxWidth = '94vw';
this.modalEl.style.height = 'min(720px, calc(100vh - 96px))';
this.modalEl.style.padding = '0';
this.contentEl.style.padding = '0';
```

- [ ] **Step 5: Defer verification until Task 5**

Do not commit Task 4 alone unless `CopilotAutoRunModal` is stubbed. Continue directly to Task 5.

---

### Task 5: Add Auto Run Modal With Analysis-Style Step Display

**Files:**
- Create: `src/ui/view/copilot/CopilotAutoRunModal.tsx`
- Modify: `src/ui/view/copilot/CopilotPickerModal.tsx`
- Uses: `src/service/copilot/CopilotAutoPlanner.ts`
- Uses: `src/ui/view/copilot/components/CopilotStepTimeline.tsx`

- [ ] **Step 1: Add auto run modal skeleton**

Create `src/ui/view/copilot/CopilotAutoRunModal.tsx`:

```tsx
import { Modal, type App } from 'obsidian';
import React, { useEffect, useState } from 'react';
import { Brain, Check, Loader2, ShieldCheck, X } from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { Button } from '@/ui/component/shared-ui/button';
import type { DocumentContext, ActionResult } from '@/service/copilot/CopilotActionRegistry';
import { CopilotActionRegistry } from '@/service/copilot/CopilotActionRegistry';
import { planCopilotAutoRun, type CopilotAutoPlan, type PlannedCapability } from '@/service/copilot/CopilotAutoPlanner';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import type { V2ToolStep } from '@/ui/view/quick-search/types/search-steps';
import type { LLMStreamEvent } from '@/core/providers/types';
import { v2ToolDisplay, extractV2Summary, unwrapToolOutput } from '@/ui/view/quick-search/types/search-steps';
import { CopilotStepTimeline } from './components/CopilotStepTimeline';

interface CopilotAutoRunModalProps {
	tab: IntentTabId;
	ctx: DocumentContext;
}

interface CapabilityRun {
	capability: PlannedCapability;
	status: 'queued' | 'running' | 'done' | 'error';
	steps: V2ToolStep[];
	result?: ActionResult;
	error?: string;
}

interface AutoRunState {
	plan: CopilotAutoPlan;
	runs: CapabilityRun[];
	status: 'planning' | 'running' | 'review' | 'error' | 'cancelled';
}
```

- [ ] **Step 2: Add stream consumer helper**

In the same file:

```ts
async function consumeCapabilityRun(params: {
	ctx: DocumentContext;
	run: CapabilityRun;
	signal: AbortSignal;
	onUpdate: (run: CapabilityRun) => void;
}): Promise<ActionResult | undefined> {
	const steps: V2ToolStep[] = [];
	const callRegistry = new Map<string, string>();
	const generator = params.run.capability.action.execute(params.ctx, params.signal);

	function updateRun(next: Partial<CapabilityRun>) {
		params.onUpdate({ ...params.run, ...next, steps: [...steps] });
	}

	while (true) {
		if (params.signal.aborted) return;
		const { value, done } = await generator.next();
		if (done) return value as ActionResult | undefined;
		const event = value as LLMStreamEvent;
		if (event.type === 'tool-call') {
			const { id, toolName, input } = event as any;
			callRegistry.set(id, toolName);
			const display = v2ToolDisplay(toolName, input ?? {});
			steps.push({
				id,
				toolName,
				displayName: display.displayName,
				icon: display.icon,
				input: input ?? {},
				status: 'running',
				startedAt: Date.now(),
			});
			updateRun({ status: 'running' });
		}
		if (event.type === 'tool-result') {
			const { id, output } = event as any;
			const idx = steps.findIndex(step => step.id === id);
			const toolName = callRegistry.get(id) ?? 'unknown';
			if (idx >= 0) {
				steps[idx] = {
					...steps[idx],
					status: 'done',
					endedAt: Date.now(),
					summary: extractV2Summary(toolName, output),
					resultPreview: unwrapToolOutput(output).slice(0, 500),
				};
			}
			updateRun({ status: 'running' });
		}
		if (event.type === 'error') {
			throw ((event as any).error instanceof Error ? (event as any).error : new Error(String((event as any).error)));
		}
	}
}
```

- [ ] **Step 3: Add React content component**

Add:

```tsx
const CopilotAutoRunContent: React.FC<{
	tab: IntentTabId;
	ctx: DocumentContext;
	onClose: () => void;
}> = ({ tab, ctx, onClose }) => {
	const [state, setState] = useState<AutoRunState>(() => {
		const plan = planCopilotAutoRun({
			tab,
			ctx,
			actions: CopilotActionRegistry.getInstance().getAll(),
		});
		return {
			plan,
			status: 'planning',
			runs: plan.selectedActions.map(capability => ({ capability, status: 'queued', steps: [] })),
		};
	});

	useEffect(() => {
		const controller = new AbortController();
		let mounted = true;

		async function run() {
			setState(current => ({ ...current, status: 'running' }));
			for (const initialRun of state.runs) {
				if (controller.signal.aborted) break;
				let activeRun: CapabilityRun = { ...initialRun, status: 'running' };
				setState(current => ({
					...current,
					runs: current.runs.map(run => run.capability.action.id === activeRun.capability.action.id ? activeRun : run),
				}));
				try {
					const result = await consumeCapabilityRun({
						ctx,
						run: activeRun,
						signal: controller.signal,
						onUpdate: (updated) => {
							activeRun = updated;
							if (!mounted) return;
							setState(current => ({
								...current,
								runs: current.runs.map(run => run.capability.action.id === updated.capability.action.id ? updated : run),
							}));
						},
					});
					activeRun = result
						? { ...activeRun, status: 'done', result }
						: { ...activeRun, status: 'done' };
					setState(current => ({
						...current,
						runs: current.runs.map(run => run.capability.action.id === activeRun.capability.action.id ? activeRun : run),
					}));
				} catch (error) {
					activeRun = { ...activeRun, status: 'error', error: error instanceof Error ? error.message : String(error) };
					setState(current => ({
						...current,
						status: 'error',
						runs: current.runs.map(run => run.capability.action.id === activeRun.capability.action.id ? activeRun : run),
					}));
					return;
				}
			}
			setState(current => ({ ...current, status: 'review' }));
		}

		void run();
		return () => {
			mounted = false;
			controller.abort();
		};
	}, [ctx, state.plan.tab]);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-background">
			<div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-3 pktw-p-4 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-flex-col pktw-gap-1">
					<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-sm pktw-font-semibold">
						<Brain className="pktw-w-4 pktw-h-4 pktw-text-pk-accent" />
						Auto analysis
					</span>
					<span className="pktw-text-xs pktw-text-muted-foreground">{state.plan.analysisSummary}</span>
				</div>
				<Button variant="ghost" size="icon" onClick={onClose}>
					<X className="pktw-w-4 pktw-h-4" />
				</Button>
			</div>
			<div className="pktw-p-4 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
					{state.plan.signals.map(signal => (
						<span key={signal} className="pktw-rounded-full pktw-border pktw-border-border pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-text-muted-foreground">
							{signal}
						</span>
					))}
				</div>
			</div>
			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-4 pktw-space-y-3">
				{state.runs.map(run => <CapabilityRunCard key={run.capability.action.id} run={run} />)}
			</div>
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-p-4 pktw-border-t pktw-border-border">
				<span className="pktw-text-xs pktw-text-muted-foreground">
					{state.status === 'review' ? 'Ready for review. No changes were applied automatically.' : 'Running selected capabilities. No auto-apply.'}
				</span>
				<Button onClick={onClose} disabled={state.status === 'running'}>
					{state.status === 'review' ? 'Done' : 'Close'}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 4: Add capability run card**

Add:

```tsx
function CapabilityRunCard({ run }: { run: CapabilityRun }) {
	const Icon = run.capability.action.icon;
	return (
		<div className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card pktw-overflow-hidden">
			<div className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3">
				<Icon className="pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-text-pk-accent pktw-shrink-0" />
				<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-min-w-0 pktw-flex-1">
					<div className="pktw-flex pktw-items-center pktw-gap-2">
						<span className="pktw-text-sm pktw-font-semibold">{run.capability.action.label}</span>
						<span className="pktw-rounded-full pktw-bg-muted pktw-px-2 pktw-py-0.5 pktw-text-[10px] pktw-text-muted-foreground">{run.capability.risk}</span>
					</div>
					<span className="pktw-text-xs pktw-text-muted-foreground">{run.capability.reason}</span>
				</div>
				<RunStatus status={run.status} />
			</div>
			{run.steps.length > 0 && (
				<div className="pktw-px-3 pktw-pb-3">
					<CopilotStepTimeline steps={run.steps} collapsed={run.status === 'done'} />
				</div>
			)}
			{run.status === 'done' && run.result && (
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-border-t pktw-border-border pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-muted-foreground">
					<ShieldCheck className="pktw-w-3.5 pktw-h-3.5 pktw-text-green-600" />
					Result ready for review in the capability panel.
				</div>
			)}
			{run.error && (
				<div className="pktw-border-t pktw-border-border pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-destructive">{run.error}</div>
			)}
		</div>
	);
}

function RunStatus({ status }: { status: CapabilityRun['status'] }) {
	if (status === 'running') {
		return <Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin pktw-text-pk-accent" />;
	}
	if (status === 'done') {
		return <Check className="pktw-w-4 pktw-h-4 pktw-text-green-600" />;
	}
	return <span className="pktw-text-[10px] pktw-text-muted-foreground">{status}</span>;
}
```

- [ ] **Step 5: Add modal class**

Add at bottom:

```ts
export class CopilotAutoRunModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private props: CopilotAutoRunModalProps) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.contentEl.addClass('pktw-root');
		this.contentEl.style.padding = '0';
		this.modalEl.style.width = '860px';
		this.modalEl.style.maxWidth = '92vw';
		this.modalEl.style.height = 'min(720px, calc(100vh - 96px))';
		this.modalEl.style.padding = '0';
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotAutoRunContent,
				{ ...this.props, onClose: () => this.close() },
				AppContext.getInstance(),
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
```

- [ ] **Step 6: Wire picker to auto modal**

In `src/ui/view/copilot/CopilotPickerModal.tsx`, import:

```ts
import { CopilotAutoRunModal } from '@/ui/view/copilot/CopilotAutoRunModal';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { buildCopilotCommandModel, type CopilotActionListItem } from './copilot-command-model';
```

Then wire:

```ts
onAuto: (tab: IntentTabId) => {
	this.close();
	if (ctx) new CopilotAutoRunModal(app, { tab, ctx }).open();
},
```

- [ ] **Step 7: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4 and Task 5 together**

```bash
git add src/ui/view/copilot/CopilotPickerModal.tsx src/ui/view/copilot/CopilotAutoRunModal.tsx
git commit -m "feat: add tabbed copilot command panel and auto run modal"
```

---

### Task 6: Make Manual Actions Use The Same Planning Header

**Files:**
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx`
- Modify: `src/ui/view/copilot/components/CopilotStepTimeline.tsx`

- [ ] **Step 1: Add analysis summary above manual run timeline**

In `CopilotResultModal.tsx`, update `StreamingView` so it shows a compact header before `CopilotStepTimeline`:

```tsx
<div className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-muted/30 pktw-p-3">
	<div className="pktw-flex pktw-items-center pktw-gap-2">
		<Loader2 className="pktw-w-4 pktw-h-4 pktw-animate-spin pktw-text-accent" />
		<span className="pktw-text-sm pktw-font-medium">{label}</span>
		<span className="pktw-flex-1" />
		<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-font-mono">{elapsed}s</span>
	</div>
	<span className="pktw-block pktw-mt-1 pktw-text-xs pktw-text-muted-foreground">
		Analyzing context, running tools, then preparing reviewable output. No changes are applied automatically.
	</span>
</div>
```

This replaces the current simple top row in `StreamingView`.

- [ ] **Step 2: Show progress text as inspectable run details**

Replace the raw `progressText` block with:

```tsx
{progressText && (
	<details className="pktw-rounded-md pktw-border pktw-border-border pktw-bg-muted/20 pktw-p-2">
		<summary className="pktw-cursor-pointer pktw-text-xs pktw-font-medium pktw-text-muted-foreground">
			Inspect run details
		</summary>
		<div className="pktw-max-h-[200px] pktw-overflow-y-auto pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-mt-2">
			{progressText}
		</div>
	</details>
)}
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "feat: align manual copilot runs with analysis flow"
```

---

### Task 7: Integrate Command Center With New Intent Hub

**Files:**
- Modify: `src/ui/view/command-center/CommandCenterModal.tsx`
- Modify: `src/app/commands/PeakCommandActions.ts`

- [ ] **Step 1: Add explicit open helpers**

In `src/app/commands/PeakCommandActions.ts`, add:

```ts
export function openDocumentCopilotPanel(): void {
	new CopilotPickerModal(getContext(), { initialTab: 'document' }).open();
}

export function openVaultIntelligencePanel(): void {
	new CopilotPickerModal(getContext(), { initialTab: 'vault' }).open();
}

export function openManageSystemPanel(): void {
	new CopilotPickerModal(getContext(), { initialTab: 'setting' }).open();
}
```

Then update `CopilotPickerModal` constructor in Task 4 implementation to accept:

```ts
constructor(private appContext: AppContext, private options: { initialTab?: IntentTabId } = {}) {
	super(appContext.app);
}
```

and pass `initialTab` into `CopilotPickerContent`.

- [ ] **Step 2: Replace old Command Center sections**

In `src/ui/view/command-center/CommandCenterModal.tsx`, change the `copilot` and `knowledge` actions so the first three entries are:

```ts
{ id: 'document-copilot', label: 'Document', description: 'Run Copilot Auto or search document capabilities.', icon: Sparkles, run: openDocumentCopilotPanel },
{ id: 'vault-intelligence', label: 'Vault', description: 'Analyze, synthesize, or maintain vault knowledge.', icon: Brain, run: openVaultIntelligencePanel },
{ id: 'manage-system', label: 'Setting', description: 'Diagnose index, models, skills, prompts, and system health.', icon: Settings, run: openManageSystemPanel },
```

Keep direct legacy commands as secondary entries only if they are still valuable:

```ts
{ id: 'quick-search', label: 'Vault Search', description: 'Search notes and run AI analysis.', icon: Search, run: openQuickSearch },
{ id: 'related-notes', label: 'Related Notes', description: 'Open ambient related-note suggestions.', icon: Zap, run: openRelatedNotes },
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/commands/PeakCommandActions.ts src/ui/view/command-center/CommandCenterModal.tsx src/ui/view/copilot/CopilotPickerModal.tsx
git commit -m "feat: route command center through intent hub tabs"
```

---

### Task 8: Improve Review Handoff For Auto Runs

**Files:**
- Modify: `src/ui/view/copilot/CopilotAutoRunModal.tsx`
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx`

- [ ] **Step 1: Add per-result review buttons**

In `CapabilityRunCard`, when `run.status === 'done' && run.result`, add:

```tsx
<Button
	variant="outline"
	size="sm"
	onClick={() => new CopilotResultModal(AppContext.getInstance().app, {
		action: run.capability.action,
		ctx: run.ctx,
		initialResult: run.result,
		completedSteps: run.steps,
	}).open()}
>
	Open review
</Button>
```

Then make this type-safe by updating `CopilotResultModalProps` in `CopilotResultModal.tsx`:

```ts
interface CopilotResultModalProps {
	action: CopilotAction;
	ctx: DocumentContext;
	initialResult?: ActionResult;
	completedSteps?: V2ToolStep[];
}
```

In `onOpen()`, if `initialResult` exists, set:

```ts
const initialPhase: ModalPhase = this.props.initialResult
	? {
		phase: 'result',
		data: this.props.initialResult.type === 'structured'
			? this.props.initialResult.data
			: this.props.initialResult.type === 'stream'
				? this.props.initialResult.text
				: this.props.initialResult,
		usage: this.props.initialResult.type === 'structured' || this.props.initialResult.type === 'stream'
			? this.props.initialResult.usage
			: undefined,
		completedSteps: this.props.completedSteps,
	}
	: { phase: 'loading', startTime: Date.now() };
```

Only start the async execution block when `!this.props.initialResult`.

- [ ] **Step 2: Pass `ctx` and completed steps from Auto run**

Store `ctx` in the `CapabilityRun` object:

```ts
interface CapabilityRun {
	ctx: DocumentContext;
	capability: PlannedCapability;
	status: 'queued' | 'running' | 'done' | 'error';
	steps: V2ToolStep[];
	result?: ActionResult;
	error?: string;
}
```

Initialize:

```ts
runs: plan.selectedActions.map(capability => ({ ctx, capability, status: 'queued', steps: [] })),
```

Then `Open review` becomes:

```tsx
new CopilotResultModal(AppContext.getInstance().app, {
	action: run.capability.action,
	ctx: run.ctx,
	initialResult: run.result,
	completedSteps: run.steps,
}).open()
```

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/copilot/CopilotAutoRunModal.tsx src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "feat: add review handoff from copilot auto runs"
```

---

### Task 9: Add Rendered Diff Follow-Up Plan, But Do Not Block Panel Flow

**Files:**
- Create: `docs/superpowers/plans/2026-05-16-copilot-rendered-diff-followup.md`

- [ ] **Step 1: Create a follow-up plan**

Create a separate plan for full rendered Markdown diff. Keep it out of this implementation branch because it touches document mutation semantics and needs a deeper apply/undo design.

Content:

```md
# Copilot Rendered Diff Follow-Up Plan

Goal: Add full-document rendered Markdown diff for high-risk Copilot mutations.

Initial candidates:
- polish
- format-polish
- correct-content
- rewrite-selection
- add-evidence when it changes more than one block

Required surfaces:
- current rendered Markdown
- proposed rendered Markdown
- red deletion rail
- green addition rail
- per-block accept/reject
- apply selected
- reject all
- undo
- inspect raw Markdown diff

This plan depends on the Copilot Panel Flow implementation being merged first.
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-05-16-copilot-rendered-diff-followup.md
git commit -m "docs: plan copilot rendered diff follow-up"
```

---

### Task 10: Final Verification

**Files:**
- All modified files from previous tasks.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm run test -- test/copilot-intent-hub.test.ts
npm run test -- test/copilot-auto-planner.test.ts
npm run test -- test/copilot-command-model.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test in Obsidian**

Use a real note with selection active:

1. Run `Peak Assistant: Open Copilot`.
2. Confirm the pop-out shows top tabs: `Document`, `Vault`, `Setting`.
3. Confirm `Document` is active by default and uses the large rounded command input.
4. Click `Auto`.
5. Confirm the Auto run modal shows context signals and multiple capability cards.
6. Confirm each running capability shows step rows similar to AI Analysis.
7. Confirm no result is auto-applied.
8. Click `Open review` on a completed capability.
9. Confirm the existing result panel opens with completed steps collapsed at top.
10. Reopen Command Center and confirm `Document`, `Vault`, and `Setting` route into the same panel.

- [ ] **Step 4: Hygiene checks**

Run:

```bash
git diff --check
```

Expected: no whitespace errors.

- [ ] **Step 5: Commit final fixes**

If any verification fixes were needed:

```bash
git add <changed-files>
git commit -m "fix: polish copilot panel flow implementation"
```

---

## Scope Guardrails

- Do not delete existing actions in this implementation. Hide/re-rank and route through aliases first.
- Do not implement rendered full-document diff in this branch. Add the follow-up plan and keep the panel flow shippable.
- Do not replace AI Analysis timeline helpers. Reuse them so Copilot and Analysis feel like one product.
- Do not auto-apply document mutations. Auto means auto-plan and auto-run discovery, not auto-write.
- Do not redesign Chat or Quick Search outside the shared command entry points.

## Self-Review

Spec coverage:
- Search-like top tabs are covered by Task 4.
- Auto in every tab is covered by Task 2, Task 4, and Task 5.
- Each capability showing Analysis-style steps is covered by Task 5 and Task 6.
- Command Center routing into Document / Vault / Setting is covered by Task 7.
- Review/apply safety is covered by Task 8 and follow-up Task 9.

Placeholder scan:
- No `TBD`, `TODO`, or "implement later" placeholders are used as implementation instructions.
- Rendered diff is explicitly scoped as a separate follow-up plan, not a hidden placeholder in this plan.

Type consistency:
- `IntentTabId` is defined in `intent-hub.ts` and reused by planner, command model, picker, and auto modal.
- `CopilotAutoPlan` and `PlannedCapability` are defined in `CopilotAutoPlanner.ts` and reused by `CopilotAutoRunModal.tsx`.
- `V2ToolStep` remains the shared step type for AI Analysis and Copilot.
