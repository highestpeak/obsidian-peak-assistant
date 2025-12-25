
import React, { type ComponentProps } from "react";
import { Button } from "@/ui/component/shared-ui/button";
import {
  ScrollArea,
  ScrollBar,
} from "@/ui/component/shared-ui/scroll-area";
import { cn } from "@/ui/react/lib/utils";

export type SuggestionsProps = ComponentProps<typeof ScrollArea>;

export const Suggestions = ({
  className,
  children,
  ...props
}: SuggestionsProps) => (
  <ScrollArea className="pktw-w-full pktw-overflow-x-auto pktw-whitespace-nowrap" {...props}>
    <div className={cn("pktw-flex pktw-w-max pktw-flex-nowrap pktw-items-center pktw-gap-2", className)}>
      {children}
    </div>
    <ScrollBar className="pktw-hidden" orientation="horizontal" />
  </ScrollArea>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  variant = "outline",
  size = "sm",
  children,
  ...props
}: SuggestionProps) => {
  const handleClick = () => {
    onClick?.(suggestion);
  };

  return (
    <Button
      className={cn("pktw-cursor-pointer pktw-rounded-full pktw-px-4", className)}
      onClick={handleClick}
      size={size}
      type="button"
      variant={variant}
      {...props}
    >
      {children || suggestion}
    </Button>
  );
};
