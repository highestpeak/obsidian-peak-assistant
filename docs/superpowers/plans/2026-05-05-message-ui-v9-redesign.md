# Message UI v9 Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign chat message layout per v9 mock — remove "PEAK"/"You" labels, remove user avatar, make assistant provider icon inline with first line of content, hide all footer (metadata + actions + follow-ups + styles) on non-last messages (reveal on hover), keep footer always visible on last message, reasoning block collapsed by default for saved messages.

**Architecture:** Pure UI refactoring in `MessageViewItem.tsx`, `MessageActionsList.tsx`, `MessageRoleAvatar.tsx`, and `MessageStyleButtons.tsx`. No backend changes. The layout shifts from `avatar-left + label-above + content-below` to `provider-icon-inline + content-right` for assistant, `bubble-right-no-avatar` for user. Footer visibility controlled by CSS `group` hover + `isLastMessage` prop.

**Tech Stack:** React 18, Tailwind CSS (pktw- prefix), Lucide icons, existing `Reasoning`/`Collapsible` components.

---

### Task 1: Remove "PEAK"/"You" labels and user avatar

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx:240-393`
- Modify: `src/ui/view/chat-view/components/MessageRoleAvatar.tsx`

- [ ] **Step 1: Remove the role label span**

In `MessageViewItem.tsx:253`, delete the entire line:
```tsx
// DELETE THIS LINE:
<span className="pktw-text-[9px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-mb-0.5">{isUser ? 'You' : 'Peak'}</span>
```

- [ ] **Step 2: Remove user avatar — skip `MessageRoleAvatar` for user messages**

In `MessageViewItem.tsx:251`, change:
```tsx
// FROM:
<MessageRoleAvatar role={isUser ? 'user' : 'assistant'} provider={message.provider} model={message.model} />

// TO:
{!isUser && <MessageRoleAvatar role="assistant" provider={message.provider} model={message.model} />}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/chat-view/components/messages/MessageViewItem.tsx
git commit -m "refactor(chat): remove PEAK/You labels and user avatar"
```

---

### Task 2: Restructure assistant message layout — provider icon inline with content

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx:240-393`

The current layout wraps avatar + `<Message>` in a flex row. This is already close to the v9 mock (icon left, content right). The main change: remove the `<Message>` and `<MessageContent>` wrapper components (they add unnecessary nesting), and apply styles directly. Also, for user messages, remove the outer flex gap since there's no avatar.

- [ ] **Step 1: Refactor the outer container for user vs assistant**

Replace the entire return block (lines 240–392) with the new layout. The key structural changes:

**Assistant messages:** `flex row` with provider icon + content column (already the case, just removing `<Message>` and `<MessageContent>` wrappers and the label).

**User messages:** Right-aligned bubble, no avatar, no icon. Outer div uses `pktw-justify-end`, inner is just the bubble.

In `MessageViewItem.tsx`, replace lines 240–392 with:

```tsx
return (
    <div
        className={cn(
            "pktw-group pktw-mb-4 pktw-px-4 pktw-flex pktw-w-full",
            isUser ? "pktw-justify-end" : "pktw-justify-start"
        )}
        data-message-id={message.id}
        data-message-role={message.role}
        onContextMenu={handleContextMenu}
    >
        {isUser ? (
            /* ── User message: right-aligned bubble, no avatar ── */
            <div className="pktw-flex pktw-flex-col pktw-items-end pktw-max-w-[85%]">
                {/* Attachments above bubble */}
                {message.resources && message.resources.length > 0 && (
                    <div className="pktw-mb-2 pktw-w-full pktw-max-w-full pktw-min-w-0 pktw-overflow-hidden">
                        <MessageAttachmentsList message={message} app={app} />
                    </div>
                )}
                <div className="pktw-rounded-lg pktw-bg-secondary pktw-px-4 pktw-py-3 pktw-text-sm pktw-select-text pktw-max-w-full">
                    {displayContent ? (
                        <div className="pktw-relative">
                            <StreamdownIsolated className="pktw-select-text" isAnimating={streamingState.isStreaming}>
                                {displayText}
                            </StreamdownIsolated>
                            {shouldShowExpand && (
                                <Button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
                                    className="pktw-mt-2 pktw-flex pktw-items-center pktw-gap-1 pktw-text-xs pktw-transition-colors pktw-cursor-pointer"
                                >
                                    {isExpanded
                                        ? <><ChevronUp className="pktw-w-3 pktw-h-3" /><span>Show less</span></>
                                        : <><ChevronDown className="pktw-w-3 pktw-h-3" /><span>Expand</span></>}
                                </Button>
                            )}
                        </div>
                    ) : null}
                </div>
                {/* User actions: copy + star, hover only */}
                <div className="pktw-flex pktw-items-center pktw-gap-0.5 pktw-mt-1 pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity">
                    <MessageAction
                        tooltip={copied ? 'Copied!' : 'Copy message'}
                        label="Copy message"
                        className="pktw-h-6 pktw-w-6 pktw-rounded"
                        onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                    >
                        {copied ? <Check size={16} strokeWidth={3} /> : <Copy size={16} strokeWidth={2} />}
                    </MessageAction>
                    <MessageAction
                        tooltip={message.starred ? 'Unstar message' : 'Star message'}
                        label={message.starred ? 'Unstar message' : 'Star message'}
                        className="pktw-h-6 pktw-w-6 pktw-rounded"
                        onClick={(e) => { e.stopPropagation(); handleToggleStar(message.id, !message.starred); }}
                    >
                        <Star size={16} strokeWidth={2} className={cn(message.starred && 'pktw-fill-red-500 pktw-text-red-500')} />
                    </MessageAction>
                </div>
            </div>
        ) : (
            /* ── Assistant message: provider icon + content ── */
            <div className="pktw-flex pktw-gap-2.5 pktw-max-w-[85%] pktw-items-start">
                <MessageRoleAvatar role="assistant" provider={message.provider} model={message.model} />
                <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-flex-1 pktw-min-w-0">
                    {/* Attachments */}
                    {message.resources && message.resources.length > 0 && (
                        <div className="pktw-mb-1 pktw-w-full pktw-max-w-full pktw-min-w-0 pktw-overflow-hidden">
                            <MessageAttachmentsList message={message} app={app} />
                        </div>
                    )}

                    {/* Reasoning — collapsed by default for saved messages */}
                    {streamingState.reasoningContent && (
                        <Reasoning isStreaming={streamingState.isReasoningActive} defaultOpen={streamingState.isStreaming} className="pktw-w-full pktw-mb-0">
                            <ReasoningTrigger/>
                            <ReasoningContent>
                                {streamingState.reasoningContent}
                            </ReasoningContent>
                        </Reasoning>
                    )}

                    {/* Tool calls */}
                    {streamingState.currentToolCalls.length > 0 && (
                        <ToolCallSummary
                            toolCalls={streamingState.currentToolCalls.map(call => ({
                                toolName: call.toolName,
                                input: call.input,
                                output: call.output,
                                isActive: call.isActive ?? false,
                            }))}
                            isStreaming={streamingState.isStreaming}
                        />
                    )}

                    {/* Loading spinner */}
                    {shouldShowLoader && (
                        <div className="pktw-flex pktw-items-center pktw-justify-start pktw-py-2">
                            <div className="pktw-scale-50 pktw-origin-left"><AnimatedSparkles isAnimating={true} /></div>
                        </div>
                    )}

                    {/* Message content */}
                    {!shouldShowLoader && displayContent && (
                        <div className="pktw-text-sm pktw-select-text">
                            <StreamdownIsolated className="pktw-select-text" isAnimating={streamingState.isStreaming}>
                                {displayText}
                            </StreamdownIsolated>
                        </div>
                    )}

                    {/* Footer: metadata + styles + follow-ups — hidden on non-last, shown on hover or if last */}
                    {!streamingState.isStreaming && !message.isErrorMessage && (
                        <div className={cn(
                            "pktw-overflow-hidden pktw-transition-all pktw-duration-200",
                            isLastMessage
                                ? "pktw-max-h-[200px] pktw-opacity-100"
                                : "pktw-max-h-0 pktw-opacity-0 group-hover:pktw-max-h-[200px] group-hover:pktw-opacity-100"
                        )}>
                            {/* Metadata + inline actions */}
                            <MessageActionsList
                                message={message}
                                isStreaming={streamingState.isStreaming}
                                copied={copied}
                                models={models}
                                onToggleStar={handleToggleStar}
                                onCopy={handleCopy}
                                onRegenerate={handleRegenerate}
                            />

                            {/* Style chips — hover only within footer */}
                            <div className="pktw-overflow-hidden pktw-max-h-0 pktw-opacity-0 group-hover:pktw-max-h-[40px] group-hover:pktw-opacity-100 pktw-transition-all pktw-duration-200">
                                <MessageStyleButtons onStyleSelect={(prompt) => {
                                    const submitAction = useChatViewStore.getState().submitAction;
                                    if (submitAction) submitAction(prompt);
                                }} />
                            </div>

                            {/* Follow-up suggestions */}
                            <SuggestedFollowups
                                messageId={message.id}
                                userContent={(() => {
                                    const msgs = activeConversation?.messages;
                                    if (!msgs) return '';
                                    const idx = msgs.findIndex(m => m.id === message.id);
                                    for (let i = idx - 1; i >= 0; i--) {
                                        if (msgs[i].role === 'user') return String(msgs[i].content || '');
                                    }
                                    return '';
                                })()}
                                assistantContent={String(message.content || '')}
                                onSelect={(q) => {
                                    const submitAction = useChatViewStore.getState().submitAction;
                                    if (submitAction) submitAction(q);
                                }}
                            />
                        </div>
                    )}

                    {/* Error: Open Settings link */}
                    {message.isErrorMessage &&
                     (message.content.includes('profile') || message.content.includes('configured') || message.content.includes('credentials')) && (
                        <span
                            className="pktw-text-xs pktw-text-accent pktw-cursor-pointer hover:pktw-underline pktw-mt-1"
                            onClick={() => {
                                const { SettingsModal } = require('@/ui/view/SettingsModal');
                                new SettingsModal(AppContext.getInstance()).open();
                            }}
                        >
                            Open Settings
                        </span>
                    )}
                </div>
            </div>
        )}
    </div>
);
```

- [ ] **Step 2: Update imports — add `Check`, `Copy`, `Star` from lucide, add `MessageAction` from ai-elements**

At the top of `MessageViewItem.tsx`, update imports:
```tsx
import { ChevronDown, ChevronUp, Check, Copy, Star } from 'lucide-react';
import { MessageAction } from '@/ui/component/ai-elements';
```

Remove `Message` and `MessageContent` from the ai-elements import if they're no longer used.

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/chat-view/components/messages/MessageViewItem.tsx
git commit -m "refactor(chat): v9 layout — inline provider icon, user bubble without avatar, footer hover"
```

---

### Task 3: Make reasoning default-closed for saved messages

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx` (already done in Task 2)

The key change is already in Task 2's code: the `<Reasoning>` component now receives `defaultOpen={streamingState.isStreaming}`. This means:
- **Streaming messages:** `defaultOpen={true}` — reasoning opens while streaming, auto-closes after 1s
- **Saved messages:** `defaultOpen={false}` — reasoning starts collapsed, click to expand

This is already implemented in the Task 2 code block. No additional work needed — this task is a verification checkpoint.

- [ ] **Step 1: Verify reasoning behavior**

Check that in `MessageViewItem.tsx`, the `<Reasoning>` component has:
```tsx
<Reasoning isStreaming={streamingState.isReasoningActive} defaultOpen={streamingState.isStreaming} ...>
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

---

### Task 4: Clean up unused components and imports

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx`
- Modify: `src/ui/view/chat-view/components/messages/MessageActionsList.tsx`

- [ ] **Step 1: Remove user message rendering from `MessageActionsList`**

In `MessageActionsList.tsx`, the user message section (the second `return` block with Copy + Star for user messages) is no longer needed — user actions are now rendered directly in `MessageViewItem.tsx`. Remove the user message rendering from `MessageActionsList` so it only handles assistant messages.

Find the user message return block (after the assistant `if (isAssistant)` block) and remove it. The component should return `null` for non-assistant messages:

```tsx
// After the assistant block closes with }
// Replace the user message return with:
return null;
```

- [ ] **Step 2: Remove unused imports from `MessageViewItem.tsx`**

Remove `Message` and `MessageContent` from the ai-elements import if no longer used. Verify with grep that they're not referenced.

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/chat-view/components/messages/MessageViewItem.tsx \
        src/ui/view/chat-view/components/messages/MessageActionsList.tsx
git commit -m "refactor(chat): clean up unused Message/MessageContent wrappers and user action duplication"
```

---

### Task 5: Update `SuggestedFollowups` to show on all messages

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx` (already done in Task 2)

The v9 mock shows follow-up suggestions on ALL assistant messages (not just the last). This is already handled in Task 2's code — the `SuggestedFollowups` component is inside the footer div which renders for all assistant messages (visibility controlled by hover/isLastMessage CSS). The `isLastMessage` guard was removed from the `SuggestedFollowups` rendering.

This task is a verification checkpoint.

- [ ] **Step 1: Verify**

Confirm that `SuggestedFollowups` is rendered for ALL assistant messages (not wrapped in `isLastMessage` check). It should be inside the footer div that handles hover visibility.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

---

### Task 6: Final build and visual verification

**Files:** None (verification only)

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 2: Commit all remaining changes**

```bash
git add -A
git commit -m "feat(chat): v9 message UI redesign — inline provider icon, hover footer, follow-ups on all messages"
```
