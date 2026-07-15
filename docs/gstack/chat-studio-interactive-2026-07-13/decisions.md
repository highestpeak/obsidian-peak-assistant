# Chat Studio design decisions

> **Authority boundary:** This is a rationale and decision-history log, not the implementation master. The [Chat Studio complete implementation spec](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md) is authoritative; this log cannot override it when the two differ.

Discussion-wide synthesis: [`discussion-synthesis.md`](./discussion-synthesis.md). This file remains the compact gate-by-gate decision log; current production behaviour belongs to [`11-feature-chat-studio-ui-ux.html`](../../11-feature-chat-studio-ui-ux.html), while the target contract belongs to the [product and Composer V2 spec](../../superpowers/specs/2026-07-14-chat-studio-product-positioning-and-composer-v2.md).

## Locked before Gate 0

- The mock is a standalone Chat Studio, not an Obsidian screenshot.
- Keep the left / centre / right information architecture.
- Do not show a Peak logo, Peak product heading, mascot, or decorative header.
- Use the current `--pk-*` visual system before importing competitor aesthetics.
- Use competitor products for interaction references only.
- Keep working surfaces compact: 4/8/12/16px gaps and 28–34px rows.
- The HTML mock is the canonical visual reference inside this design history; it cannot override the implementation master. Image Gen may later explore one local component detail at a time.

## Accepted from Gate 0 feedback

- A skeleton-only conversation is insufficient; the mock must expose real input/output/process types.
- Remove the permanent sidebar search field. The knowledge-search command delegates to the existing production `QuickSearchModal`; the Chat Studio mock must not redraw or reinterpret its internal Vault Search / AI Search / Vault Intelligence UI.
- Add Pinned, realistic Projects, and enough Recent rows to review real density and scrolling.
- Do not repeat Assistant identity when there is only one default assistant.
- Composer is important enough to require an independent interactive file.
- Title regeneration must show loading and text replacement, not only a static refresh icon.

## Accepted from Gate 1 feedback

- Move “View all conversations” into the Recent section; it opens a conversation-title filter, separate from Vault/AI Search.
- Row menus use an opaque surface and state-specific Pin / Unpin labels.
- Do not create a nested Composer for message follow-up; set a reply anchor and focus the main Composer.
- Right-column tabs are Outline and Resources. Resources can filter cited/generated direction and content type.
- The default Composer exposes explicit context, project context with optional Vault/Web extensions, model override, and Send only.
- `[[` owns Vault documents, `/` owns workflows, and `@` remains unused until a real Assistant/App mention source exists.
- Model is an engine and can be Auto or a concrete Profile/model pair. Assistant is a persistent reusable configuration. The earlier Fast / Balanced / Best proposal is superseded by the Gate 3 runtime audit.
- AI Assistant creation generates an editable draft; it never silently saves or activates a role.
- Title regeneration must show visible thinking and character-by-character replacement.

## Accepted from Gate 2 review

- `+` adds resources only: files/images, Vault documents through the same `[[` picker, and links. It does not own Web Search or generation workflows.
- Source control owns two independent extensions over project context: Vault Search and Web Search. They may be off, enabled separately, or enabled together. Contextual Web suggestions update the same Web switch.
- `/` is the single owner for research, planning, image generation, and document generation workflows.
- A selected custom Assistant becomes the current conversation default, not a one-message run setting. It must remain visible as a Composer chip until restored to Default.
- Model override and conversation-level Assistant identity must not share one lifecycle description.

## Accepted from Gate 3 runtime-truth review

- Empty/new-conversation Composer is centered in the content area; after the first message it returns to the bottom rail.
- The model selector is searchable across Profile name, Provider, and model id, and groups results by enabled Profile. The persisted identity is `{profileId, modelId}`, not a display-name-only provider bucket.
- Model rows display only catalog/runtime metadata that actually exists: context window and declared capabilities such as vision, PDF input, tools, Web search, reasoning, or image generation. Missing data is omitted or marked unknown; capability must never be inferred from a marketing name.
- “Auto model” means current conversation override if present, otherwise the default Agent Profile. It does not promise task/attachment routing unless that runtime is implemented.
- Settings Recommended presets, Vault/Search Harness tiers, and reasoning/verbosity controls are three separate systems. Composer does not expose Fast / Balanced / Best or unwired reasoning controls.
- Assistant picker is searchable. AI Assistant creation is prompt-first; AI proposes a draft, while knowledge, tools, detailed rules, and preferred model live under optional advanced settings.
- Quick Search remains an independently owned native surface. Chat Studio shows only a handoff receipt in this file-based mock; it does not simulate Vault Search, AI Search, Vault Intelligence, live results, or their runtime state. Conversation-title filtering and the compact `[[` Vault-document picker are separate scoped surfaces.
- Right-column direction/type filters render only in Resources. Outline does not carry a lone filter button.
- The HTML is a design proposal. A visible control may be promoted into production only after its state is consumed by the runtime and confirmed by a truthful receipt/test.

## Accepted from Gate 4 action-and-project review

- A project row has two independent targets: the disclosure chevron only expands/collapses children; the project name opens a dedicated project home. One click never performs both actions.
- Project home is a project-scoped starting surface with summary, counts, conversations, starred messages, resources, plans, and a project-scoped Composer. Conversation-scoped temporary workflow, attachment, Assistant, model override, and source switches do not leak into it.
- Project plans are persistent project state, not a visual alias for one Agent run's temporary steps. Production needs a durable plan contract before this tab ships.
- Project context is fixed on project-scoped work. Its source row uses a compact “始终” badge rather than a disabled active switch; Vault Search and Web Search retain independent switches.
- The model picker supports multi-select capability filters and a context-window floor in addition to text search. Filters use AND semantics and only evaluate declared catalog metadata; unknown context/capabilities do not pass a positive filter.
- The message overflow menu exposes the production-backed actions: View raw, Copy Markdown, Copy JSON, Save to Vault, and targeted follow-up. Targeted follow-up adapts “Reply inline” into the one-main-Composer reply-anchor model.
- Suggested next shows at most two high-confidence prompts inline. “More” groups remaining follow-ups separately from answer-level actions such as rewrite, checklist, save, and custom follow-up. Choosing text fills Composer; it never auto-sends.

## Accepted from Gate 5 project-density review

- Preserve the complete project-home information architecture. The rejected sparse launchpad removed too much project identity and made the centre feel empty.
- Reduce pile-up through hierarchy rather than feature removal: a smaller identity block, one project summary, inline statistics, tighter tabs, and denser collection rows.
- Conversations / Starred / Resources / Plans remain visible centre-level destinations; the project-scoped Composer and explicit New conversation action both remain.

## Accepted from Gate 6 project-Composer placement review

- Project home is a start/resume surface, not a message thread with an empty lower rail. Its Composer sits in the centre content flow after project identity/summary and before project collections.
- Active conversations keep the Composer below the scrolling message canvas. State changes move one persistent Composer node; they never create a second input instance or split draft state.
- This placement change does not reopen the accepted project-home information architecture from Gate 5.

## Accepted from Gate 7 start-state and navigation review

- Project home removes the standalone hero-level “Edit description” action so it cannot compete with New conversation. The project description itself remains an inline editing target; this placement was refined in Gate 8.
- The right column is a **current-conversation** recall/index surface. Project home has no current conversation and already exposes Conversations / Starred / Resources / Plans in the centre, so the right column and splitter are hidden for this state and restored when a conversation opens.
- New conversation follows the short-greeting pattern used by current conversational products without copying their skin: `今天想推进什么？`, one sentence of scope, the shared centred Composer, and three Peak-specific starters. A starter fills an editable draft, never auto-sends, and recedes once the user starts typing.
- Recent → View all remains a title-history picker, but now supports the production `ConversationType` kinds: `chat`, `agent`, `plan`, `canvas`, `template`, and `custom`. Project membership, topic icons, and one-turn `/` workflows are not conversation types.
- Title query and conversation type use AND semantics. Duplicate pinned/recent rows are collapsed by conversation id; pinned HTML design documents are excluded; reopening the picker resets to All so a hidden filter cannot make conversations appear lost.

## Accepted from Gate 8 project start-state review

- Project home and new chat share one start-state mental model: concise contextual greeting, one shared Composer, and at most three editable, non-auto-send starting prompts. Project prompts are scoped to continuing work, summarizing progress, and planning the next step.
- Project description is edited in place by selecting the description itself; a low-noise pencil affordance appears on hover and keyboard focus. No disconnected hero action returns.
- “AI rewrite” creates a visible editable draft from project context. It never overwrites the saved description until the user chooses Save; Cancel restores the previous description. Manual editing and AI-assisted editing therefore converge on the same textarea and save boundary.

## Accepted from Gate 9 answer-action overflow review

- More is not a permanent action. The answer row first displays every action that fits and removes the ellipsis when nothing is hidden.
- Copy / Retry / Star / Branch / Trace are the persistent core. They never move into More; if the row becomes extremely narrow, their text labels may collapse while the icon actions remain.
- Adaptive actions use an explicit priority order: targeted follow-up, Save to Vault, View raw, Copy Markdown, Copy JSON. Compression runs in reverse priority, so JSON enters More first and targeted follow-up last.
- More is a truthful overflow receipt: it contains only the controls currently removed from the row, in priority order, and never duplicates a visible action.

## Open after Gate 9

- Which additional capability fields need catalog support before the model picker is production-ready, especially output-token limits and image generation?
- What is the minimum durable Assistant contract after a prompt-first draft: identity, instruction text, optional knowledge, tool policy, and model preference?
- When reasoning/output controls are wired end to end, should they appear only for capable models or remain in a deeper per-conversation setting?
- Which generated-artifact receipts should become production data contracts first: document, image, drawing, Base, or Diff?
- Should the right Resources tab include process/tool receipts, or keep those only in Outline until a dedicated trace view exists?
- What is the durable schema and owner for project plans, and which existing project resources can be represented without duplicating Vault state?

## Not planned without new evidence

- A public Assistant marketplace.
- A persistent provider / temperature / token console in the Composer.
- A second full-text search surface separate from the existing Vault/Quick Search mental model.
- Repeating the default Assistant identity on every answer.
- Returning to A/B/C shell variants before the canonical interaction model has been user-tested.
