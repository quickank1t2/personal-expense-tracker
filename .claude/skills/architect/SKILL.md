---
name: architect
description: "Requirement architect for the personal expense tracker. Use when asked to architect, spec out, or /new-req a feature. Takes a raw requirement through analysis → grilling → synthesis → spec file → GitHub issue."
---

# /architect

Multi-phase requirement architect for the SAP CAP personal expense tracker. Takes a raw requirement and produces: a structured Architect Brief, a grilled-and-refined Final Spec saved to `specs/SPEC-{slug}.md`, and a GitHub issue.

## Invocation

```
/architect <requirement text>
/architect   # prompts for requirement
```

---

## Phase 1 — Collect

If the user passed text after `/architect`, that is the raw requirement. If not, ask once: "What is the requirement?" and wait.

Once you have the requirement, confirm in one sentence: "Understood. Analysing: [requirement in your own words]." Then proceed immediately to Phase 2 — do not ask further questions yet.

---

## Phase 2 — Architect Analysis

Act as a SAP CAP solution architect. Run these reads **in parallel** before producing any output:

**Project source files:**
- `db/schema.cds`
- `srv/expense-service.cds`
- `srv/expense-service.js`
- `app/tracker/annotations.cds`
- `test/expense-service.test.js`

**Existing specs:**
Run `ls specs/ 2>/dev/null` at the project root. If the directory exists and contains `SPEC-*.md` files, read all of them. Use existing specs to:
- Detect if this requirement duplicates or overlaps work already specced
- Reuse established patterns (user story format, test case style, implementation structure)
- Surface dependencies or conflicts with planned work

Once you have read everything, produce the **Architect Brief**. Write each section in full — do not truncate.

---

### Architect Brief

**Functional Analysis**
Rewrite the requirement precisely from a technical perspective. One paragraph. What exactly is being asked for, stripped of ambiguity.

**Task Decomposition**
Numbered list. Each item is a discrete deliverable. Tag each with the layer it touches:
- `[db]` — entity or field changes in `db/schema.cds`
- `[srv-model]` — service definition changes in `srv/expense-service.cds`
- `[srv-logic]` — handler or business logic changes in `srv/expense-service.js`
- `[ui]` — annotation changes in `app/tracker/annotations.cds`
- `[test]` — new or updated tests in `test/expense-service.test.js`

A single task may have multiple tags.

**CAP Impact Map**
For each of the five project files, one line:
`[filename]` — `affected` | `not affected` — [one-clause reason]

**Assumptions**
Explicit assumptions made to reach this analysis. Numbered list. If none, say "None."

**Related Specs**
List any existing `SPEC-*.md` files that overlap with, depend on, or conflict with this requirement. For each, one sentence on the relationship. If none, say "None."

**Ambiguities**
Open questions that cannot be answered from the source code or requirement text alone. These become the seed for the grilling phase. If none, say "None — proceed to Phase 4."

---

Present the Architect Brief to the user in full. Then say:

> "I'll now grill you on the ambiguities and design decisions to lock down the spec."

Immediately proceed to Phase 3 — do not wait for the user to respond first.

---

## Phase 3 — Grill

Invoke the `mattpocock-skills:grilling` skill now using the Skill tool.

The grilling session should work through:
1. Every Ambiguity from the Architect Brief (these are the first-round frontier)
2. Every Assumption from the Architect Brief (challenge each one)
3. Any edge cases or scope questions that emerge as the tree expands

The session ends when the frontier is empty — every branch of the design tree visited, nothing left silently assumed.

Do not proceed to Phase 4 until grilling is complete. After the final grilling round, ask: "Are we done grilling? Reply 'yes, done' to move on to the spec."

---

## Phase 4 — Synthesize

Without asking further questions, synthesize everything: the original requirement, the Architect Brief, and all grilling answers.

Produce the **Final Spec** using the template below. Write every section in full.

---

```
# SPEC: {title}

**Status:** draft
**Created:** {YYYY-MM-DD}
**Slug:** {slug}
**GitHub Issue:** (to be added after creation)

---

## Problem Statement

[The problem from the user's perspective. One to three paragraphs. Why does this matter?]

---

## Solution

[The solution from the user's perspective. One to three paragraphs. What will exist after this is built?]

---

## User Stories

[Exhaustive numbered list. Format: "As a [actor], I want [feature], so that [benefit]."
Cover every scenario surfaced during grilling — happy path, edge cases, error states.]

---

## CAP Implementation Decisions

### Schema Changes (`db/schema.cds`)

[New entities, fields, associations, or constraints. "None" if unchanged.]

### Service Model Changes (`srv/expense-service.cds`)

[New or changed entity projections, actions, or functions exposed to OData. "None" if unchanged.]

### Service Logic Changes (`srv/expense-service.js`)

[New handlers, parsers, or helpers. Key algorithmic decisions. "None" if unchanged.]

### UI Annotation Changes (`app/tracker/annotations.cds`)

[New `@UI.LineItem`, `@UI.FieldGroup`, facets, filters, or selection fields. "None" if unchanged.]

### Testing Decisions

- What constitutes a good test for this feature (external OData behaviour, not implementation)
- Which existing test patterns in `test/expense-service.test.js` apply
- New test cases needed:
  - [ ] [test case 1]
  - [ ] [test case 2]
  ...

---

## Assumptions Confirmed

[List every assumption from the Architect Brief. Mark each: ✅ confirmed | ⚠️ overridden (with new truth) | ❓ still open.]

---

## Related Specs

[Any SPEC-*.md files that overlap, depend on, or conflict with this spec. One sentence per entry on the relationship. "None" if none.]

---

## Out of Scope

[What was explicitly ruled out during grilling. Bulleted list.]

---

## Further Notes

[Anything that didn't fit the sections above: migration concerns, performance considerations, known risks, follow-up spikes needed.]
```

---

Show the Final Spec to the user and ask: "Does this spec look correct? Reply 'yes' to save and create the GitHub issue, or tell me what to change."

Wait for the user's confirmation before proceeding.

---

## Phase 5 — Save Spec

Derive the slug from the spec title:
- Lowercase all characters
- Replace spaces and special characters with hyphens
- Strip leading/trailing hyphens
- Maximum 40 characters
- Example: "Add ING bank CSV parser" → `add-ing-bank-csv-parser`

Create the specs directory if it does not exist:

```bash
mkdir -p specs
```

Write the Final Spec (with the slug and today's date filled in) to:
`specs/SPEC-{slug}.md`

Confirm: "Spec saved to `specs/SPEC-{slug}.md`."

---

## Phase 6 — Create GitHub Issue

Run all commands from the project root directory.

**Step 1** — Ensure the `spec` label exists:

```bash
gh label list | grep -q "^spec" || gh label create "spec" --description "Has an associated spec file in specs/" --color "0052CC"
```

**Step 2** — Create the issue:

```bash
gh issue create \
  --title "{spec title}" \
  --label "enhancement" \
  --label "spec" \
  --body "$(cat <<'BODY'
## Problem Statement

{problem statement from spec — full paragraphs}

## User Stories

{user stories list from spec}

## Out of Scope

{out of scope bullets from spec}

---

**Full spec:** [`specs/SPEC-{slug}.md`](./specs/SPEC-{slug}.md)
BODY
)"
```

**Step 3** — Update the spec file to add the issue URL. Edit the `**GitHub Issue:**` line in `specs/SPEC-{slug}.md`:

```
**GitHub Issue:** {issue URL}
```

---

## Done

Report to the user:

```
Architect workflow complete.

  Spec:         specs/SPEC-{slug}.md
  GitHub issue: {issue URL}

Next steps: pick up the issue and start implementing, or run /architect again for another requirement.
```
