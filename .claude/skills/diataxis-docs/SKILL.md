---
name: diataxis-docs
description: Writing conventions for docs/ (Diátaxis). Use when creating, editing, moving, or renaming anything under docs/ — picking the right quadrant, matching its voice, and keeping links/anchors unbroken.
---

# Diátaxis docs conventions

`docs/` follows [Diátaxis](https://diataxis.fr/): four user needs, four quadrants, one home per doc.
This skill is the single authority for how these docs are written. The map of what exists is
[docs/README.md](../../../docs/README.md); when to update which doc after a code change is the
mapping table in the repo's [CLAUDE.md](../../../CLAUDE.md).

## Compass — where does content go?

Two questions:

1. Does it inform **action** (doing) or **cognition** (knowing)?
2. Does it serve **acquiring** skill (studying) or **applying** skill (working)?

| | Acquisition (study) | Application (work) |
|---|---|---|
| **Action** | `tutorials/` — a lesson | `how-to/` — a recipe |
| **Cognition** | `explanation/` — understanding | `reference/` — facts |

Classify by **dominant purpose** and move/keep **whole files** — never split one doc across
quadrants, never atomize a table out of its doc. Borderline is normal (a getting-started lesson
looks like a how-to; a deploy guide may keep a reference-flavored CI section): pick the dominant
need and stop.

**Exception:** ADRs live at `docs/adr/`, not under `reference/`. They're a recognized genre with
their own convention and location (see `docs/adr/0009-adopt-diataxis.md`).

## Voice per quadrant

- **Tutorial** — second person, learning-oriented. The reader follows and succeeds; you promise a
  destination and get them there. Concrete steps, visible results, no detours into options or
  theory (link out instead).
- **How-to** — imperative, goal-oriented. "Deploy the SPA", "Set the secrets". Assume competence;
  give steps for a task, not education. No teaching, no rationale beyond what a step needs.
- **Reference** — austere, information-oriented. Describe what IS, in present tense. Catalogs and
  tables welcome. No instructions, no persuasion.
- **Explanation** — discursive, understanding-oriented. The "why": design decisions, trade-offs,
  context. May admit alternatives and limits — this is the only quadrant where that's at home.
- **ADR** — a decision record, not narration: **Status / Context / Decision / Consequences**.
  "We chose X over Y" belongs in an ADR, never in reference docs. To reverse a decision, add a new
  superseding ADR and mark the old one (see `0008` superseding `0007`); don't rewrite history.

## Rules for all docs

- **Present tense, describe what IS.** Not "the plan called for X", "we decided", "was
  implemented", "critical finding", "confirmed". State the behavior or decision as a current fact.
- **Self-standing — no process references.** No plan section numbers (`§`), PR numbers, "this
  change", "originally planned", "progress", or dated status notes. A doc is a reference, not a
  changelog. A reader who never saw the plan, the PRs, or any chat must understand the system from
  the docs alone.
- **No volatile counts.** Don't pin exact test counts or other fast-drifting numbers — describe
  what is covered, not how many. Pinned counts drift and silently lie.
- **Cross-link, don't duplicate.** One canonical explanation, linked from elsewhere (e.g. the
  `addRow`-collision story lives in `explanation/auth-and-sync.md`; `reference/data-model.md`
  links it).
- **`schema.ts` is the source of truth for stored data.** `reference/data-model.md` stays thin and
  links to it rather than re-listing field types.
- **Keep the honest caveats.** The EU-residency caveats and the `Limitations` sections are
  load-bearing content — tighten wording, never quietly drop a caveat.
- **Never scaffold empty sections.** A heading exists because it has content now, not as a
  placeholder.
- **Wrap prose at ~100 columns**, matching the existing docs.
- Relative links: from a quadrant dir, repo files are `../../src/...`, sibling quadrants
  `../explanation/…`, ADRs `../adr/…`.

## Renames and moves

If you rename a heading or move/rename a doc, grep the **whole repo** for links to the old slug or
path — not just `docs/`. Inbound links also live in `CLAUDE.md` (the mapping table), `BACKLOG.md`,
`README.md`, and source comments (e.g. `src/client/store/__tests__/merge.test.ts`). Fix every hit;
anchor fragments (`#slug`) break silently, so check those too.
