# Changelog

## 0.4.2 — 2026-10-31

- Pass the DSH 0.2 installation preflight. Widen the peer ranges to accept the 0.2.0-rc line and replace the nonexistent `@deepseek-ai/dsh-agent-presets` devDependency with `@deepseek-ai/dsh-agent-preset-registry`. Verified against DSH 0.2.1-rc.2: `evaluatePluginCompatibility` reports no issue, so `dsh plugin add` installs instead of rejecting.
- Apply the native delegation plugin asynchronously. DSH 0.2's `dsh-tool-subagent` registers its tools after an await, so `apply` must await it or the adapter publishes nothing.
- Mount session persistence in the 0.2 shape. 0.2 ships the JSONL store as a named `{ name, Config, apply }` row with an async `apply` and no default export; mount it through `ctx.plugin` and await it so the write effects exist before the first session opens.
- Race `proc.done` in `exec_command`/`write_stdin` instead of polling a `status` that 0.2 only mutates inside the done callback, and settle `exitCode` via `result()` before reading it.
- Accept npm >=11's object-shaped `npm pack --dry-run --json` output.
- Skip the live scanRoot check loudly when presets have not been published yet, instead of failing with ENOENT on a fresh clone.

Validation on DSH 0.2.1-rc.2: the full `npm run test` chain passes, including the real shell/subprocess/job integration suite against the 0.2 `execute()` contract. `agent-types`, `typed-subagents` and `client` smokes pass. The `typed-subagent-presets` smoke fixture is still written for DSH 0.1: 0.2's preset registry dropped the `roots`/`includeShippedRoot`/`includeUserRoot` options and no longer scans a caller-supplied directory, so that fixture needs a rewrite against the 0.2 discovery model before it can run.

## 0.4.1 — 2026-10-16

- Support DSH 0.2's asynchronous shell `execute()` while retaining DSH 0.1.5's `start()` path. Keep cancellation active during preparation and foreground execution, and disable shell expiry for commands that can continue as background jobs.
- Adapt background job ownership and observed output to DSH 0.2, preserving independent `write_stdin` and `job_output` reads. Report asynchronous provider failures and clean up cancelled or failed process publication.
- Add real shell/subprocess/job integration tests against both supported execution contracts, plus async preparation and cancellation regressions.

## 0.4.0 — 2026-10-16

- Add Notes handoff to new Codex tool-mode sessions: atomic revisions, idempotent writes, paged reads, safe window resets, fork isolation and restart recovery.
- Reuse DSH's token meter, session log, compaction lifecycle and native summary fallback. Budget estimates follow the latest recorded route.
- Add a read-only context panel and window timeline, updated through native session projections.
- Preserve tool-result images and developer messages on both OpenAI routes; preserve compatible Responses encrypted reasoning and phase with content and route checks.
- Allow model-specific modalities, reasoning efforts and capacity; propagate in-stream retry information.
- Correct tool guidance, fresh-versus-fork subagent context descriptions and scoped shell restrictions. Include Notes modules in preset publication.

Validation: the complete isolated suite passes on DSH 0.1.5-rc.1. Notes and protocol paths also pass against the local 0.2.0-rc.2 runtime. Full-plugin DSH 0.2 compatibility is not declared.
