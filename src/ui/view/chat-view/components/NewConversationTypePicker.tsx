import React from 'react';

/**
 * chat-unified-mode 2026-07-05 (Track B): the visible Chat / Agent / Plan
 * three-card picker was retired. New conversations run one Chat experience
 * — tool access is decided by capabilities + toggles + permissions, not by
 * a user-selected "mode". Legacy `conversationType.kind` still survives on
 * `ChatConversationMeta` for restored old threads (`agent`/`plan` reads as
 * a legacy hint) and continues to be respected by `resolveChatExecutionStrategy`.
 *
 * What's rendered now is a thin start hero above the composer so the pending
 * view still has a title, but the choice is gone. `/plan ` slash-prefix
 * remains the way to opt a single message into planning UX.
 */
export const NewConversationStartHero: React.FC = () => (
  <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-1 pktw-py-8">
    <span className="pktw-text-sm pktw-text-muted-foreground">Start a new conversation</span>
    <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-opacity-70">
      Prefix with <code className="pktw-px-1 pktw-rounded pktw-bg-muted">/plan</code> for planning-focused replies.
    </span>
  </div>
);
