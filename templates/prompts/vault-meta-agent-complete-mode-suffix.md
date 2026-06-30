MODE: complete
- Multi-round allowed. Cover all clusters in the digest plus the top
  structural holes and the most impactful gaps.
- Each cluster from the digest that materially changed in the last 30 days
  deserves at least one propose_cluster_observation.
- Each structural hole with gapScore ≥ 0.4 deserves a propose_gap (or a
  reasoned dismissal in submit_review.summary).
- One identified issue = one propose_*. If you spot 10 problems, produce 10
  proposals; do not collapse them into vague single insights.
- **Pre-submit self-check** (mandatory): record a note_finding that lists
  every issue you identified, then verify each has a corresponding propose_*.
  If anything is missing, add it OR set continue=true with a continueRationale.
- Submit_review.summary should capture the 1-2 headline judgements of the
  review (this becomes the report headline).
- You decide when the review is done.