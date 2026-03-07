# User query
{{userQuery}}

# Logic model (JSON)
<<<
{{{logicModelJson}}}
>>>

Convert this logic model into a single Mermaid flowchart. Use flowchart TD; assign N1, N2, … to nodes by array order (nodes[0]=N1, nodes[1]=N2, …); edges use fromIndex/toIndex to refer to those (e.g. fromIndex 0 toIndex 1 → N1 --> N2); quoted labels; subgraphs per cluster using nodeIndices; dashed arrows (-.->) for conflict edges. Add linkStyle lines at the end for each conflict edge (0-based link index, red dashed stroke as in the system prompt). Output only the Mermaid code.
