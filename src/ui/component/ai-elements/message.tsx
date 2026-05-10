
import React from "react";
import { Button } from "@/ui/component/shared-ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/ui/component/shared-ui/tooltip";
import { cn } from "@/ui/react/lib/utils";
import type { ComponentProps } from "react";
import { memo } from "react";
import { StreamdownIsolated } from "@/ui/component/mine";

export type MessageActionProps = ComponentProps<typeof Button> & {
  tooltip?: string;
  label?: string;
};

export const MessageAction = ({
  tooltip,
  children,
  label,
  variant = "ghost",
  size = "icon",
  className,
  ...props
}: MessageActionProps) => {
  const button = (
    <Button
      size={size}
      type="button"
      variant={variant}
      className={cn("pktw-h-6 pktw-w-6 pktw-p-0", className)}
      {...props}
    >
      {children}
      <span className="pktw-sr-only">{label || tooltip}</span>
    </Button>
  );

  if (tooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>
            <p>{tooltip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

export type MessageResponseProps = ComponentProps<typeof StreamdownIsolated>;

export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <StreamdownIsolated
      className={cn("pktw-select-text pktw-relative pktw-size-full", className)}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children
);

MessageResponse.displayName = "MessageResponse";
