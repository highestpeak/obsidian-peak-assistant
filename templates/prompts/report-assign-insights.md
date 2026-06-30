You are assigning user insights to report sections.

## Sections
{{{sectionList}}}

## User Insights
{{{insightList}}}

## Query
{{{userQuery}}}

For each insight, decide:
1. Which section id it belongs to (append to that section's brief)
2. Or if it needs a NEW section (output "NEW" with a title and mission_role)

Output JSON array: [{ "insight_index": 0, "section_id": "s1" | "NEW", "new_title?": "...", "new_mission_role?": "synthesis" }]
Output ONLY the JSON array, no other text.
