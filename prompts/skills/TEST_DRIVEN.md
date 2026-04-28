---
name: test-driven-development
description: Drives development with tests. Use when implementing any logic, fixing any bug, or changing any behavior. Use when you need to prove that code works, when a bug report arrives, or when you're about to modify existing functionality.
---

# Test-Driven Development

Write a failing test before writing the code that makes it pass. Tests are proof — "seems right" is not done.

## TDD Cycle

1. **RED** — Write a test that fails. If it passes immediately before implementation, rewrite it — it proves nothing.
2. **GREEN** — Write the minimum code to make it pass. No extra behavior.
3. **REFACTOR** — Clean up while tests stay green. Run tests after every change.

## Prove-It Pattern (Bug Fixes)

1. Write a test reproducing the bug — it MUST fail first.
2. Commit with prefix `test(regression): <behavior that was broken>`
3. Implement the fix.
4. Confirm the test passes.
5. Run the full suite — no regressions.

## Key Rules

- **Test state not interactions.** Assert outcomes, not which internal methods were called. Tests that verify call sequences break on refactor.
- **DAMP over DRY.** Each test reads as a standalone spec. Duplication in tests is acceptable.
- **Real > Fake > Stub > Mock.** Mock only at boundaries where real deps are slow, non-deterministic, or have side effects you can't control.
- **Arrange-Act-Assert.** Set up → perform action → assert outcome.
- **One concept per test.** One behavior = one test case.
- **Name tests as specs.** `it('rejects empty titles')` not `it('test 3')`.
- **Never skip tests to make the suite pass.**
- **No `feat(...)` commit may precede its corresponding `test(...)` commit.**

## Test Sizes

| Size | Constraints | Use for |
|------|------------|---------|
| Small (~80%) | No I/O, no network | Pure logic, data transforms |
| Medium (~15%) | Localhost only | API tests, DB tests, component tests |
| Large (~5%) | External services allowed | E2E, critical user flows |

## Anti-Patterns

| Anti-Pattern | Problem |
|---|---|
| Testing implementation details | Breaks on refactor even if behavior is unchanged |
| Flaky tests (timing, order-dependent) | Erode trust; mask real bugs — fix the flakiness |
| Mocking everything | Tests pass while production breaks |
| Tests pass before implementation | They are not testing the new behavior |
| Skipping tests to make suite pass | Hides failures |
| No test isolation | Tests pass alone but fail together |

## Verification

- [ ] Every new behavior has a corresponding test
- [ ] All tests pass
- [ ] Bug fixes have a reproduction test that failed before the fix
- [ ] No tests skipped or disabled
- [ ] Coverage unchanged or improved
