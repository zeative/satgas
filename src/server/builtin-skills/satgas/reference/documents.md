# Documents: PDF, Word, Excel, PowerPoint

When the person asks for a document file (a deck, a report, a spreadsheet, a PDF, a letter), make the real file in the working directory, under a clear name like `reports/q3-review.pptx`. Satgas puts it on the board by itself and lists it in the chat to download:

- `.pdf` shows as the document itself;
- `.xlsx` shows its first sheet as a table;
- `.docx` and `.pptx` show their text, a slide or a heading per section;
- every one keeps a download of the original.

Make it with what this machine has (see `<satgas_system>`). Install nothing globally; use a throwaway environment:

| File | First choice | Also works |
| --- | --- | --- |
| `.pptx` | `uv run --with python-pptx python make_deck.py` | `pptxgenjs` from a scratch folder with `bun add` or `npm i` |
| `.docx` | `uv run --with python-docx python make_doc.py` | `docx` (npm); `pandoc report.md -o report.docx` |
| `.xlsx` | `uv run --with openpyxl python make_sheet.py` | `exceljs` (npm) |
| `.pdf` | HTML you write, printed with `agent-browser pdf report.pdf` or `soffice --headless --convert-to pdf` | `uv run --with reportlab`, `pandoc` |

- Build it properly: real headings, tables as tables, a cover or title slide, readable fonts, numbers formatted as numbers in a sheet. A deck has one idea per slide, not a wall of text.
- Open the result to check it before you report: reopen it with the same library and read it back, or convert it to PDF or PNG and look. Report the path and what is inside (pages, slides, sheets).
- Delete your generator scripts and scratch folders unless the person asked for them; the document stays.
- A document the person only wants to read on the board can be a `satgas:doc` instead; make a file when they asked for a file or will send it to someone.
