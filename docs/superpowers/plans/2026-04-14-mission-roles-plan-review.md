# Mission Roles + Plan Review Enhancement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add McKinsey Block Mission Roles to plan_sections, show framework coverage + insights in plan review UI, and allow user notes before report generation.

**Architecture:** Agent assigns a mission_role to each plan_section from a fixed enum. Plan review UI shows two layers: framework coverage badges (top) + section insight cards (bottom) + user notes input. Mission role and user notes are passed to section generation prompts.

**Tech Stack:** Zod schema, Zustand store, React, Handlebars templates

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/service/agents/vault-sdk/vaultMcpServer.ts` | Modify | Add `mission_role` to plan_sections schema |
| `src/ui/view/quick-search/store/searchSessionStore.ts` | Modify | Add `missionRole` to V2Section, add `v2UserNotes` field |
| `templates/prompts/ai-analysis-vault-sdk-playbook.md` | Modify | Add mission roles list + constraints to Report Planning |
| `src/ui/view/quick-search/components/V2PlanReview.tsx` | Modify | Framework coverage bar + mission role badges + user notes input |
| `templates/prompts/ai-analysis-report-section.md` | Modify | Add `missionRole` and `userNotes` variables |
| `templates/prompts/ai-analysis-report-section-system.md` | Modify | Add per-role writing guidance |
| `src/service/prompt/PromptId.ts` | Modify | Add template variables |
| `src/service/agents/report/ReportOrchestrator.ts` | Modify | Pass missionRole + userNotes to prompt |
| `src/ui/view/quick-search/hooks/useSearchSession.ts` | Modify | Extract mission_role from tool call |

---

### Task 1: Schema + Store — mission_role and userNotes

**Files:**
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts:273` (SubmitPlanInput)
- Modify: `src/service/agents/vault-sdk/vaultMcpServer.ts:420` (Zod schema)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:47` (V2Section)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:116` (state interface)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:265` (INITIAL_STATE)

- [ ] **Step 1: Add mission_role to SubmitPlanInput**

In `vaultMcpServer.ts`, add `mission_role` to the plan_sections item in the interface:
```ts
plan_sections?: Array<{
    id: string;
    title: string;
    content_type: string;
    visual_type: string;
    evidence_paths: string[];
    brief: string;
    weight: number;
    mission_role: string;
}>;
```

- [ ] **Step 2: Add mission_role to Zod schema**

In the `plan_sections` Zod schema, add:
```ts
mission_role: z.enum([
    'synthesis',
    'contradictions',
    'trade_off',
    'action_plan',
    'risk_audit',
    'roadmap',
    'decomposition',
    'blindspots',
    'probing_horizon',
]).describe('Block mission role from McKinsey report framework'),
```

- [ ] **Step 3: Add missionRole to V2Section interface**

In `searchSessionStore.ts`, add to V2Section:
```ts
export interface V2Section {
    // ... existing fields ...
    missionRole: string;
    // ... rest ...
}
```

- [ ] **Step 4: Add v2UserNotes to state**

In the state interface, after `v2PlanApproved`:
```ts
/** User notes to guide report generation */
v2UserNotes: string;
```

In INITIAL_STATE:
```ts
v2UserNotes: '',
```

In startSession reset:
```ts
v2UserNotes: '',
```

Add action:
```ts
setUserNotes: (notes: string) => void;
```

Implementation:
```ts
setUserNotes: (notes) => set({ v2UserNotes: notes }),
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/service/agents/vault-sdk/vaultMcpServer.ts src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(schema): add mission_role to plan_sections, v2UserNotes to store"
```

---

### Task 2: Playbook — Mission roles constraints

**Files:**
- Modify: `templates/prompts/ai-analysis-vault-sdk-playbook.md`

- [ ] **Step 1: Add Mission Roles to Report Planning section**

Find the `## Report Planning` section in the playbook. After the existing Step 2 (Section Plan), add a new Step 2.5:

```markdown
### Step 2.5: Assign Mission Roles
Each section must have a `mission_role` from this list. Choose based on what the section DOES, not just its topic:

| Mission Role | Purpose | When to use |
|---|---|---|
| `synthesis` | Core conclusion, key finding | Always include at least one |
| `contradictions` | Surface tensions, conflicting evidence | When evidence conflicts exist |
| `trade_off` | Compare options on multiple axes | When evaluating alternatives |
| `action_plan` | Concrete next steps with timeline | Always include at least one |
| `risk_audit` | Pre-mortem, what could go wrong | When user is about to decide/execute |
| `roadmap` | Evolutionary path, phased plan | When long-term progression matters |
| `decomposition` | First principles breakdown | When exploring new/complex domains |
| `blindspots` | Missing perspectives, gaps | When evidence is one-sided |
| `probing_horizon` | Follow-up exploration directions | Optional, for iterative queries |

**Constraints:**
- MUST include at least one `synthesis` section
- MUST include at least one `action_plan` section
- MUST vary roles — no more than 2 sections with the same role
- At least one section MUST have a Mermaid visualization (visual_type != 'none')
```

- [ ] **Step 2: Update vault_submit_plan format**

In the `## vault_submit_plan Format` section, add `mission_role` to the plan_sections description:
```
  - `mission_role`: one of synthesis | contradictions | trade_off | action_plan | risk_audit | roadmap | decomposition | blindspots | probing_horizon
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add templates/prompts/ai-analysis-vault-sdk-playbook.md
git commit -m "feat(playbook): add mission roles constraints to report planning"
```

---

### Task 3: Plan Review UI — Framework coverage + mission role badges + user notes

**Files:**
- Modify: `src/ui/view/quick-search/components/V2PlanReview.tsx`

- [ ] **Step 1: Add mission role labels constant**

At the top of the file, add:
```tsx
const MISSION_ROLE_LABELS: Record<string, { label: string; color: string }> = {
    synthesis: { label: 'Synthesis', color: 'pktw-bg-emerald-100 pktw-text-emerald-700' },
    contradictions: { label: 'Contradictions', color: 'pktw-bg-red-100 pktw-text-red-700' },
    trade_off: { label: 'Trade-off', color: 'pktw-bg-amber-100 pktw-text-amber-700' },
    action_plan: { label: 'Action Plan', color: 'pktw-bg-blue-100 pktw-text-blue-700' },
    risk_audit: { label: 'Risk Audit', color: 'pktw-bg-orange-100 pktw-text-orange-700' },
    roadmap: { label: 'Roadmap', color: 'pktw-bg-indigo-100 pktw-text-indigo-700' },
    decomposition: { label: 'Decomposition', color: 'pktw-bg-violet-100 pktw-text-violet-700' },
    blindspots: { label: 'Blindspots', color: 'pktw-bg-pink-100 pktw-text-pink-700' },
    probing_horizon: { label: 'Probing Horizon', color: 'pktw-bg-cyan-100 pktw-text-cyan-700' },
};

const REQUIRED_ROLES = ['synthesis', 'action_plan'];
```

- [ ] **Step 2: Add framework coverage bar**

Before the section cards, add a framework coverage display:
```tsx
{/* Framework coverage */}
<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mb-4 pktw-px-1">
    {Object.entries(MISSION_ROLE_LABELS).map(([role, { label, color }]) => {
        const covered = sections.some((s) => s.missionRole === role);
        const required = REQUIRED_ROLES.includes(role);
        return (
            <span
                key={role}
                className={`pktw-px-2 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-rounded-full ${
                    covered ? color : 'pktw-bg-gray-100 pktw-text-[#9ca3af]'
                } ${required && !covered ? 'pktw-ring-1 pktw-ring-red-300' : ''}`}
            >
                {covered ? '✓' : '○'} {label}
            </span>
        );
    })}
</div>
```

- [ ] **Step 3: Add mission role badge to each section card**

In each section card, add the mission role badge alongside the existing content_type and visual_type badges:
```tsx
{sec.missionRole && MISSION_ROLE_LABELS[sec.missionRole] && (
    <span className={`pktw-px-1.5 pktw-py-0.5 pktw-text-[10px] pktw-font-medium pktw-rounded ${MISSION_ROLE_LABELS[sec.missionRole].color}`}>
        {MISSION_ROLE_LABELS[sec.missionRole].label}
    </span>
)}
```

- [ ] **Step 4: Add user notes input**

Before the "Generate Report" button, add a text input:
```tsx
{/* User notes */}
<div className="pktw-mb-3">
    <input
        type="text"
        value={userNotes}
        onChange={(e) => useSearchSessionStore.getState().setUserNotes(e.target.value)}
        placeholder="Add notes for report generation..."
        className="pktw-w-full pktw-px-3 pktw-py-2 pktw-text-sm pktw-border pktw-border-[#e5e7eb] pktw-rounded-lg pktw-outline-none focus:pktw-ring-2 focus:pktw-ring-[#7c3aed]/50"
    />
</div>
```

Add the store subscription:
```tsx
const userNotes = useSearchSessionStore((s) => s.v2UserNotes);
```

- [ ] **Step 5: Build and verify**

Run: `npm run build`

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/quick-search/components/V2PlanReview.tsx
git commit -m "feat(ui): plan review with framework coverage, mission role badges, user notes"
```

---

### Task 4: Section prompt — mission role + user notes

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section.md`
- Modify: `templates/prompts/ai-analysis-report-section-system.md`
- Modify: `src/service/prompt/PromptId.ts`

- [ ] **Step 1: Add missionRole and userNotes to section user prompt**

In `ai-analysis-report-section.md`, add after the existing "This Section" block:
```markdown
- **Mission role**: {{{missionRole}}}
```

And add a conditional block after "Evidence for This Section":
```markdown
{{#if userNotes}}

## User Notes (incorporate into this section where relevant)
{{{userNotes}}}
{{/if}}
```

- [ ] **Step 2: Add per-role writing guidance to system prompt**

In `ai-analysis-report-section-system.md`, add after the SCQA structure section:

```markdown
# MISSION ROLE GUIDANCE

Adapt your writing based on the section's mission_role:
- **synthesis**: Integrate evidence from multiple sources into a unified conclusion. Lead with the overarching finding.
- **contradictions**: Surface conflicting evidence explicitly. Do NOT resolve tensions for a "clean" narrative — present both sides with evidence.
- **trade_off**: Structure as a comparison on 2+ axes. Use a table or quadrant. Make the recommendation clear.
- **action_plan**: Concrete numbered steps with owner and timeline. Each step must be immediately actionable.
- **risk_audit**: Pre-mortem style — what could go wrong, single points of failure, mitigation options. Be specific, not generic.
- **roadmap**: Phased plan with milestones and durations. Show "where we are now" and "where we go next".
- **decomposition**: Break the topic into irreducible first-principles components. Strip surface detail.
- **blindspots**: Explicitly identify what evidence is MISSING, what perspectives are NOT represented, what assumptions are untested.
- **probing_horizon**: Non-obvious follow-up questions. Not generic "how to start" — probe second-order uncertainties.
```

- [ ] **Step 3: Update PromptId template variables**

In `PromptId.ts`, find the `AiAnalysisReportSection` template variables and add:
```ts
missionRole: string;
userNotes?: string;
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add templates/prompts/ai-analysis-report-section.md templates/prompts/ai-analysis-report-section-system.md src/service/prompt/PromptId.ts
git commit -m "feat(prompts): add mission role guidance and user notes to section prompts"
```

---

### Task 5: Orchestrator + Hook — wire mission_role and userNotes

**Files:**
- Modify: `src/service/agents/report/ReportOrchestrator.ts`
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts`

- [ ] **Step 1: Pass missionRole and userNotes in ReportOrchestrator**

In `runContentAgent`, update the `renderPrompt` call to include `missionRole` and `userNotes`:
```ts
mgr.renderPrompt(PromptId.AiAnalysisReportSection, {
    userQuery,
    reportOverview: overview,
    sectionTitle: section.title,
    contentType: section.contentType,
    visualType: section.visualType,
    sectionBrief: section.brief,
    otherSections,
    evidenceContent,
    missionRole: section.missionRole ?? 'synthesis',
    userPrompt: userPrompt ?? '',
    userNotes: this.store.getState().v2UserNotes || '',
}),
```

- [ ] **Step 2: Extract mission_role from vault_submit_plan tool call**

In `useSearchSession.ts`, find the plan_sections extraction block (where `input.plan_sections` is mapped to V2Section[]). Add `missionRole`:
```ts
missionRole: ps.mission_role ?? 'synthesis',
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/report/ReportOrchestrator.ts src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "feat: wire mission_role and userNotes through orchestrator and hook"
```

---

### Task 6: Integration build

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 2: Commit all**

```bash
git add -A
git commit -m "feat: mission roles + plan review enhancement — complete"
```
