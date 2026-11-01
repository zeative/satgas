import { EmojiPicker as Primitive } from "frimousse";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Emoji data comes from Satgas's own server (see /api/emojibase), so the picker works offline.
const DATA_URL = "/api/emojibase";

function EmojiPicker({ className, ...props }: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      emojibaseUrl={DATA_URL}
      locale="en"
      columns={8}
      className={cn("isolate flex h-80 w-[17.5rem] flex-col bg-popover", className)}
      {...props}
    />
  );
}

function EmojiPickerSearch({ className, ...props }: React.ComponentProps<typeof Primitive.Search>) {
  return (
    <div className="border-b p-1.5">
      <Primitive.Search
        className={cn(
          "h-7 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50 dark:bg-input/30",
          className,
        )}
        {...props}
      />
    </div>
  );
}

function EmojiPickerContent({ empty, loading }: { empty: string; loading: string }) {
  return (
    <Primitive.Viewport className="relative flex-1 outline-hidden">
      <Primitive.Loading className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{loading}</Primitive.Loading>
      <Primitive.Empty className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">{empty}</Primitive.Empty>
      <Primitive.List
        className="pb-1.5 select-none"
        components={{
          CategoryHeader: ({ category, ...props }) => (
            <div className="bg-popover px-2.5 pt-2.5 pb-1 text-xs text-muted-foreground" {...props}>
              {category.label}
            </div>
          ),
          Row: ({ children, ...props }) => (
            <div className="scroll-my-1.5 px-1.5" {...props}>
              {children}
            </div>
          ),
          Emoji: ({ emoji, ...props }) => (
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md text-lg data-[active]:bg-accent"
              {...props}
            >
              {emoji.emoji}
            </button>
          ),
        }}
      />
    </Primitive.Viewport>
  );
}

export { EmojiPicker, EmojiPickerContent, EmojiPickerSearch };
