import { EmojiPicker, EmojiPickerContent, EmojiPickerSearch } from "@/components/ui/emoji-picker";
import { t } from "@/i18n";

// Its own module so the emoji picker loads only when someone opens the board icon.
export default function BoardIconPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <EmojiPicker onEmojiSelect={({ emoji }) => onPick(emoji)}>
      <EmojiPickerSearch placeholder={t.boardIcon.search} />
      <EmojiPickerContent empty={t.boardIcon.empty} loading={t.boardIcon.loading} />
    </EmojiPicker>
  );
}
