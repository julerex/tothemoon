# AGENTS

Instructions for LLM agents working in this repository.

## Git: commit and push when finished

**Always commit and push when you finish a unit of work** — after implementing a feature, fix, or other requested change that leaves a meaningful git diff. Do not leave completed work uncommitted unless the user explicitly says not to commit, or the change is only exploratory/scratch.

When committing and pushing:

1. Follow the usual safety rules: never update git config; never force-push to `main`/`master`; never skip hooks; never push secrets.
2. Use a clear commit message (why the change exists, complete sentences).
3. Prefer a single logical commit per finished task; push to the current branch’s remote (`origin HEAD` is fine when tracking is set).
4. If the working tree is clean (nothing to commit), say so briefly and do not create an empty commit.
5. After push, mention the commit hash (and that it was pushed) in the final reply.

## Project notes

- Interactive Three.js mission theater: Starbase → LEO → TLI → lunar landing.
- Trajectory is baked at build time (`npm run precompute` / `npm run build`).
- Scene unit = 1 km. Prefer small, focused diffs over drive-by refactors.
