import type { ContextProfile } from '../slots/types';

export const ChatProfile: ContextProfile = {
  id: 'chat',
  totalBudget: 'auto',
  slots: [
    { slotId: 'system-prompt',    priority: 1000, maxTokens: 1500,   required: true,  maxCompressionLevel: 0 },
    // B2 (plan §5.3.2): persona instructions land right after the base
    // system prompt so the model reads "who you are" before recent history /
    // project summary. 2000-token cap keeps long user-authored persona
    // documents (style guides, checklists) intact under normal budgets;
    // maxCompressionLevel=1 lets the slot drop its framing header if the
    // budget governor demands more room but keeps the instructions text.
    { slotId: 'assistant',        priority: 900,  maxTokens: 2000,   required: false, maxCompressionLevel: 1 },
    { slotId: 'recent-messages',  priority: 950,  maxTokens: 100000, required: true,  maxCompressionLevel: 3, buildParams: { maxRecentMessages: 20 } },
    { slotId: 'working-context',  priority: 750,  maxTokens: 500,    required: false, maxCompressionLevel: 2 },
    { slotId: 'conv-summary',     priority: 700,  maxTokens: 800,    required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',   priority: 650,  maxTokens: 200,    required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',     priority: 600,  maxTokens: 400,    required: false, maxCompressionLevel: 1 },
    { slotId: 'prev-analysis',    priority: 500,  maxTokens: 600,    required: false, maxCompressionLevel: 2 },
    { slotId: 'resource-index',   priority: 400,  maxTokens: 300,    required: false, maxCompressionLevel: 1 },
  ],
};
