# Rotating Request Implementation Plan

**Goal:** Build publish-ready Python and TypeScript libraries under `packages/rotating-request/` that switch proxy IP and retry safe requests after HTTP 429, with optional operation-level retries for errors such as YouTube `RequestBlocked`.

## Tasks

1. Add a shared QingGuo channel-rewrite contract and test-first Python rotator/config implementation.
2. Test-first implement Python `RotatingSession(requests.Session)`, 429 handling, `Retry-After`, safe-method limits, and `run()`.
3. Test-first implement matching TypeScript proxy/config behavior.
4. Test-first implement the undici-based `RotatingClient`, 429 handling, resource cleanup, and `run()`.
5. Add independent package metadata, root workspace wiring, and Python/TypeScript/YouTube examples.
6. Run both package test suites, package builds, repository build, and diff checks.

Every production behavior must be preceded by a failing focused test and a verified red-green cycle.
