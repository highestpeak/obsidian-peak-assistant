import type { ContextProfile } from '../slots/types';

export const AiAnalysisProfile: ContextProfile = {
  id: 'ai-analysis',
  totalBudget: 'auto',
  slots: [
    { slotId: 'system-prompt',    priority: 1000, maxTokens: 3000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'vault-intuition',  priority: 900,  maxTokens: 2000,  required: false, maxCompressionLevel: 1 },
    { slotId: 'working-context',  priority: 850,  maxTokens: 600,   required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',   priority: 700,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',     priority: 400,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
  ],
};
