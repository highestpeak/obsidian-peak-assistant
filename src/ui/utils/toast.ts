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
 * T11P (Track F): API takes `eventBus` directly — previously it asked
 * callers to pass `{ app }` so it could call `EventBus.getInstance(app)`,
 * which forced UI files to destructure `app` off `ServiceContext`. The
 * `eventBus` is already published on the context, so callers thread it.
 *
 * @example
 * ```tsx
 * import { showToast } from '@/ui/utils/toast';
 * import { useServiceContext } from '@/ui/context/ServiceContext';
 *
 * function MyComponent() {
 *   const { eventBus } = useServiceContext();
 *
 *   const handleClick = () => {
 *     showToast.success('Operation completed!', { eventBus });
 *   };
 * }
 * ```
 */
export function showToast(
	message: string | React.ReactNode,
	options: ToastOptions & { eventBus: EventBus }
): void {
	options.eventBus.dispatch(
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
	options: Omit<ToastOptions, 'type'> & { eventBus: EventBus }
): void {
	showToast(message, { ...options, type: 'success' });
};

/**
 * Show error toast
 */
showToast.error = function(
	message: string | React.ReactNode,
	options: Omit<ToastOptions, 'type'> & { eventBus: EventBus }
): void {
	showToast(message, { ...options, type: 'error' });
};

/**
 * Show warning toast
 */
showToast.warning = function(
	message: string | React.ReactNode,
	options: Omit<ToastOptions, 'type'> & { eventBus: EventBus }
): void {
	showToast(message, { ...options, type: 'warning' });
};

/**
 * Show info toast
 */
showToast.info = function(
	message: string | React.ReactNode,
	options: Omit<ToastOptions, 'type'> & { eventBus: EventBus }
): void {
	showToast(message, { ...options, type: 'info' });
};
