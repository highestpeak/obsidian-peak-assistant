// src/service/chat/conversation-types.ts

export type ConversationType =
  | { kind: 'chat' }
  | { kind: 'agent' }
  | { kind: 'plan' }
  | { kind: 'canvas' }
  | { kind: 'template'; templateId: string; templateName: string }
  | { kind: 'custom'; label: string };

export const DEFAULT_CONVERSATION_TYPE: ConversationType = { kind: 'chat' };

export function getConversationTypeLabel(type: ConversationType): string | null {
  switch (type.kind) {
    case 'chat': return null; // default, no badge
    case 'agent': return 'Agent';
    case 'plan': return 'Plan';
    case 'canvas': return 'Canvas';
    case 'template': return type.templateName;
    case 'custom': return type.label;
  }
}

export function getConversationTypeBadgeColor(type: ConversationType): { bg: string; fg: string } | null {
  switch (type.kind) {
    case 'chat': return null;
    case 'agent': return { bg: 'var(--pk-accent-muted, rgba(109,40,217,0.10))', fg: 'var(--pk-accent-fg, #6d28d9)' };
    case 'plan': return { bg: 'rgba(59,130,246,0.10)', fg: 'var(--pk-info, #3b82f6)' };
    case 'canvas': return { bg: 'rgba(34,197,94,0.10)', fg: 'var(--pk-success, #22c55e)' };
    case 'template': return { bg: 'rgba(245,158,11,0.10)', fg: 'var(--pk-warning, #f59e0b)' };
    case 'custom': return { bg: 'var(--pk-accent-muted, rgba(109,40,217,0.10))', fg: 'var(--pk-accent-fg, #6d28d9)' };
  }
}
