# Chat Studio research and component inventory

> **Authority boundary:** This file is evidence and research history only. The [Chat Studio complete implementation spec](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md) is the implementation master; evidence recorded here may inform it but cannot override it.

Document role: evidence and capability inventory only. Owner decisions and the cross-document source-of-truth map live in [`discussion-synthesis.md`](./discussion-synthesis.md); target interaction requirements live in the [product and Composer V2 spec](../../superpowers/specs/2026-07-14-chat-studio-product-positioning-and-composer-v2.md).

Date: 2026-07-14

This note records the evidence behind Gate 3. It separates four things that were previously mixed together:

1. capabilities already rendered by Peak Chat;
2. backend/file capabilities that exist but do not yet have a dedicated Chat renderer;
3. competitor patterns used only as interaction references;
4. product hypotheses inferred from owner feedback and HCI literature.

This is desk research, not completed external user research. Product claims remain hypotheses until task-based usability testing is run with real knowledge-base users.

## Local Chat inventory

### Input and context

| Capability | Current source | Mock treatment |
|---|---|---|
| Multiline CodeMirror input | `src/ui/component/prompt-input/PromptInputBody.tsx` | bounded growth states in Composer Lab |
| `@` and `[[` Vault context | `src/ui/view/chat-view/hooks/useContextSearch.ts` | one document picker with recent/current project/all Vault/high-level syntax |
| Recent Vault files | `useContextSearch.ts` | default picker results |
| PDF/Image/DOCX/XLSX/PPTX/Canvas/Excalidraw labels | `useContextSearch.ts` | type metadata in picker and attachment catalog |
| File picker, multi-select, drag/drop, dedupe | `PromptInput.tsx` | `+` menu and attachment states |
| Image/PDF/generic staging previews | `PromptInputAttachments.tsx` | image thumb, file chips, upload/error states |
| Prompt enhance | `PromptEnhanceSuggestion.tsx` | recorded as a follow-up Composer state, not a permanent toolbar button |
| `/plan` intent | `NewConversationTypePicker.tsx`, chat service | Composer Lab reserves `/` for workflow invocation; only `/plan` is currently real |
| Vault Search / Web Search | current PromptInput source toggles | independent, combinable switches over project/explicit context |

Important boundary: the current `@` and `[[` paths both use Vault search. The mock proposes different user meanings, but product implementation must not claim Agent/Persona lookup until a separate source exists.

### Search surface truth inventory

The local product does **not** currently have one unified Vault/project/chat search system. It already has a production-owned Quick Search modal, so Chat Studio must preserve the ownership boundary instead of re-creating that modal in HTML:

| Surface | Current responsibility | Design consequence |
|---|---|---|
| Vault Search | **Raw retrieval** over Vault documents; List/Tree/Graph views and Compact/Detailed density | remain inside the existing `QuickSearchModal`; do not reproduce it in the Chat Studio mock |
| Refine | separate AI-assisted refinement action over Vault Search | remain owned by native Quick Search; Web must not be attached to this Vault Search row |
| AI Search | **Generative synthesis** through Vault Analysis / AI Graph with a profile-gated Web toggle | remain inside native Quick Search; the mock must not invent suggestions, run states, or saved analyses |
| Vault Intelligence | deliberate, context-dependent **Vault-wide review** entry | remain inside native Quick Search and its dedicated run flow; do not flatten or simulate it |
| Conversation search | filters loaded conversation titles | “View all conversations” may open this filter, but must not promise Vault or message-body full-text search |
| `[[` Vault document picker | compact document lookup for adding explicit message context | may be represented independently because it owns only selection and Composer-chip insertion, not the full Quick Search product |

The real Vault syntax includes `folder:`, `tag:`, `ext:`, negation, and quoted exact phrases, but this Chat Studio mock no longer renders the native query UI at all. The earlier mock examples `in:project` and `in:chat` were invented and are removed. The Quick Search command also has no guaranteed default `⌘K` binding, so the design must not advertise one as product truth.

These three descriptions are responsibility labels for documentation, not proposed replacement tab names. Production UI keeps the existing names `Vault Search`, `AI Search`, and `Vault Intelligence`.

### User resource rendering

`MessageAttachmentsList.tsx` already contains a rich permutation system:

- images: 1, 2, 3, 4, 5–7, and 8+ layouts;
- files: one full card, 2–4 compact cards, 5+ chips;
- one URL rich card, multiple URL chips;
- semantic badges for PDF, CSV, XLSX, DOCX, PPTX, JSON, MD, TXT, ZIP, HTML, XML, Excalidraw, Canvas, and folders;
- click-to-open and hover preview.

`resource-preview-hover.tsx` and `WikilinkHoverPreview.tsx` support image, PDF iframe, and text/Markdown preview. Gate 1 exposes this with a reusable Vault-document hover card.

### Assistant body rendering

`StreamdownIsolated.tsx` currently supports:

- Markdown paragraphs, headings, lists, quotes, emphasis, links, and images;
- tables and table controls;
- code blocks, Shiki highlighting, copy/download controls;
- Mermaid copy/download/fullscreen/pan/zoom;
- math and CJK layout;
- Obsidian wikilinks with text/image/PDF hover preview;
- `base` fenced blocks with `Save & Open in Bases`.

These remain document content. They should not all be converted into cards.

### Process, identity, and actions

- `MessageViewItem.tsx` currently repeats a Peak avatar/name on every Assistant answer.
- Tool calls act as the only reliable Agent proxy.
- token count, duration, model/provider, reasoning, tool sequence, streaming, error/cancel/timeout, usage receipt, and status are available.
- actions include Copy, Regenerate, Star, Branch, Trace, raw JSON, copy Markdown/JSON, Save to Vault, inline follow-up, and suggested next.

Gate 1 removes the default Assistant identity row. An identity row appears only for non-default Agent/Persona, multi-agent handoff, model change, tool ownership, or review/debug context.

### Model, settings, and runtime truth inventory

The model source of truth is the bundled `templates/config/models/model-catalog.json`, plus TemplateManager runtime/provider overrides and runtime-discovered local models. Selection identity is `{profileId, modelId}`. A Provider can have multiple configured Profiles, so a flat Provider/model list is insufficient.

The existing Settings model picker already establishes useful production conventions: search by model id/Profile name, group by enabled Profile, show Provider identity, support keyboard navigation, and derive capability tags from metadata. Available fields include:

- `vision`, `pdfInput`, `tools`;
- `webSearch`, `xSearch`, `newsSearch`, `rssSearch`;
- `codeInterpreter`, `imageGeneration`, `reasoning`;
- `maxCtx`, input/output token fields, and summary thresholds.

Unknown metadata must remain unknown. The current catalog does not declare an image-generation-capable model, so the mock must not manufacture that badge. The catalog also does not consistently expose output limits; only values actually present should be rendered.

Three similarly shaped controls were previously conflated:

1. **Settings Recommended setup** — Balanced / Lowest cost / Research quality / Local-private / Manual are configuration recommendations; the audited implementation does not make them a per-message Composer runtime.
2. **Harness tiers** — `local-fast → local-deep → online` belongs to Vault Search / Followup Agent escalation, not ordinary Chat model selection.
3. **Reasoning/output controls** — Low/Medium/High reasoning and verbosity exist as settings/persistence concepts, but the audited provider request path does not yet establish a truthful end-to-end Composer control.

Gate 3 therefore removes Fast / Balanced / Best and reasoning/verbosity from the active Composer. The only truthful first-level model states are Auto and an explicit Profile/model override. Auto means conversation override first, otherwise the default Agent Profile; it is not evidence of task/attachment routing.

### Product gaps exposed by the mock

These do not have dedicated Chat output components today:

- generated image receipt/gallery;
- generated Word/PDF/PPT/Markdown document receipt;
- Diff/patch review card;
- Excalidraw/Canvas/Draw.io result receipt;
- interactive CSV/dataset viewer;
- JSON structured viewer;
- citation/source bundle;
- multi-file output bundle;
- video/audio result.

Some backing capabilities exist elsewhere, but `MessageViewItem` does not render them. Gate 1 labels these as design proposals, not current production behavior.

### Production-backed message, suggestion, and project surfaces

The Gate 4 mock does not invent the main action inventory:

- `src/ui/view/chat-view/components/messages/MessageMorePopover.tsx` already owns View raw, Copy Markdown, Copy JSON, Save to Vault, Reply Inline, and optional Delete. The target design keeps the first four and adapts Reply Inline to a reply anchor in the one main Composer.
- `src/ui/view/chat-view/components/messages/MessageSuggestedNext.tsx` already renders two inline suggestions, puts the remainder under More, and exposes Rewrite simply, Create checklist, Save to Note/Vault, and Ask Custom. The target design preserves this split, adds explicit grouping, and does not auto-send a selected prompt.
- `src/ui/view/chat-view/view-ProjectOverview.tsx` already owns a project overview with description, conversations, starred messages, and resources. Gate 4 adds Plans as a proposal only; it needs a durable data contract before production.
- `src/ui/view/project-list-view/ProjectsSection.tsx` currently lets the project header toggle expansion and, on expansion, open the project overview. Gate 4 intentionally separates those targets to remove the ambiguous double effect.

These files are the implementation truth for capability existence. The HTML remains the interaction target, especially where it intentionally changes placement or lifecycle.

### Right-index taxonomy

Production `ConversationIndex.tsx` currently has only Overview and Artifacts. Artifacts collapse to Image / Diagram / File / Code. Gate 1 proposes a more useful taxonomy:

- Document
- Table/Data
- Code
- Diff
- Diagram
- Drawing/Canvas
- Image
- Link/Source
- Tool result
- Saved note
- Other

This is intentionally broader than production and requires a future data-contract decision.

Outline and Resources do not need identical controls. Direction/type filters are meaningful only for Resources; Gate 3 removes the isolated filter row from Outline and keeps the first outline row dedicated to navigation content.

## Competitor findings

### ChatGPT and current Codex/ChatGPT desktop navigation

Official sources:

- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
- [Pinned chats and release notes](https://help.openai.com/en/articles/6825453-how-chatgpt-works)
- [Chat history search](https://help.openai.com/en/articles/10056348-how-do-i-search-my-chat-history-in-chatgpt)
- [Archive and delete](https://help.openai.com/en/articles/8809935-how-to-delete-and-archive-chats-in-chatgpt)
- [Codex app introduction](https://openai.com/index/introducing-the-codex-app/)
- [Current Projects / Chats / Tasks documentation](https://learn.chatgpt.com/docs/projects)

Relevant patterns:

- pinned chats and projects sit above compact recents;
- rows reveal their `…` menu on hover;
- chat can move into a project and inherit its context;
- sidebar recents are intentionally compact while complete history remains searchable;
- running and unread states use a status lane instead of decorating every row;
- New Chat and Search are commands, not a permanent search input.

Peak translation:

- order is Pinned → Projects → Recent;
- Search knowledge invokes the existing native Quick Search surface; the file-based mock shows only an explicit handoff receipt and never fabricates its internal controls or results;
- “View all” opens a separate conversation-title filter;
- one leading icon communicates the row’s most important meaning;
- ordinary rows do not display pin + chat + agent + status simultaneously;
- drag-to-project feedback explicitly explains inherited project context.

### Composer references

Official sources:

- [ChatGPT Projects and composer tools](https://help.openai.com/en/articles/10169521-projects-in-chatgpt)
- [ChatGPT file uploads](https://help.openai.com/en/articles/8555545-uploading-images-and-files-in-chatgpt)
- [Codex models and reasoning control](https://learn.chatgpt.com/docs/models)
- [Codex image inputs](https://learn.chatgpt.com/docs/image-inputs)
- [Codex artifact viewer](https://learn.chatgpt.com/docs/artifacts-viewer)
- [Claude composer basics](https://support.claude.com/en/articles/8114491-get-started-with-claude)
- [Claude model, effort, and thinking](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)
- [Gemini Deep Research sources](https://support.google.com/gemini/answer/15719111?hl=en)
- [Perplexity file uploads](https://www.perplexity.ai/help-center/en/articles/10354807-file-uploads)

Recommended Peak composition:

```text
optional attachment/context shelf
multiline editor
+   project context + Vault/Web     model override   send/stop
```

- `+` contains attachments, Vault document selection, and links;
- `[[` invokes Vault documents;
- `@` remains unused until a real Assistant/App mention source exists;
- `/` is the workflow keyboard path;
- model selection progressively expands from Auto to searchable Profile/model groups with truthful capability/context metadata;
- project context is the base; Vault Search and Web Search are independent, combinable switches;
- Assistant configuration is separate from workflow and model, and invisible when only the default Assistant exists;
- the Assistant picker is searchable, while AI creation starts from one natural-language prompt and moves knowledge/tools/model into optional advanced settings;
- the empty/new-conversation Composer is centered, then moves to the bottom rail once conversation content exists;
- Send receives accent only when sendable and becomes Stop in place.

The independent [`composer-lab.html`](./composer-lab.html) uses one canonical shell and exposes input, Vault picker, workflow command, attachment, reply anchor, combinable sources, concrete Profile/model selection, Assistant search, prompt-first AI Assistant creation, running, permission, and narrow states without crowding the three-column mock.

## Gate 3 product synthesis

The recommended product position is:

> Vault as long-term memory, conversation as a temporary workbench, and traceable artifacts as the durable outcome.

The primary differentiated loop is: restore project → define evidence boundary → express desired outcome → run → inspect sources/process → correct or follow up → save/link/update Vault → resume later.

The Composer therefore acts as a lightweight work contract. The user only needs to decide desired outcome, explicit context, and whether to extend project evidence into Vault and/or Web. Model override, Assistant, tools, and permission are progressively disclosed or requested when needed.

This is still a **design proposal**. The HTML proves neither runtime routing nor capability support. A production control is truthful only when its state reaches the request path, unsupported Provider/model combinations are detected, and the resulting run receipt/test confirms what happened.

### Additional official references

- [Creating a custom GPT](https://help.openai.com/en/articles/8554397-creating-a-custom-gpt): conversational builder plus explicit configuration fields and a recommended model.
- [ChatGPT deep research](https://help.openai.com/en/articles/10500283-deep-research): source selection, editable plan, activity history, citations, and a report.
- [Claude model, effort, and thinking settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings): adjacent model/effort controls that can change over time.
- [Perplexity Research mode](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode) and [Pro Search](https://www.perplexity.ai/help-center/en/articles/10352903-what-is-pro-search): automatic model selection for research and explicit model selection for Pro Search can coexist.
- [NotebookLM citations](https://support.google.com/notebooklm/answer/16179559?hl=en): source-grounded answers, citation hover, and source location.
- [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf): communicate capabilities, allow invocation/dismissal/correction, explain uncertainty, and support efficient recovery.
- [Principles of Mixed-Initiative User Interfaces](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz.pdf): minimize costly guesses, support direct invocation and termination, and maintain scope/working memory.
- [Google PAIR mental models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/): describe user benefits rather than implementation and introduce advanced behavior progressively.
