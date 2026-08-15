# 0009. Adopt Diátaxis for documentation structure

## Status

Accepted

## Context

`docs/` grew explanation-rich but reference-scattered, how-to-descriptive, and tutorial-absent — a
single flat directory gave readers no cue which doc serves which need.
[Diátaxis](https://diataxis.fr) organizes documentation by user need along two axes
(acquisition↔application of skill, action↔cognition) into four types: tutorials, how-to guides,
reference, explanation.

## Decision

Adopt Diátaxis as a physical restructure — `docs/{tutorials,how-to,reference,explanation}/` —
classifying each doc by its dominant purpose and moving whole files (no splitting a doc across
quadrants). `docs/README.md` is the canonical map.

**Exception**: ADRs stay at `docs/adr/` rather than under `reference/` — an ADR is a recognized
genre with its own convention (numbered, immutable, superseded-not-rewritten) and a well-known
location; burying them a level deeper costs discoverability for no classification gain.

## Consequences

- Each doc has one home chosen by reader need, not by author convenience.
- The quadrant sets the voice: tutorial second-person, how-to imperative, reference/explanation
  descriptive.
- The moves changed every doc's relative-link depth — repo files are `../../…` from a quadrant,
  not `../…`.
- Heading anchors are inbound link targets, so renames require a repo-wide grep: links to docs
  also live in `CLAUDE.md`, `BACKLOG.md`, and source comments, not just other docs.
- The `diataxis-docs` skill (`.claude/skills/diataxis-docs/SKILL.md`) holds the writing conventions
  per quadrant, so they aren't re-derived per doc.
- Classification friction is real for borderline docs — getting-started is borderline
  tutorial/how-to, and the deploy guide keeps a reference-flavored CI section — dominant purpose
  wins over a clean split.
