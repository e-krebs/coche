## What

## Why

## Notable decisions

## Verification

## Agent review

---

- [ ] Conventional commit **with scope** — `feat(scope):` / `fix(scope):` / `chore(scope):`, plus
      `[TICKET-123]` when there is one
- [ ] **One concern.** A change that mixes a refactor, a feature and a fix gets split — logical
      cohesion matters more than diff size
- [ ] **Docs updated** for every code area this touches, per the mapping table in
      [CLAUDE.md](../CLAUDE.md). A doc that still reads true counts, but check it
- [ ] UI change **verified in a browser**, not only in tests — network and console for behavioral
      changes, a screenshot for purely visual ones
