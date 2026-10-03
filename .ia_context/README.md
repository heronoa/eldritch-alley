# AI-assisted work

This folder holds the planning artifacts for work done with AI assistance on this project. They are versioned on purpose, so the reasoning behind the code is public along with the code.

What goes here:

- `descriptions/`: the merge request description and the pre-review for each branch. Both are versioned, one pair per branch, named `<branch>.description.md` and `<branch>.prereview.md`.
- Plans and their indexes, once the planning workflow produces them.

Rules:

- English only, like the rest of the repository.
- Durable content only. Temporary scratch notes that will not become an artifact stay out of the repository.

Architecture decisions belong in [`docs/adr/`](../docs/adr/), not here. The order of precedence is in [`CLAUDE.md`](../CLAUDE.md): accepted ADRs first, then `CLAUDE.md`, then plans.
