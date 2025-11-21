/**
 * Scroll controller for chat view
 */
export class ScrollController {
	constructor(private bodyEl?: HTMLElement, private messageContainer?: HTMLElement) {}

	/**
	 * Scroll to a specific message by ID
	 */
	scrollToMessage(messageId: string, attempts = 3): void {
		if (!this.messageContainer) return;
		const messageEl = this.messageContainer.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement;
		if (messageEl) {
			messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			messageEl.classList.add('peak-chat-view__message--highlighted');
			setTimeout(() => {
				messageEl.classList.remove('peak-chat-view__message--highlighted');
			}, 2000);
			return;
		}

		if (attempts > 0) {
			setTimeout(() => {
				this.scrollToMessage(messageId, attempts - 1);
			}, 60);
		}
	}

	/**
	 * Scroll to the top of the message container
	 */
	scrollToTop(instant: boolean = false): void {
		if (!this.bodyEl) return;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (this.bodyEl) {
					this.bodyEl.scrollTo({
						top: 0,
						behavior: instant ? 'auto' : 'smooth'
					});
				}
			});
		});
	}

	/**
	 * Scroll to the bottom of the message container
	 */
	scrollToBottom(instant: boolean = false): void {
		if (!this.bodyEl) return;
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (this.bodyEl) {
					this.bodyEl.scrollTo({
						top: this.bodyEl.scrollHeight,
						behavior: instant ? 'auto' : 'smooth'
					});
				}
			});
		});
	}

	setBodyEl(bodyEl: HTMLElement): void {
		this.bodyEl = bodyEl;
	}

	setMessageContainer(messageContainer: HTMLElement): void {
		this.messageContainer = messageContainer;
	}
}

