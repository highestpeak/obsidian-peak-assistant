import type { ContextProfile } from '../slots/types';

export const FollowupProfile: ContextProfile = {
  id: 'followup',
  totalBudget: 'auto',
  slots: [
    { slotId: 'prev-analysis',    priority: 1000, maxTokens: 3000,  required: true,  maxCompressionLevel: 2 },
    { slotId: 'system-prompt',    priority: 950,  maxTokens: 1000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'recent-messages',  priority: 850,  maxTokens: 2000,  required: false, maxCompressionLevel: 3, buildParams: { maxRecentMessages: 10 } },
    { slotId: 'working-context',  priority: 750,  maxTokens: 500,   required: false, maxCompressionLevel: 2 },
    { slotId: 'vault-intuition',  priority: 500,  maxTokens: 800,   required: false, maxCompressionLevel: 1 },
  ],
};
