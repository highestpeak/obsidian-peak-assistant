import { App } from 'obsidian';
import { EventBus, ShowToastEvent } from '@/core/eventBus';

/**
 * Toast options
 */
export interface ToastOptions {
	type?: 'default' | 'success' | 'error' | 'warning' | 'info';
	description?: string | React.ReactNode;
	duration?: number;
	action?: {
		label: string;
		onClick: () => void;
	};
}

/**
 * Toast utility for cross-React-instance toast display
 * Use this when you need to show toast from a component that's not in ChatView
 * The toast will be displayed in ChatView's toast container
 * 
 * @example
 * ```tsx
 * import { showToast } from '@/ui/utils/toast';
 * import { useServiceContext } from '@/ui/context/ServiceContext';
 * 
 * function MyComponent() {
 *   const { app } = useServiceContext();
 *   
 *   const handleClick = () => {
 *     showToast.success('Operation completed!', { app });
 *   };
 * }
 * ```
 */
export function showToast(
	message: string | React.ReactNode,
	options: ToastOptions & { app: App }
): void {
	const eventBus = EventBus.getInstance(options.app);
	eventBus.dispatch(
		new ShowToastEvent({
			message,
			type: options.type || 'default',
			description: options.description,
			duration: options.duration,
			action: options.action,
		})
	);
}

/**
 * Show success toast
 */
showToast.success = function(
	message: string | React.ReactNode,
	options: Omit<ToastOptions, 'type'> & { app: App }
): void {
	showToast(message, { ...options, type: 'success' });
};

/**
 * Show error toast
 */
showToast.error = function(
	message: string | React.ReactNode,
	options: Omit<ToastOptions, 'type'> & { app: App }
): void {
	showToast(message, { ...options, type: 'error' });
};

/**
 * Show warning toast
 */
showToast.warning = function(
	message: string | React.ReactNode,
	options: Omit<ToastOptions, 'type'> & { app: App }
): void {
	showToast(message, { ...options, type: 'warning' });
};

/**
 * Show info toast
 */
showToast.info = function(
	message: string | React.ReactNode,
	options: Omit<ToastOptions, 'type'> & { app: App }
): void {
	showToast(message, { ...options, type: 'info' });
};

