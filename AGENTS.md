# Project Development Guidelines

## Design from the User's Perspective

When designing module functionality, function names, and public APIs, prioritize the user's perspective:

- Keep module responsibilities clear and align functional boundaries with users' expectations.
- Use function names that communicate intent without requiring callers to read the implementation.
- Keep public APIs simple, intuitive, and consistent. Avoid unnecessary parameters, layers, and concepts.
- Make common operations easy to discover and use, with sensible default behavior.
- Design modules and APIs for easy testing: keep behavior deterministic, dependencies explicit, and components independently verifiable.
- Provide clear error messages that explain the problem and how to resolve it.
- Before adding a public interface, consider whether an existing interface can be reused or simplified.

The goal of interface design is to reduce the cost of understanding, usage, testing, and communication—not merely to make the internal implementation convenient.

## Required Frontend Checks

After changing any code or configuration under `frontend/`, run all of the following commands before handing off or committing the change:

```bash
cd frontend
npm run format
npm run lint
npm run check
npm test
npm run build
```

All commands must pass. Run `npm run format` first and include any formatting or import-order changes it produces. Do not skip these checks because a change appears small.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
