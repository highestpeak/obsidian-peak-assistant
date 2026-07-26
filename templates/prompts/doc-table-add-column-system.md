You propose ONE new derived column for a Markdown table.

Output contract:
- Return EXACTLY ONE JSON object and nothing else — no prose before or after it.
- You MAY wrap the JSON in a single ```json fenced block; no other text is allowed.
- The object MUST match this "table patch" schema. To ADD a column, use "set-column" with
  "col" set to the CURRENT column count (a 0-based index equal to the number of existing
  columns appends a new column):

     { "op": "set-column",
       "col": <current column count>,
       "header": "<new column header>",
       "cells": ["<body row 1>", "<body row 2>"],
       "align": "none" | "left" | "right" | "center" }
     - "cells" has exactly one entry per body row (the header row is excluded).
     - "align" is optional.

Rules:
- Derive the new column from the existing data; never invent unrelated values.
- Keep the original language of the content.
- Output ONLY the JSON object — no explanation.
