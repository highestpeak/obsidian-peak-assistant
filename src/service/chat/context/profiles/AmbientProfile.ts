import type { ContextProfile } from '../slots/types';

export const AmbientProfile: ContextProfile = {
  id: 'ambient',
  totalBudget: 2000,
  slots: [
    { slotId: 'working-context', priority: 1000, maxTokens: 800,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'activity-index',  priority: 900,  maxTokens: 500,  required: true,  maxCompressionLevel: 1 },
    { slotId: 'current-file',    priority: 700,  maxTokens: 500,  required: false, maxCompressionLevel: 1, buildParams: { metadataOnly: true } },
  ],
};
