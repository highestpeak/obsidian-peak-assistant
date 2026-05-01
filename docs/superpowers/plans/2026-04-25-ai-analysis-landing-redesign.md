# AI Analysis Landing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AI Analysis idle landing page: mode dropdown menu, suggestion cards with action/context split, full-width infinite-scroll recent list, and polished active sessions cards.

**Architecture:** Modify 4 existing components (SearchModal, SuggestionGrid, RecentAnalysisList, ActiveSessionsList). Add `actionLabel` field to `MatchedSuggestion` by splitting template at the first `{variable}`. No new files — all changes are in-place UI refinements following the approved mockup at `docs/mockups/ai-analysis-landing-v2.html`.

**Tech Stack:** React 18, Tailwind (pktw- prefix), Zustand, lucide-react icons, IntersectionObserver for infinite scroll.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/service/context/PatternMatcher.ts:21-30,221-236` | Modify | Add `actionLabel` to `MatchedSuggestion`, split template at first variable |
| `src/ui/view/quick-search/SearchModal.tsx:71-74,149,186-218` | Modify | Mode dropdown menu, dynamic placeholder, wire `showModeMenu` state |
| `src/ui/view/quick-search/components/SuggestionGrid.tsx:32-96` | Modify | Card redesign — action/context/highlight/tag layout |
| `src/ui/view/quick-search/components/RecentAnalysisList.tsx:13-96` | Modify | Full-width rows, infinite scroll via IntersectionObserver |
| `src/ui/view/quick-search/components/ActiveSessionsList.tsx:35-122` | Modify | Progress bar for streaming, "Review Plan →" button for plan-ready, blue highlight |

---

### Task 1: Add `actionLabel` to MatchedSuggestion

**Files:**
- Modify: `src/service/context/PatternMatcher.ts:21-30` (interface)
- Modify: `src/service/context/PatternMatcher.ts:221-236` (matchPatterns builder)

- [ ] **Step 1: Add `actionLabel` field to the interface**

```typescript
// src/service/context/PatternMatcher.ts:21-30
export interface MatchedSuggestion {
	patternId: string;
	filledTemplate: string;
	/** The static action portion of the template (before the first variable). */
	actionLabel: string;
	variables: string[];
	source: string;
	confidence: number;
	usageCount: number;
	contextType: 'activeDoc' | 'outlinks' | 'folder' | 'tags' | 'backlinks' | 'recent' | 'general';
	contextTags: string[];
}
```

- [ ] **Step 2: Compute `actionLabel` in `matchPatterns`**

Extract the static prefix from the template (everything before the first `{variable}`). If the template has no variables, use the full template as the action label.

```typescript
// Inside the for loop in matchPatterns, after line 221
const filled = fillTemplate(pattern.template, pattern.variables, ctx);
if (filled === null) continue;

// Split action from context: everything before the first {variable} is the action
const firstVarIdx = pattern.template.search(/\{[^}]+\}/);
const actionLabel = firstVarIdx > 0
	? pattern.template.slice(0, firstVarIdx).trim()
	: pattern.template;

const contextType = inferContextType(pattern.variables);
const contextTags = buildContextTags(pattern.variables, ctx);

results.push({
	patternId: pattern.id,
	filledTemplate: filled,
	actionLabel,
	variables: pattern.variables,
	source: pattern.source,
	confidence: pattern.confidence,
	usageCount: pattern.usage_count,
	contextType,
	contextTags,
});
```

- [ ] **Step 3: Build and verify no type errors**

Run: `npm run build`
Expected: Build succeeds. SuggestionGrid will still compile since `actionLabel` is additive.

- [ ] **Step 4: Commit**

```bash
git add src/service/context/PatternMatcher.ts
git commit -m "feat(suggestion): add actionLabel field to MatchedSuggestion"
```

---

### Task 2: Mode Dropdown Menu in SearchModal

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:71-74,149,186-218`

The current code has `showModeMenu` state (line 149) and `ChevronDown` import (line 4) already added but unused. The mode badge at line 200-218 currently calls `cyclePreset(1)` on click. Replace with a dropdown menu matching the mockup.

- [ ] **Step 1: Add dynamic placeholder to PRESET_LABELS**

```typescript
// src/ui/view/quick-search/SearchModal.tsx:71-74
export const PRESET_LABELS: Record<AnalysisMode, { short: string; full: string; placeholder: string }> = {
	vaultFull: { short: 'Vault Analysis', full: 'Vault Analysis · Deep analysis whole vault.', placeholder: 'Ask AI anything about your vault...' },
	aiGraph: { short: 'AI Graph', full: 'AI Graph · Build interactive knowledge graphs.', placeholder: 'Describe the knowledge graph you want to build...' },
};
```

- [ ] **Step 2: Add a ref for the badge to measure its width dynamically**

Right after `showModeMenu` state (line 149), add:

```typescript
const modeBadgeRef = useRef<HTMLDivElement>(null);
const [badgePadding, setBadgePadding] = useState(130);

// Sync input padding with badge width
useEffect(() => {
	if (modeBadgeRef.current) {
		setBadgePadding(modeBadgeRef.current.offsetWidth + 16);
	}
}, [analysisMode]);
```

Ensure `useRef` is imported (it already is via the `inputRef` on line 77).

- [ ] **Step 3: Add click-outside handler for the dropdown**

```typescript
// After the badgePadding effect
useEffect(() => {
	if (!showModeMenu) return;
	const handler = (e: MouseEvent) => {
		if (modeBadgeRef.current?.contains(e.target as Node)) return;
		setShowModeMenu(false);
	};
	document.addEventListener('mousedown', handler);
	return () => document.removeEventListener('mousedown', handler);
}, [showModeMenu]);
```

- [ ] **Step 4: Replace the mode badge IIFE (lines 200-218) with dropdown**

Replace the entire `{(() => { ... })()}` block with:

```tsx
{/* Mode dropdown */}
<div ref={modeBadgeRef} className="pktw-absolute pktw-left-2 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10">
	<div
		style={{ cursor: 'pointer' }}
		onClick={() => setShowModeMenu((v) => !v)}
		className={cn(
			'pktw-flex pktw-items-center pktw-h-6 pktw-px-2 pktw-rounded-full pktw-text-[10px] pktw-font-medium pktw-select-none pktw-transition-all',
			'pktw-bg-[#f5f3ff] pktw-text-pk-accent pktw-border pktw-border-[#7c3aed]/20 hover:pktw-bg-[#ede9fe]'
		)}
		title={`${PRESET_LABELS[analysisMode].full} (⌥↑/⌥↓ to switch)`}
	>
		{analysisMode === 'aiGraph' ? <Network className="pktw-w-3 pktw-h-3 pktw-mr-1" /> : <Brain className="pktw-w-3 pktw-h-3 pktw-mr-1" />}
		{PRESET_LABELS[analysisMode].short}
		<ChevronDown className={cn('pktw-w-2.5 pktw-h-2.5 pktw-ml-0.5 pktw-opacity-60 pktw-transition-transform', showModeMenu && 'pktw-rotate-180')} />
	</div>
	{showModeMenu && (
		<div className="pktw-absolute pktw-top-full pktw-left-0 pktw-mt-1 pktw-bg-pk-background pktw-border pktw-border-pk-border pktw-rounded-lg pktw-shadow-lg pktw-py-1 pktw-z-50 pktw-min-w-[200px]">
			{PRESETS.map((p) => {
				const Icon = p === 'aiGraph' ? Network : Brain;
				return (
					<div
						key={p}
						onClick={() => { setAnalysisMode(p); setShowModeMenu(false); }}
						className={cn(
							'pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3 pktw-py-2 pktw-text-xs pktw-cursor-pointer pktw-transition-colors',
							analysisMode === p
								? 'pktw-text-pk-accent pktw-font-medium pktw-bg-pk-accent/5'
								: 'pktw-text-pk-foreground hover:pktw-bg-gray-50'
						)}
					>
						<div className={cn(
							'pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
							analysisMode === p ? 'pktw-bg-pk-accent pktw-text-white' : 'pktw-bg-[#f3f4f6] pktw-text-pk-foreground-muted pktw-border pktw-border-pk-border'
						)}>
							<Icon className="pktw-w-3.5 pktw-h-3.5" />
						</div>
						<div className="pktw-flex-1">
							<span className="pktw-block pktw-font-medium">{PRESET_LABELS[p].short}</span>
							<span className="pktw-block pktw-text-[10px] pktw-text-pk-foreground-muted pktw-font-normal">{PRESET_LABELS[p].full.split('·')[1]?.trim()}</span>
						</div>
					</div>
				);
			})}
			<div className="pktw-border-t pktw-border-pk-border pktw-mt-1 pktw-pt-1 pktw-px-3 pktw-pb-1">
				<span className="pktw-text-[10px] pktw-text-pk-foreground-muted">⌥↑ ⌥↓ to switch</span>
			</div>
		</div>
	)}
</div>
```

- [ ] **Step 5: Update CodeMirrorInput placeholder and padding**

Change the `CodeMirrorInput` (currently line 187-199):
- `placeholder` prop: `{PRESET_LABELS[analysisMode].placeholder}`
- `containerClassName`: replace `pktw-pl-4` with dynamic padding: `` `pktw-pl-[${badgePadding}px]` `` — but Tailwind doesn't support dynamic values. Use inline style instead:

```tsx
<CodeMirrorInput
	ref={inputRef}
	value={searchQuery}
	onChange={setSearchQuery}
	onKeyDown={handleInputKeyDown}
	onEnterSubmit={handleAnalyze}
	placeholder={PRESET_LABELS[analysisMode].placeholder}
	enableSearchTags={true}
	singleLine={true}
	disabled={isInputFrozen}
	containerClassName="pktw-flex-1 pktw-min-w-0 pktw-pr-16 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all pktw-z-0"
	containerStyle={{ paddingLeft: `${badgePadding}px` }}
	className="pktw-pr-4"
/>
```

**Note:** `CodeMirrorInput` may not accept `containerStyle`. Check the component props — if it doesn't, add a wrapping `<div style={{ paddingLeft: ... }}>` around the input, OR pass the padding via `containerClassName` using a fixed value for each mode (e.g., `analysisMode === 'aiGraph' ? 'pktw-pl-[100px]' : 'pktw-pl-[135px]'`).

- [ ] **Step 6: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx
git commit -m "feat(ai-analysis): mode dropdown menu with dynamic placeholder"
```

---

### Task 3: Suggestion Card Action/Context Split

**Files:**
- Modify: `src/ui/view/quick-search/components/SuggestionGrid.tsx:32-96`

Redesign the `SuggestionCard` to show:
1. **Action label** — bold, prominent (from `suggestion.actionLabel`)
2. **Context** — muted text with variable values highlighted in yellow
3. **Scope tag** — monospace badge from `suggestion.contextTags[0]`

- [ ] **Step 1: Build the context string with highlights**

The `filledTemplate` contains the full query. The `actionLabel` is the static prefix. The context is `filledTemplate` with `actionLabel` stripped. We need to highlight the variable values inside the context. The variable values can be extracted by comparing `filledTemplate` against the template.

Since we don't have the raw template in the UI, use a simpler approach: the context is everything in `filledTemplate` after `actionLabel`, and `contextTags` already carry the scope info.

- [ ] **Step 2: Rewrite SuggestionCard**

```tsx
const SuggestionCard: React.FC<{
	suggestion: MatchedSuggestion;
	onSelect: (suggestion: MatchedSuggestion) => void;
}> = ({ suggestion, onSelect }) => {
	const { actionLabel, filledTemplate, contextTags } = suggestion;
	// Context = everything after the action prefix
	const context = filledTemplate.startsWith(actionLabel)
		? filledTemplate.slice(actionLabel.length).trim()
		: filledTemplate;
	const scopeTag = contextTags[0] ?? null;

	return (
		<div
			onClick={() => onSelect(suggestion)}
			className={cn(
				'pktw-flex pktw-flex-col pktw-gap-2 pktw-p-3.5 pktw-border pktw-border-pk-border pktw-rounded-lg',
				'pktw-bg-pk-background hover:pktw-border-[#7c3aed]/40 hover:pktw-bg-[#f5f3ff]',
				'pktw-cursor-pointer pktw-transition-all pktw-group',
			)}
		>
			<span className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground pktw-leading-snug group-hover:pktw-text-pk-accent pktw-transition-colors">
				{actionLabel}
			</span>
			{context && (
				<span className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-relaxed pktw-line-clamp-2">
					{context}
				</span>
			)}
			{scopeTag && (
				<span className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-[10px] pktw-font-mono pktw-text-pk-accent pktw-bg-[#ede9fe] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-w-fit">
					{scopeTag}
				</span>
			)}
		</div>
	);
};
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/SuggestionGrid.tsx
git commit -m "feat(suggestion): action/context split with scope tag badge"
```

---

### Task 4: Full-Width Infinite-Scroll Recent List

**Files:**
- Modify: `src/ui/view/quick-search/components/RecentAnalysisList.tsx:13-96`

Replace the fixed-limit list with infinite scroll using IntersectionObserver. Items span full width with icon badge.

- [ ] **Step 1: Redesign AnalysisRow for full-width layout**

```tsx
const AnalysisRow: React.FC<{
	record: AIAnalysisHistoryRecord;
	onSelectQuery: (query: string) => void;
}> = ({ record, onSelectQuery }) => {
	const isGraph = record.analysis_preset === 'aiGraph';
	const Icon = isGraph ? Network : Brain;
	const title = record.title ?? record.query ?? 'Untitled analysis';

	return (
		<div
			onClick={() => record.query && onSelectQuery(record.query)}
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-3 pktw-px-1 pktw-py-2.5',
				'pktw-border-b pktw-border-pk-border/50 last:pktw-border-b-0',
				'hover:pktw-bg-[#f5f3ff] pktw-cursor-pointer pktw-transition-colors pktw-group',
			)}
		>
			<div className="pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0 pktw-bg-[#ede9fe] pktw-text-pk-accent">
				<Icon className="pktw-w-3.5 pktw-h-3.5" />
			</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-block group-hover:pktw-text-pk-accent pktw-transition-colors">
					{title}
				</span>
				<span className="pktw-text-[11px] pktw-text-pk-foreground-muted">
					{record.sources_count != null ? `${record.sources_count} sources · ` : ''}
					{humanReadableTime(record.created_at_ts)}
				</span>
			</div>
			<span className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-shrink-0">
				{humanReadableTime(record.created_at_ts)}
			</span>
		</div>
	);
};
```

- [ ] **Step 2: Rewrite RecentAnalysisList with infinite scroll**

```tsx
export const RecentAnalysisList: React.FC<RecentAnalysisListProps> = ({
	onSelectQuery,
	limit = 15,
}) => {
	const [records, setRecords] = useState<AIAnalysisHistoryRecord[]>([]);
	const [totalCount, setTotalCount] = useState(0);
	const [loading, setLoading] = useState(false);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const offsetRef = useRef(0);
	const doneRef = useRef(false);

	const loadMore = useCallback(async () => {
		if (loading || doneRef.current) return;
		setLoading(true);
		try {
			const svc = AppContext.getInstance().aiAnalysisHistoryService;
			const [rows, count] = await Promise.all([
				svc.list({ limit, offset: offsetRef.current }),
				offsetRef.current === 0 ? svc.count() : Promise.resolve(totalCount),
			]);
			if (offsetRef.current === 0) setTotalCount(count);
			if (rows.length < limit) doneRef.current = true;
			offsetRef.current += rows.length;
			setRecords((prev) => [...prev, ...rows]);
		} catch (e) {
			console.warn('[RecentAnalysisList] load failed:', e);
		} finally {
			setLoading(false);
		}
	}, [limit, totalCount, loading]);

	// Initial load
	useEffect(() => { void loadMore(); }, []);

	// IntersectionObserver for infinite scroll
	useEffect(() => {
		const el = sentinelRef.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			(entries) => { if (entries[0]?.isIntersecting) void loadMore(); },
			{ rootMargin: '200px' },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, [loadMore]);

	if (records.length === 0 && !loading) return null;

	return (
		<div className="pktw-border-t pktw-border-pk-border/50 pktw-mt-2">
			<span className="pktw-block pktw-text-[10px] pktw-font-medium pktw-uppercase pktw-tracking-widest pktw-text-pk-foreground-muted pktw-pt-4 pktw-pb-2">
				Recent
			</span>
			<div className="pktw-flex pktw-flex-col">
				{records.map((r) => (
					<AnalysisRow key={r.id ?? r.vault_rel_path} record={r} onSelectQuery={onSelectQuery} />
				))}
			</div>
			<div ref={sentinelRef}>
				{loading && (
					<div className="pktw-py-3 pktw-text-center pktw-text-xs pktw-text-pk-foreground-muted">
						Loading...
					</div>
				)}
			</div>
		</div>
	);
};
```

Ensure `useRef`, `useCallback` are imported from React. Also import `Network` from lucide-react (check existing imports first).

- [ ] **Step 3: Remove the "View all N analyses →" button**

The infinite scroll replaces it. Delete the `{totalCount > limit && (...)}` block entirely.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/quick-search/components/RecentAnalysisList.tsx
git commit -m "feat(recent): full-width rows with infinite scroll"
```

---

### Task 5: Active Sessions Card Polish

**Files:**
- Modify: `src/ui/view/quick-search/components/ActiveSessionsList.tsx:35-122`

Add progress bar for streaming sessions, blue highlight for plan-ready, and "Review Plan →" button.

- [ ] **Step 1: Redesign SessionCard**

```tsx
const SessionCard: React.FC<{
	session: BackgroundSession;
	onRestore: (id: string) => void;
	onCancel: (id: string) => void;
}> = ({ session, onRestore, onCancel }) => {
	const cfg = STATUS_CONFIG[session.status] ?? STATUS_CONFIG.streaming;
	const { Icon } = cfg;
	const elapsed = Date.now() - session.createdAt;
	const elapsedStr = formatDuration(elapsed);
	const isPlanReady = session.status === 'plan-ready';

	return (
		<div
			onClick={() => onRestore(session.id)}
			className={cn(
				'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3.5 pktw-py-2.5',
				'pktw-rounded-lg pktw-border pktw-cursor-pointer pktw-transition-all pktw-group',
				isPlanReady
					? 'pktw-border-[#93c5fd] pktw-bg-[#eff6ff] hover:pktw-border-[#60a5fa] hover:pktw-bg-[#dbeafe]'
					: 'pktw-border-pk-border pktw-bg-pk-background hover:pktw-border-[#7c3aed]/25 hover:pktw-bg-[#faf8ff]'
			)}
		>
			<div className={cn(
				'pktw-w-7 pktw-h-7 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
				isPlanReady ? 'pktw-bg-[#dbeafe] pktw-text-[#2563eb]' :
				session.status === 'streaming' ? 'pktw-bg-[#ede9fe] pktw-text-pk-accent' :
				'pktw-bg-[#f3f4f6] pktw-text-pk-foreground-muted'
			)}>
				<Icon
					className={cn('pktw-w-3.5 pktw-h-3.5', cfg.spin && 'pktw-animate-spin')}
				/>
			</div>
			<div className="pktw-flex-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground pktw-truncate pktw-block">
					{session.title ?? session.query.slice(0, 60)}
				</span>
				<span className="pktw-text-xs pktw-text-pk-foreground-muted">
					<span className="pktw-font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
					{' · '}{elapsedStr}
				</span>
			</div>
			{session.status === 'streaming' && (
				<div className="pktw-w-14 pktw-shrink-0">
					<div className="pktw-h-1 pktw-bg-pk-border pktw-rounded-full pktw-overflow-hidden">
						<div className="pktw-h-full pktw-bg-pk-accent pktw-rounded-full pktw-animate-pulse" style={{ width: '65%' }} />
					</div>
				</div>
			)}
			{isPlanReady && (
				<span
					onClick={(e) => { e.stopPropagation(); onRestore(session.id); }}
					className="pktw-text-[11px] pktw-font-semibold pktw-text-[#2563eb] pktw-bg-[#dbeafe] pktw-border pktw-border-[#93c5fd] pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-shrink-0 pktw-cursor-pointer hover:pktw-bg-[#bfdbfe] pktw-transition-colors"
				>
					Review Plan →
				</span>
			)}
			<div
				onClick={(e) => { e.stopPropagation(); onCancel(session.id); }}
				className={cn(
					'pktw-w-6 pktw-h-6 pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0',
					'pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-all',
					'pktw-text-pk-foreground-muted hover:pktw-bg-[#fee2e2] hover:pktw-text-[#dc2626] pktw-cursor-pointer',
				)}
				title="Cancel"
			>
				<X className="pktw-w-3.5 pktw-h-3.5" />
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/ActiveSessionsList.tsx
git commit -m "feat(active-sessions): progress bar, plan-ready highlight, review button"
```

---

### Task 6: Integration Polish

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:288-329` (idle landing container)

- [ ] **Step 1: Ensure single scroll zone spacing**

The idle landing wrapper (line 289) already has `pktw-px-4 pktw-py-3`. Verify all three child components (SuggestionGrid, ActiveSessionsList, RecentAnalysisList) render naturally inside this single scroll zone with no nested overflow containers.

Add spacing gaps between sections if not already present:

```tsx
{!searchQuery && sessionStatus === 'idle' && (
	<div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto pktw-py-3">
		<SuggestionGrid ... />
		<ActiveSessionsList ... />
		<RecentAnalysisList ... />
		{suggestions.length === 0 && totalAnalysisCount === 0 && (
			<div className="pktw-px-4 pktw-py-8 pktw-text-center pktw-text-sm pktw-text-pk-foreground-muted">
				No analyses yet. Type a question above or click a suggestion to get started.
			</div>
		)}
	</div>
)}
```

Note: remove `pktw-px-4` from the wrapper — let each child component control its own horizontal padding so RecentAnalysisList items can span full width.

- [ ] **Step 2: Build and smoke test**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx
git commit -m "refactor(ai-analysis): polish idle landing spacing and scroll zone"
```
