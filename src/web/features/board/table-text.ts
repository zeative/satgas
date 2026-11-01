// A table edits as plain text: one row per line, cells split by commas. A cell in double quotes keeps its commas,
// line breaks and edge spaces, and "" inside it is one quote, as in CSV.

const needsQuotes = (cell: string) => /[",\r\n]/.test(cell) || cell !== cell.trim();
const cellText = (cell: string) => (needsQuotes(cell) ? `"${cell.replace(/"/g, '""')}"` : cell);

export const tableText = (rows: string[][]) => rows.map((r) => r.map(cellText).join(", ")).join("\n");

export function parseTable(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  // Length of the quoted part once its quote closes; text after it is kept, minus surrounding spaces.
  let quotedEnd = -1;

  const endCell = () => {
    row.push(quotedEnd < 0 ? cell.trim() : cell.slice(0, quotedEnd) + cell.slice(quotedEnd).trim());
    cell = "";
    quotedEnd = -1;
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
        quotedEnd = cell.length;
      } else cell += ch;
    } else if (ch === '"' && quotedEnd < 0 && !cell.trim()) {
      inQuotes = true;
      cell = "";
    } else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cell += ch;
  }
  if (cell || row.length || quotedEnd >= 0) endRow();
  return rows;
}
