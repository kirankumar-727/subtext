# Writer Workspace Flow

![Writer Workspace flow](./writer-workspace-flow.svg)

```mermaid
flowchart TD
  Admin --> Stories
  Stories --> NewStory[New Story]
  NewStory --> Write
  Write --> Autosave
  Autosave --> Preview
  Preview --> Publish
  Publish --> Engine[Publishing Engine]
```
