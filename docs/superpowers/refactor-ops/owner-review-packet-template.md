# Owner Review Packet Template

Codex writes this after Claude Code completes one implementation task and commits. The goal is not only to review code. The goal is to help the user understand whether the project became more elegant, modular, and controllable.

## Packet Header

```md
# Owner Review Packet: <Task ID and Name>

Claude Code commit:
- <hash> <message>

Source-of-truth docs checked:
- Main handbook:
- Ambient spec:
- Command Gateway spec:

Verdict:
- Accepted / Needs changes / Blocked
```

## 0. Review Entry Points

List the documents the user should open first. When Codex reports this packet in chat, it must also provide clickable absolute file links for these entries.

| Review item | Status | Why open it |
| --- | --- | --- |
| This Owner Review Packet | Final / Draft | Main review surface for this task. |
| Claude Code implementation note | Source evidence | Shows what Claude claims it changed and verified. |
| Relevant handoff | Source contract | Shows what Claude was allowed to do. |
| Companion audit / baseline | Evidence | Shows before/after or diagnostic evidence. |
| Next handoff / draft | Pending approval | Shows the proposed next action, if any. |

## 1. One-Sentence Outcome

What changed in plain language?

```md
This task <introduced / measured / replaced / deleted / projected> <boundary or capability> so that <control benefit>.
```

## 2. Before Runtime Path

```mermaid
flowchart TD
  Entry["User / command / UI entry"] --> OldOwner["Old runtime owner"]
  OldOwner --> State["Old state truth"]
  OldOwner --> Output["Output surface"]
```

Explain:

- Entry:
- Runtime owner:
- State truth:
- Output:
- Why this was hard to control:

## 3. After Runtime Path

```mermaid
flowchart TD
  Entry["User / command / UI entry"] --> Contract["Capability / Contract / Guard"]
  Contract --> Run["RunEnvelope / Event / Artifact"]
  Run --> Port["Port / Adapter"]
  Run --> Artifact["Artifact / Trace"]
  Artifact --> Surface["UI projection"]
```

Explain:

- New entry:
- New runtime owner:
- New state truth:
- Surface projection:
- How this lowers change radius:

## 4. State Ownership Map

```mermaid
flowchart LR
  SQLite["SQLite"] --> Runtime["runtime service"]
  Vault["Vault files"] --> Runtime
  Store["Zustand / React store"] -. projection only .-> UI["UI"]
  Runtime --> Artifact["ArtifactRef / trace"]
```

Mark each state source:

| State | Owner | Consumers | Still ambiguous? |
| --- | --- | --- | --- |
|  |  |  |  |

## 5. Module Boundary Map

```mermaid
flowchart TD
  App["app layer"] --> Service["service layer"]
  Service --> Core["core contracts / ports"]
  UI["ui layer"] --> Service
  Service -. forbidden .-> UIStore["UI store as runtime truth"]
```

Explain:

- Boundary improved:
- Boundary still weak:
- New abstraction justified by:
- New abstraction risk:

## 6. Key Files To Read

Group files by learning path, not by git order.

| Read order | File | Why it matters |
| --- | --- | --- |
| 1 |  |  |
| 2 |  |  |
| 3 |  |  |

## 7. Old Path Deletion / Reduction

| Old path | Status | Evidence | Remaining risk |
| --- | --- | --- | --- |
|  | Deleted / Thin forwarding / Still active |  |  |

If old and new paths both still own behavior, the task is not accepted.

## 8. Verification

| Check | Result | Notes |
| --- | --- | --- |
| `npm run build` |  |  |
| targeted tests |  |  |
| old-path `rg` checks |  |  |
| manifest / assets if touched |  |  |

## 9. Elegance Score

Use the rubric in [`architecture-scorecard.md`](./architecture-scorecard.md).

| Dimension | Code | Before | After | Delta | Confidence | Reason / evidence |
| --- | --- | ---: | ---: | ---: | --- | --- |
| Architecture clarity | AC |  |  |  |  |  |
| Capability semantics | CS |  |  |  |  |  |
| Dependency direction | DD |  |  |  |  |  |
| Modularity / cohesion | MC |  |  |  |  |  |
| Side-effect isolation | SI |  |  |  |  |  |
| Single runtime path | SR |  |  |  |  |  |
| State ownership clarity | SO |  |  |  |  |  |
| Observability / trace | OT |  |  |  |  |  |
| Testability / fake-port readiness | TF |  |  |  |  |  |
| Old-path deletion | OD |  |  |  |  |  |
| Change radius | CR |  |  |  |  |  |
| Owner comprehension | OC |  |  |  |  |  |
| Overall elegance | Overall |  |  |  |  |  |

Grouped indices:

| Group | Before | After | Delta | Reason |
| --- | ---: | ---: | ---: | --- |
| Control Index |  |  |  | AC + OT + OC |
| Boundary Index |  |  |  | DD + MC + SI + CR |
| Runtime Truth Index |  |  |  | SR + SO + CS |
| Verification Index |  |  |  | TF + OD |

Optional task dimensions, if relevant:

| Optional dimension | Code | Score | Evidence |
| --- | --- | ---: | --- |
| UI surface stability | UX |  |  |
| Backward compatibility / migration safety | BC |  |  |
| Performance / cost containment | PC |  |  |
| Security / permission boundary | SC |  |  |
| Developer experience | DX |  |  |
| Documentation / handoff quality | DOC |  |  |

## 10. What The User Should Understand

After reading this packet, the user should be able to answer:

1. What is the new runtime path?
2. Where is the state truth?
3. Which side effects are behind ports or adapters?
4. Which old path was removed or downgraded?
5. If this breaks, which file should I inspect first?
6. How would I inspect or replay this run?
7. What does this unlock next?
8. What should not be touched in the next task?

## 11. Next Task

```md
Recommended next task:
- <Task ID>

Why now:
- ...

Do not do next:
- ...

Codex should prepare:
- ...
```

## 12. Review Verdict

```md
Verdict:
- Accepted / Needs changes / Blocked

Reason:
- ...

Required follow-up before next task:
- ...
```
