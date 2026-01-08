import React, { createContext, useContext, useRef, useCallback, useEffect, useState, useMemo, type FormEvent, type HTMLAttributes, type PropsWithChildren } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { calculateFileHash } from '@/core/utils/hash-utils';
import type { PromptInputMessage, FileAttachment } from './types';

/**
 * Context for prompt input state management
 */
interface PromptInputContextValue {
	textInput: {
		value: string;
		setInput: (value: string) => void;
		clear: () => void;
	};
	focusInput: () => void;
	attachments: {
		files: FileAttachment[];
		add: (files: File[] | FileList) => void;
		remove: (id: string) => void;
		clear: () => void;
		openFileDialog: () => void;
		registerFileInput: (ref: React.RefObject<HTMLInputElement | null>) => void;
	};
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null);

/**
 * Hook to access prompt input context
 */
export const usePromptInputContext = () => {
	const context = useContext(PromptInputContext);
	if (!context) {
		throw new Error('usePromptInputContext must be used within PromptInput');
	}
	return context;
};

export interface PromptInputProps extends Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> {
	onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void | Promise<void>;
	multiple?: boolean;
	globalDrop?: boolean;
	accept?: string;
	initialInput?: string;
	inputFocusRef?: React.Ref<{ focus: () => void }>;
}

/**
 * Main PromptInput component with internal state management
 * Layout: textarea on top, tools (file/search/model) on bottom left, submit on bottom right
 */
export const PromptInput: React.FC<PromptInputProps> = ({
	className,
	onSubmit,
	multiple = true,
	globalDrop = false,
	accept,
	initialInput = '',
	inputFocusRef,
	children,
	...props
}) => {
	// Internal state
	const [textInput, setTextInput] = useState(initialInput);
	const [attachments, setAttachments] = useState<FileAttachment[]>([]);
	const openFileDialogRef = useRef<() => void>(() => { });
	const formRef = useRef<HTMLFormElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Text input methods
	const setInput = useCallback((value: string) => {
		setTextInput(value);
	}, []);

	const clearInput = useCallback(() => {
		setTextInput('');
	}, []);

	const focusInput = useCallback(() => {
		inputFocusRef?.current?.focus();
	}, [inputFocusRef]);

	// File attachment methods
	const createImagePreview = useCallback((file: File): Promise<string> => {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = (e) => {
				if (e.target?.result) {
					resolve(e.target.result as string);
				} else {
					reject(new Error('Failed to read file'));
				}
			};
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}, []);

	const getFileType = useCallback((file: File): 'image' | 'file' | 'pdf' => {
		if (file.type.startsWith('image/')) {
			return 'image';
		}
		if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
			return 'pdf';
		}
		return 'file';
	}, []);

	const addFiles = useCallback(async (files: File[] | FileList) => {
		const fileArray = Array.from(files);
		const newAttachments: FileAttachment[] = [];

		for (const file of fileArray) {
			// Calculate file hash for deduplication
			let fileHash: string;
			try {
				fileHash = await calculateFileHash(file);
			} catch (error) {
				console.error('Failed to calculate file hash:', error);
				// Continue without hash if calculation fails
				fileHash = `${file.name}-${file.size}-${file.lastModified}`;
			}

			const type = getFileType(file);
			const attachment: FileAttachment = {
				id: `${Date.now()}-${Math.random()}`,
				file,
				type,
				hash: fileHash,
			};

			if (type === 'image') {
				try {
					attachment.preview = await createImagePreview(file);
				} catch (error) {
					console.error('Failed to create image preview:', error);
				}
			}

			newAttachments.push(attachment);
		}

		if (newAttachments.length > 0) {
			setAttachments((prev) => {
				// Filter out duplicates based on hash
				const existingHashes = new Set(prev.map(a => a.hash).filter(Boolean));
				const uniqueNewAttachments = newAttachments.filter(a => !a.hash || !existingHashes.has(a.hash));

				if (uniqueNewAttachments.length < newAttachments.length) {
					console.log(`Skipped ${newAttachments.length - uniqueNewAttachments.length} duplicate file(s)`);
				}

				return [...prev, ...uniqueNewAttachments];
			});
		}
	}, [createImagePreview, getFileType]);

	const removeFile = useCallback((id: string) => {
		setAttachments((prev) => {
			const file = prev.find((f) => f.id === id);
			if (file?.preview && file.preview.startsWith('blob:')) {
				URL.revokeObjectURL(file.preview);
			}
			return prev.filter((f) => f.id !== id);
		});
	}, []);

	const clearFiles = useCallback(() => {
		setAttachments((prev) => {
			prev.forEach((f) => {
				if (f.preview && f.preview.startsWith('blob:')) {
					URL.revokeObjectURL(f.preview);
				}
			});
			return [];
		});
	}, []);

	const openFileDialog = useCallback(() => {
		openFileDialogRef.current?.();
	}, []);

	const registerFileInput = useCallback((ref: React.RefObject<HTMLInputElement | null>) => {
		openFileDialogRef.current = () => {
			ref.current?.click();
		};
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			attachments.forEach((f) => {
				if (f.preview && f.preview.startsWith('blob:')) {
					URL.revokeObjectURL(f.preview);
				}
			});
		};
	}, []);

	// Context value
	const contextValue = useMemo<PromptInputContextValue>(
		() => ({
			textInput: {
				value: textInput,
				setInput,
				clear: clearInput,
			},
			focusInput,
			attachments: {
				files: attachments,
				add: addFiles,
				remove: removeFile,
				clear: clearFiles,
				openFileDialog,
				registerFileInput,
			},
		}),
		[textInput, setInput, clearInput, focusInput, attachments, addFiles, removeFile, clearFiles, openFileDialog, registerFileInput]
	);

	// Register file input
	useEffect(() => {
		registerFileInput(fileInputRef);
	}, [registerFileInput]);

	// Handle file input change
	const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
		if (e.target.files && e.target.files.length > 0) {
			addFiles(e.target.files);
			// Reset input to allow selecting same files again
			e.target.value = '';
		}
	}, [addFiles]);

	// Handle form submit
	const handleSubmit = useCallback((e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		const message: PromptInputMessage = {
			text: textInput.trim(),
			files: attachments.map((f) => f.file),
		};

		// Only submit if there's text or files
		if (!message.text && message.files.length === 0) {
			return;
		}

		const result = onSubmit(message, e);

		// Handle async submit
		if (result instanceof Promise) {
			result
				.then(() => {
					// Clear on success
					clearInput();
					clearFiles();
				})
				.catch(() => {
					// Don't clear on error - user may want to retry
				});
		} else {
			// Sync submit - clear immediately
			clearInput();
			clearFiles();
		}
	}, [textInput, attachments, onSubmit, clearInput, clearFiles]);

	// Handle drag and drop
	useEffect(() => {
		if (!formRef.current) return;

		const handleDragOver = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes('Files')) {
				e.preventDefault();
			}
		};

		const handleDrop = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes('Files')) {
				e.preventDefault();
			}
			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				addFiles(e.dataTransfer.files);
			}
		};

		const form = formRef.current;
		form.addEventListener('dragover', handleDragOver);
		form.addEventListener('drop', handleDrop);

		return () => {
			form.removeEventListener('dragover', handleDragOver);
			form.removeEventListener('drop', handleDrop);
		};
	}, [addFiles, globalDrop]);

	// Global drop handler
	useEffect(() => {
		if (!globalDrop) return;

		const handleDragOver = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes('Files')) {
				e.preventDefault();
			}
		};

		const handleDrop = (e: DragEvent) => {
			if (e.dataTransfer?.types?.includes('Files')) {
				e.preventDefault();
			}
			if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
				addFiles(e.dataTransfer.files);
			}
		};

		document.addEventListener('dragover', handleDragOver);
		document.addEventListener('drop', handleDrop);

		return () => {
			document.removeEventListener('dragover', handleDragOver);
			document.removeEventListener('drop', handleDrop);
		};
	}, [addFiles, globalDrop]);

	return (
		<PromptInputContext.Provider value={contextValue}>
			<form
				ref={formRef}
				className={cn('pktw-w-full', className)}
				onSubmit={handleSubmit}
				{...props}
			>
				{/* Hidden file input */}
				<input
					ref={fileInputRef}
					type="file"
					multiple={multiple}
					accept={accept}
					onChange={handleFileChange}
					className="pktw-hidden"
					aria-label="Upload files"
				/>

				{/* Main content */}
				<div className="pktw-flex pktw-flex-col pktw-w-full">
					{children}
				</div>
			</form>
		</PromptInputContext.Provider>
	);
};

