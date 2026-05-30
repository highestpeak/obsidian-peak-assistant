/**
 * Design-system primitives barrel.
 *
 * These are the React wrappers around the `.pk-*` CSS classes defined in
 * `src/styles/peak-components.css`. They are the design-system-era layer and
 * will gradually replace `src/ui/component/shared-ui/` as each UI surface is
 * refactored. See `docs/conventions/component-primitives.md`.
 */
export { Chip } from './Chip';
export type { ChipVariant, ChipProps } from './Chip';

export { IconButton } from './IconButton';
export type { IconButtonProps } from './IconButton';

export { Pill } from './Pill';
export type { PillProps } from './Pill';

export { Segmented } from './Segmented';
export type { SegmentedOption, SegmentedProps } from './Segmented';

export {
	Popover,
	PopoverTrigger,
	PopoverPortal,
	PopoverContent,
	PopoverItem,
} from './Popover';
export type { PopoverItemProps } from './Popover';

export {
	Modal,
	ModalTrigger,
	ModalContent,
	ModalHeader,
	ModalTitle,
	ModalSubtitle,
	ModalClose,
	ModalBody,
	ModalFooter,
} from './Modal';
export type { ModalContentProps, ModalCloseProps } from './Modal';

export { Row } from './Row';
export type { RowProps, RowValueProps } from './Row';

export { FormRow, FormGrid } from './FormRow';
export type {
	FormRowProps,
	FormInputProps,
	FormSliderProps,
	FormNumberProps,
} from './FormRow';

export { BrandAvatar } from './BrandAvatar';
export type { BrandAvatarProps } from './BrandAvatar';

export type { ProviderId } from './types';
