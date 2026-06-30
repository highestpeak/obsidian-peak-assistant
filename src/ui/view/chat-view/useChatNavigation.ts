import type { ChatNavigationPort } from '@/core/ports/ChatNavigationPort';
import { useServiceContext } from '@/ui/context/ServiceContext';

/**
 * T11P (Track A): React hook returning the chat-navigation port bound by
 * `ReactElementFactory` at boot. UI components do not import or pass
 * navigation deps — they call this hook and invoke its methods directly.
 */
export function useChatNavigation(): ChatNavigationPort {
	return useServiceContext().chatNavigation;
}
