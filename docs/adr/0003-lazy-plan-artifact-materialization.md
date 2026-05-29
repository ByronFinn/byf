# Lazy plan artifact materialization in Plan Mode

We decided that entering Plan Mode must not touch the filesystem: no plan directory creation and no empty plan file creation. A stable in-memory `planId` and target path are still created on enter for UX and workflow continuity, while materialization happens only on the first Write/Edit to the plan path (and `clearPlan` remains a no-op when the file does not exist). This prevents garbage plan artifacts from frequent enter/exit toggles while preserving Plan Mode state semantics and approval flow.
