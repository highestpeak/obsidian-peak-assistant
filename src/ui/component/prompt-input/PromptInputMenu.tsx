import React, { useState, useCallback, useEffect } from 'react';
import { PromptMenu, ContextMenu } from './menu';
import { usePromptInputContext } from './PromptInput';
import { ExternalPromptInfo } from './menu/PromptMenu';

/**
 * Trigger character definitions and their corresponding menu types
 */
export enum TriggerType {
	PROMPT = 'prompt',
	CONTEXT = 'context'
}

/**
 * Menu dimensions and styling constants
 */
const MENU_CONSTANTS = {
	// Approximate dimensions used for positioning calculations
	HEIGHT: 200,
	WIDTH: 300,

	// CSS dimensions used for actual rendering
	MAX_WIDTH: '320px',
	MIN_WIDTH: '200px',

	// Menu constraints
	MAX_HEIGHT: 200, // From NavigableMenu maxHeight
	ITEM_HEIGHT: 44,  // Approximate height per menu item
	PADDING_HEIGHT: 16 // Top/bottom padding
} as const;


/**
 * Complete trigger configuration mapping.
 *
 * All triggers require a word boundary (start of text, space, or newline).
 *
 * Word boundary rules (menu triggers only on "natural" word start):
 *
 * ✅ ALLOWED (will trigger menu):
 *   "@user"           - at start of text
 *   "hello @user"     - after space
 *   "line\n@user"     - after newline
 *   "/prompt"         - at start of text
 *   "text /prompt"    - after space
 *   "[[link"          - at start of text
 *   "word [[link"     - after space
 *
 * ❌ BLOCKED (will NOT trigger menu):
 *   "email@user.com"  - after letter (email)
 *   "path/@user"      - after slash
 *   "word@user"       - after letter
 *   "test[[link"      - after letter
 *   "url/@path"       - after slash
 *   "file[[name"      - after letter
 */
const TRIGGER_CONFIG = {
	'/':  { type: TriggerType.PROMPT,  needsWordBoundary: true,  endChar: '/'  },
	'@':  { type: TriggerType.CONTEXT, needsWordBoundary: true,  endChar: '@'  },
	'[[': { type: TriggerType.CONTEXT, needsWordBoundary: true, endChar: ']]' }
} as const;

type TriggerChar = keyof typeof TRIGGER_CONFIG;

// Pre-compiled regex patterns for markdown syntax detection (performance optimization)
const REGEX_BACKTICK = /`/g;
const REGEX_OPEN_BRACKET = /\[/g;
const REGEX_CLOSE_BRACKET = /\]/g;
const REGEX_OPEN_PAREN = /\(/g;
const REGEX_CLOSE_PAREN = /\)/g;

const isInsideMarkdownSyntax = (text: string, position: number): boolean => {
	// Only check text before the cursor position
	const textBefore = text.substring(0, position);

	// Check for unclosed inline code (odd number of backticks means we're inside code)
	// Example: `code @here` - the @ should not trigger menu
	if ((textBefore.match(REGEX_BACKTICK) || []).length % 2 === 1) return true;

	// Check for unclosed square brackets (markdown links: [text](url))
	// Example: [link @text] - the @ should not trigger menu
	const openBrackets = (textBefore.match(REGEX_OPEN_BRACKET) || []).length;
	const closeBrackets = (textBefore.match(REGEX_CLOSE_BRACKET) || []).length;
	if (openBrackets > closeBrackets) return true;

	// Check for unclosed parentheses (markdown link URLs: (url))
	// Example: (url @text) - the @ should not trigger menu
	const openParens = (textBefore.match(REGEX_OPEN_PAREN) || []).length;
	const closeParens = (textBefore.match(REGEX_CLOSE_PAREN) || []).length;
	if (openParens > closeParens) return true;

	return false;
};

/**
 * Check if cursor is inside markdown syntax (prevents unwanted menu activation)
 *
 * Examples that should NOT trigger menus:
 * - `code @here` (inside backticks)
 * - [link @text] (inside brackets)
 * - (url @text) (inside parentheses)
 * - some [text @here (unclosed)
 */
/**
 * Parse current input state to find active trigger information
 * @param value - Current input value
 * @param cursorPos - Current cursor position
 * @returns Object with trigger state information
 */
const parseTriggerState = (value: string, cursorPos: number): {
	triggerStart: number;
	triggerChar: TriggerChar | string;
	triggerType: TriggerType | null;
	hasActiveTrigger: boolean;
} => {
	// Get text before cursor
	const textBeforeCursor = value.substring(0, cursorPos);

	// Find the trigger character before cursor
	let triggerStart = -1;
	let triggerChar: TriggerChar | string = '';
	let triggerType: TriggerType | null = null;

	// Simple test: check if text ends with any trigger character from config
	for (const char of Object.keys(TRIGGER_CONFIG) as TriggerChar[]) {
		if (textBeforeCursor.endsWith(char)) {
			triggerStart = textBeforeCursor.length - char.length;
			triggerChar = char;
			triggerType = TRIGGER_CONFIG[char].type;
			break; // Found a match, stop checking
		}
	}

	// Check for active triggers that should keep menu open
	// This finds incomplete triggers (like "@mention" without ending "@", "[[link" without "]]")
	// Menu stays open when user is actively typing a trigger pattern
	//
	// Examples that return true (menu stays open):
	//   "@user"     - incomplete @ trigger, needs ending @
	//   "[[link"    - incomplete [[ trigger, needs ending ]]
	//   "/summ"     - incomplete / trigger, needs ending /
	//
	// Examples that return false (menu closes):
	//   "@user@"    - complete @ trigger, menu can close
	//   "[[link]]"  - complete [[ trigger, menu can close
	//   "/summ/"    - complete / trigger, menu can close
	//   "email@"    - not at word boundary, no trigger active
	const hasActiveTrigger = (() => {
		// Iterate through all trigger types to find active/incomplete ones
		for (const [char, config] of Object.entries(TRIGGER_CONFIG)) {
			const lastPos = textBeforeCursor.lastIndexOf(char);
			if (lastPos === -1) continue;

			// Check word boundary if required
			if (config.needsWordBoundary) {
				const beforeChar = lastPos === 0 ? '' : textBeforeCursor[lastPos - 1];
				const isAtWordBoundary = beforeChar === '' || beforeChar === ' ' || beforeChar === '\n';
				if (!isAtWordBoundary) continue;
			}

			// Check if trigger is incomplete (end char not found after start)
			const textAfterStart = textBeforeCursor.substring(lastPos + char.length);
			const isIncomplete = !textAfterStart.includes(config.endChar);
			if (!isIncomplete) continue;

			// Make sure we're not inside any markdown syntax
			if (!isInsideMarkdownSyntax(textBeforeCursor, lastPos)) {
				triggerStart = lastPos;
				triggerChar = char;
				triggerType = config.type;
				return true;
			}
		}

		return false;
	})();

	return {
		triggerStart,
		triggerChar,
		triggerType,
		hasActiveTrigger
	};
};


/**
 * Get precise cursor coordinates in textarea using mirror element technique
 * @param textarea - The textarea element
 * @param cursorPos - Current cursor position in text
 * @returns Object with top and left coordinates relative to viewport
 */
const getCaretCoordinates = (textarea: HTMLTextAreaElement, cursorPos: number): { top: number; left: number } => {
	// Create mirror div for precise cursor positioning
	const mirrorDiv = document.createElement('div');
	const textareaStyle = window.getComputedStyle(textarea);

	// Copy essential styles to mirror div
	const styleProps = [
		'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
		'lineHeight', 'letterSpacing', 'wordSpacing',
		'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
		'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
		'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
		'width', 'height', 'boxSizing',
		'whiteSpace', 'wordWrap', 'wordBreak',
		'textAlign', 'textTransform', 'textIndent'
	];

	styleProps.forEach(prop => {
		mirrorDiv.style[prop as any] = textareaStyle[prop as any];
	});

	// Set mirror div properties
	mirrorDiv.style.position = 'absolute';
	mirrorDiv.style.visibility = 'hidden';
	mirrorDiv.style.overflow = 'hidden';
	mirrorDiv.style.top = '0';
	mirrorDiv.style.left = '0';
	mirrorDiv.style.pointerEvents = 'none';

	// Insert text before cursor
	const textBefore = textarea.value.substring(0, cursorPos);
	const textAfter = textarea.value.substring(cursorPos);

	// Create span anchor at cursor position
	const cursorSpan = document.createElement('span');
	cursorSpan.textContent = '\u200B'; // Zero-width space character
	cursorSpan.style.display = 'inline-block';

	// Build mirror content
	mirrorDiv.textContent = textBefore;
	mirrorDiv.appendChild(cursorSpan);

	// Add remaining text to ensure proper wrapping
	if (textAfter) {
		const afterText = document.createTextNode(textAfter);
		mirrorDiv.appendChild(afterText);
	}

	// Add to DOM temporarily
	document.body.appendChild(mirrorDiv);

	// Get cursor coordinates from mirror
	const cursorRect = cursorSpan.getBoundingClientRect();
	const mirrorRect = mirrorDiv.getBoundingClientRect();

	// Calculate absolute position
	const cursorX = cursorRect.left;
	const cursorY = cursorRect.top;

	// Remove mirror from DOM
	document.body.removeChild(mirrorDiv);

	return { top: cursorY, left: cursorX };
};

/**
 * Get cursor position relative to viewport
 * @param textarea - The textarea element
 * @param cursorPos - Current cursor position in text
 * @returns Cursor coordinates relative to viewport
 */
const getCursorPosition = (textarea: HTMLTextAreaElement, cursorPos: number): { x: number; y: number } => {
	const rect = textarea.getBoundingClientRect();
	const caretCoords = getCaretCoordinates(textarea, cursorPos);

	// Calculate absolute position relative to viewport
	const cursorX = rect.left + caretCoords.left - textarea.scrollLeft;
	const cursorY = rect.top + caretCoords.top - textarea.scrollTop;

	return { x: cursorX, y: cursorY };
};

interface PromptInputMenuProps {
	textareaRef: React.RefObject<HTMLTextAreaElement>;
	prompts?: ExternalPromptInfo[];
}

/**
 * Menu state type
 */
interface MenuState {
	isOpen: boolean;
	type: TriggerType | null;
	query: string;
	position: { top: number; left: number };
	triggerChar: TriggerChar | string;
	triggerStart: number;
	fullText: string; // Save the complete text when menu was triggered
	currentFolder?: string; // Current folder path for navigation
}

/**
 * Hook for managing prompt input menu
 */
const usePromptInputMenu = (textareaRef: React.RefObject<HTMLTextAreaElement>) => {
	const [menuState, setMenuState] = useState<MenuState>({
		isOpen: false,
		type: null,
		query: '',
		position: { top: 0, left: 0 },
		triggerChar: '',
		triggerStart: 0,
		fullText: '',
	});

	const inputContext = usePromptInputContext();
	const [lastValue, setLastValue] = useState('');

	// Check for menu triggers in input
	const checkForMenuTrigger = useCallback((value: string, cursorPos: number) => {
        // Get current state from textarea (more reliable than parameters)
		if (textareaRef.current && textareaRef.current.isConnected) {
			const textarea = textareaRef.current;
			value = textarea.value;
			cursorPos = textarea.selectionStart;
		}

		// Parse trigger state from current input
		const { triggerStart, triggerChar, triggerType, hasActiveTrigger } = parseTriggerState(value, cursorPos);

		if (hasActiveTrigger || triggerType) {
			const textBeforeCursor = value.substring(0, cursorPos);
			const query = textBeforeCursor.substring(triggerStart + triggerChar.length);

			// Calculate menu position
			if (textareaRef.current && textareaRef.current.isConnected) {
				const textarea = textareaRef.current;
				const cursorPosCoords = getCursorPosition(textarea, cursorPos);

				setMenuState({
					isOpen: true,
					type: triggerType,
					query,
					position: { top: cursorPosCoords.y, left: cursorPosCoords.x }, // Will be adjusted with real menu dimensions later
					triggerChar,
					triggerStart,
					fullText: value, // Save the complete text when menu was triggered
				});
			}
		} else {
			// Only close menu if it was previously open
			setMenuState((prev: MenuState) => {
				if (prev.isOpen) {
					return { ...prev, isOpen: false };
				}
				return prev;
			});
		}
	}, [textareaRef]);

	// Listen for input value changes to check for menu triggers
	useEffect(() => {
		const currentValue = inputContext.textInput.value;
		if (currentValue !== lastValue) {
			// Value changed, check for menu triggers
			const textarea = textareaRef.current;
			if (textarea && textarea.isConnected) {
				const cursorPos = textarea.selectionStart;
				checkForMenuTrigger(currentValue, cursorPos);
				setLastValue(currentValue);
			}
		}
	}, [inputContext.textInput.value, lastValue, checkForMenuTrigger, textareaRef]);

	return { menuState, setMenuState, checkForMenuTrigger };
};

/**
 * Internal component for menu functionality that needs access to input context
 */
/**
 * Calculate final menu position based on actual menu dimensions and cursor position
 * @param cursorPos - Cursor position coordinates
 * @param menuWidth - Actual menu width
 * @param menuHeight - Actual menu height
 * @returns Final menu position
 */
const calculateFinalMenuPosition = (
	cursorPos: { x: number; y: number },
	menuWidth: number,
	menuHeight: number
): { top: number; left: number } => {
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	let top: number;
	let left: number;

	// Vertical positioning: prefer below cursor
	const bottomSpace = viewportHeight - cursorPos.y;
	const topSpace = cursorPos.y;
	
	if (topSpace >= menuHeight) {
		// Show above cursor
		top = cursorPos.y - menuHeight;
	} else {
		// Not enough space, show below anyway
		top = cursorPos.y;
	}

	// Ensure menu doesn't go above viewport
	if (top < 0) {
		top = 0;
	}

	// Horizontal positioning
	if (cursorPos.x + menuWidth > viewportWidth) {
		// Would overflow right, align with right edge
		left = viewportWidth - menuWidth;
	} else {
		// Safe position, align with cursor
		left = cursorPos.x;
	}

	// Ensure menu doesn't go off left edge
	if (left < 0) {
		left = 0;
	}

	// console.log('Menu position calculated:', { top, left, menuWidth, menuHeight, viewportWidth, viewportHeight, cursorPos });

	return { top, left };
};

const MenuHandler: React.FC<{
	menuState: MenuState;
	setMenuState: React.Dispatch<React.SetStateAction<MenuState>>;
	prompts?: ExternalPromptInfo[];
}> = ({ menuState, setMenuState, prompts = [] }) => {
	const inputContext = usePromptInputContext();
	const menuRef = React.useRef<HTMLDivElement>(null);
	const [hasPositioned, setHasPositioned] = React.useState(false);

	// Adjust menu position after it renders with real dimensions
	React.useEffect(() => {
		if (menuState.isOpen && menuRef.current && !hasPositioned) {
			// Wait for menu content to fully render, then measure
			const measureAndPosition = () => {
				if (!menuRef.current) return;

				const menuElement = menuRef.current;
				const rect = menuElement.getBoundingClientRect();
				const menuWidth = rect.width;
				const menuHeight = rect.height;

				// Skip if dimensions are too small (content not loaded yet)
				if (menuHeight < 10) {
					// console.log('Menu height too small, waiting for content to load...', menuHeight);
					setTimeout(measureAndPosition, 50);
					return;
				}

				// Extract cursor position from current menuState position (temporary)
				const cursorPos = {
					x: menuState.position.left,
					y: menuState.position.top
				};

				// Calculate final position with real menu dimensions
				const finalPosition = calculateFinalMenuPosition(cursorPos, menuWidth, menuHeight);

				// console.log('Menu position calculated:', {
				// 	top: finalPosition.top,
				// 	left: finalPosition.left,
				// 	menuWidth,
				// 	menuHeight,
				// 	viewportWidth: window.innerWidth,
				// 	viewportHeight: window.innerHeight,
				// 	cursorPos
				// });

				// Update menu position
				setMenuState(prev => ({
					...prev,
					position: finalPosition
				}));

				setHasPositioned(true);
			};

			// Initial measurement attempt
			setTimeout(measureAndPosition, 10);
		}
	}, [menuState.isOpen, hasPositioned, menuState.position, setMenuState]);

	// Reset positioning flag when menu closes
	React.useEffect(() => {
		if (!menuState.isOpen) {
			setHasPositioned(false);
		}
	}, [menuState.isOpen]);

	// Handle menu selection
	const handleMenuSelect = useCallback((value: string) => {
		if (!menuState.isOpen) return;

		const { triggerStart, triggerChar, fullText } = menuState;

		// Replace the trigger text with the selected value, wrapped with trigger char for styling
		const endPos = triggerStart + triggerChar.length;
		const wrappedValue = ' ' + triggerChar + value + triggerChar + ' ';
		const newValue = fullText.substring(0, triggerStart) + wrappedValue + fullText.substring(endPos);

		// Update input context first (this will sync to all components)
		inputContext.textInput.setInput(newValue);

		// Close menu
		setMenuState((prev: MenuState) => ({ ...prev, isOpen: false }));

		// Focus after a short delay to ensure input is updated
		setTimeout(() => {
			inputContext.focusInput();
		}, 0);
	}, [menuState, inputContext, setMenuState]);

	const handleNavigateFolder = useCallback((folderPath: string) => {
		// Update menu state to navigate into the folder
		setMenuState((prev: MenuState) => ({
			...prev,
			currentFolder: folderPath,
			query: '', // Clear query when navigating
			isOpen: true // Keep menu open during navigation
		}));
	}, []);

	// Handle menu close
	const handleMenuClose = useCallback(() => {
		setMenuState((prev: MenuState) => ({ ...prev, isOpen: false }));
	}, [setMenuState]);

	return (
		<>
			{/* Menu overlay */}
			{menuState.isOpen && (
				<div
					ref={menuRef}
					className="pktw-fixed pktw-z-[2147483647] pktw-bg-white pktw-border pktw-border-gray-200 pktw-rounded-lg pktw-shadow-2xl pktw-pointer-events-auto pktw-ring-2 pktw-ring-gray-900/10"
					style={{
						top: menuState.position.top,
						left: menuState.position.left,
						maxWidth: MENU_CONSTANTS.MAX_WIDTH,
						minWidth: MENU_CONSTANTS.MIN_WIDTH,
						boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.25), 0 0 0 1px rgb(255 255 255 / 0.05), 0 0 0 0 1px rgb(0 0 0 / 0.1)',
						border: '1px solid rgb(229 231 235)',
					}}
				>
					{menuState.type === TriggerType.PROMPT && (
						<PromptMenu
							prompts={prompts}
							query={menuState.query}
							onSelect={handleMenuSelect}
							onClose={handleMenuClose}
						/>
					)}
					{menuState.type === TriggerType.CONTEXT && (
						<ContextMenu
							query={menuState.query}
							onSelect={handleMenuSelect}
							onClose={handleMenuClose}
							maxItems={8}
							currentFolder={menuState.currentFolder}
							onNavigateFolder={handleNavigateFolder}
							key={`context-${menuState.currentFolder || 'root'}`} // Force re-render when folder changes
						/>
					)}
				</div>
			)}
		</>
	);
};

/**
 * PromptInputMenu component that provides menu functionality for prompt input
 */
export const PromptInputMenu: React.FC<PromptInputMenuProps> = ({ textareaRef, prompts = [] }) => {
	const { menuState, setMenuState } = usePromptInputMenu(textareaRef);

	return (
		<MenuHandler
			menuState={menuState}
			setMenuState={setMenuState}
			prompts={prompts}
		/>
	);
};

