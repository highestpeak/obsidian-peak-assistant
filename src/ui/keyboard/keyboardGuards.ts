const EDITOR_SELECTOR = [
	'input',
	'textarea',
	'[contenteditable="true"]',
	'[contenteditable=""]',
	'.cm-editor',
	'.cm-content',
	'.ProseMirror',
	'[data-peak-editor]',
	'[data-prompt-input]',
	'[role="textbox"]',
].join(',');

export function eventTargetElement(target: EventTarget | null): HTMLElement | null {
	if (!target || typeof target !== 'object') return null;
	const candidate = target as Partial<HTMLElement>;
	return typeof candidate.closest === 'function' ? candidate as HTMLElement : null;
}

export function isPeakEditorTarget(target: EventTarget | null): boolean {
	return Boolean(eventTargetElement(target)?.closest(EDITOR_SELECTOR));
}

export function isUnmodifiedQuestionMark(event: KeyboardEvent): boolean {
	return event.key === '?'
		&& !event.metaKey
		&& !event.ctrlKey
		&& !event.altKey;
}

export function shouldIgnoreApplicationKey(
	event: Pick<KeyboardEvent, 'isComposing' | 'key' | 'target'>,
	compositionActive: boolean,
): boolean {
	if (compositionActive || event.isComposing || event.key === 'Process') return true;
	return isPeakEditorTarget(event.target) && event.key !== 'F6';
}
