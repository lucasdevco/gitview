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
