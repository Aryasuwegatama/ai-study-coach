---
name: Task plan
about: High-level implementation plan for one task from the PRD Section 5 task map
title: "T-XX: <task name>"
labels: ""
assignees: ""
---

<!--
Keep this high level: describe the shape of the work, not line-by-line code.
The implementer (or their AI agent) works out the details against docs/prd/.
-->

**Owner:** <name> · **Branch:** `<type>/T-XX-<short-name>` · **Depends on:** <T-XX / #issue, or "none">

### Goal

<!-- One or two sentences on what this task delivers. -->

### PRD references

<!-- Sections and rules this implements, e.g. §2 Study Spaces; §4 study_spaces table, security rules 1–2. -->

### Scope

- **In:**
- **Out:** <!-- what belongs to another task or is deferred -->

### Approach

<!-- 4–8 high-level steps. -->

1.

### Areas expected to change

<!-- Folders/modules, e.g. src/features/spaces/**, src/app/api/spaces/**. -->

- **Must not change:** <!-- files owned by others; coordinate first -->

### Contracts and interfaces

<!-- APIs, Zod schemas, tables or helpers this creates or depends on. -->

### Acceptance criteria and tests

<!-- Checkable outcomes, including ownership and security checks. -->

- [ ]

### Risks and open questions

-

---

Done when the PRD Section 5 Definition of Done is met and the PR (with `Closes #<this issue>`) is merged.
