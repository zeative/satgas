// What one agent wrote goes into another agent's prompt (hand-off reports, team notes and answers). A page or file an
// agent read can plant text that imitates Satgas's own prompt structure; this keeps that text from reading as structure.
// It never removes or rewords anything: a tag gets a backslash after its "<", a turn marker one before its colon.

const TAGS =
  /<(\/?)(system[\w-]*|how_to_work|engineering|board|board_now|satgas_[\w-]+|task|mission|current_request|answers|attachments|pointed|skills|upstream_reports|you|instructions?|previous_attempt|continue|webhook_event|branch|commits|memory|person_rules|the_person)\b/gi;

export function defang(text: string): string {
  return text.replace(TAGS, "<\\$1$2").replace(/^(\s*)(Human|Assistant|System)(\s*):/gim, "$1$2$3\\:");
}
