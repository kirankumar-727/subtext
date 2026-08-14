# Publication Job State Machine

![publication-job-state-machine](./publication-job-state-machine.svg)

```mermaid
stateDiagram-v2
  [*] --> queued
  queued --> processing: claim
  failed --> processing: retry claim
  processing --> committed: atomic commit
  committed --> verifying
  verifying --> succeeded
  processing --> failed: retryable
  committed --> failed: external failure
  verifying --> failed: verification failure
  failed --> dead_letter: exhausted/permanent
  processing --> dead_letter: permanent
  succeeded --> [*]
  dead_letter --> [*]
```
