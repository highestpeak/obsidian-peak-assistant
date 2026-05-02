import type { ContextProfile } from '../slots/types';

export const CopilotProfile: ContextProfile = {
  id: 'copilot',
  totalBudget: 'auto',
  slots: [
    { slotId: 'current-file',    priority: 1000, maxTokens: 8000,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'system-prompt',   priority: 950,  maxTokens: 1000,  required: true,  maxCompressionLevel: 0 },
    { slotId: 'working-context', priority: 800,  maxTokens: 400,   required: false, maxCompressionLevel: 2 },
    { slotId: 'activity-index',  priority: 600,  maxTokens: 200,   required: false, maxCompressionLevel: 1 },
    { slotId: 'user-profile',    priority: 400,  maxTokens: 300,   required: false, maxCompressionLevel: 1 },
  ],
};
