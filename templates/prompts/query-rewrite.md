=== Behavior Context ===
Current query        : {{currentQuery}}
Active file          : {{activeFilePath}}
Result view          : {{currentResultView}}
Recent queries       : {{recentQueriesLine}}
Recent opened files  : {{recentOpenedFilesLine}}
Pinned hub docs      : {{pinnedLine}}
Known top folders    : {{knownTopFoldersLine}}

=== Typed Query Trail (highest-signal — read this first) ===
{{{typedTrail}}}

=== First-Screen Results (what the user is looking at right now) ===
{{{firstScreenLine}}}

=== Session Timeline ({{eventCount}} events, includes typed trail above plus browsing / view switches / etc) ===
{{{sessionTimeline}}}

=== Task ===
Produce 3–5 rewritten structured queries as JSON. Return only the JSON object, no prose.
Ground candidates in what the user can see on-screen when it helps — e.g. "narrow to the folder these top 3 hits share" is a strong candidate; "exclude the drafts/ noise that dominates the first page" is another.
