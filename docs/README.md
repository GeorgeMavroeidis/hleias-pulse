# docs/

Two people, two machines, two sets of AI sessions that cannot see each other.
Git is the only thing both of us actually share, so agreement lives in files here —
not in a chat window one of us can read and the other cannot.

## The three files

| File | Who writes | What it is |
|---|---|---|
| `braindump/margaris.md` | Margaris only | Raw ideas, unfiltered, unordered |
| `braindump/mavroeidis.md` | Mavroeidis only | Same, his side |
| `ARCHITECTURE.md` | both, by PR | What we have actually agreed |

Single-author braindump files never conflict. That is the whole point of splitting them.

## The flow

```
you talk to your session  ->  it appends to YOUR braindump file
                          ->  what survives is proposed to ARCHITECTURE.md as a PR
                          ->  the other person approves, amends, or pushes back
                          ->  implementation sessions read ARCHITECTURE.md and build
```

Nothing reaches `ARCHITECTURE.md` without both of us seeing it. Nothing gets built
from a braindump entry — braindump is thinking out loud, architecture is a commitment.

## Why bother

Three reasons, in order of how much they matter.

1. **Neither of us gets surprised.** A decision one person made alone at 1am is how
   two people ship one merge conflict.
2. **Sessions stop re-deriving.** An implementation session handed a written contract
   does not go exploring the codebase to guess one. That exploration is the single
   largest waste of tokens in this project.
3. **The reasoning survives.** Six weeks from now nobody remembers why writes require
   an account. The decision log does.

## Rules

- Braindump entries may be in Greek or English. `ARCHITECTURE.md` is English, to match
  `CLAUDE.md` and `ROADMAP.md`.
- Date every entry. Absolute dates, never "last week".
- Never edit the other person's braindump file. Reply in your own, or in the PR.
- An entry that turns out to be wrong gets struck through, not deleted. The wrong turns
  are worth as much as the right ones.
