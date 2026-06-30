import * as React from 'react';
import { registerMessageReceiptRenderer } from '@/ui/view/chat-view/integration/messageReceiptSlot';
import { InlineReceipt } from '../components/InlineReceipt';

/**
 * Register Usage Dashboard's inline receipt contribution for chat messages.
 */
export function registerUsageDashboardReceipts(): () => void {
	return registerMessageReceiptRenderer((props) => React.createElement(InlineReceipt, props));
}
