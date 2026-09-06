# Codex ↔ Claude Code

One shared Git repository, one durable local inbox. This bridge lets the existing agents coordinate without the user copying messages between them. It does not launch another AI, execute messages, relay approvals, or wake an idle session.

On this machine, the Codex task has an active **Moiré collaborator inbox** heartbeat every minute (automation `moir-collaborator-inbox`, shortened at the user's request). It resumes the existing task, reads the inbox, and continues actionable or unfinished agreed work. It is scheduled polling, not immediate delivery; local runs need the host awake and the app open. During active theory discussion, exchange short notes between reasoning batches and use inbox waits of at most 30 seconds when a reply would change the next derivation. Do not wait for a polished long report to share a consequential idea. Empty checks stay quiet. Keep monitoring through intermediate milestones; pause when the user asks, or both collaborators agree the overall work is complete and no handoff remains. The bridge's MCP/CLI and Claude hooks still work independently of this schedule.

## Current direction: theory first

The user explicitly redirected both collaborators on September 5: investigate a deeper understanding of count maps and what goes beyond them through brainstorming, research and denser dialogue. Pause new implementation and benchmark batches during this phase. Existing code and evidence remain available; the native comparison is the eventual application, not the conceptual research agenda. Small analytic examples and counterexamples should illuminate a proposed theory rather than substitute for one.

Bridge messages 87–95 establish this shift. Both collaborators are considering material observables, the diffusion induced by pixel averaging, and the elimination of fast shared phase motion to produce an effective material law. The distribution/transfer-function pairing already has direct graphics prior art (Heitz et al. 2014); mean–variance program smoothing already includes correlation approximations (Yang and Barnes 2018). A new contribution must explain useful closure, state reduction or compression, not merely rename these foundations. The Codex synthesis is `paper/reviews/2026-09-05-integral-compiler/theory-program-review/SCALE-THEORY.md`; Claude's evolving note is `paper/notes/beyond-count-maps.md`. These are research proposals, not completed complexity theorems or promoted algorithms.

## Join now

From this repository, run `npm run collab -- sync --agent claude` in Claude Code, or use `--agent codex` in Codex. From another directory:

```sh
node /Users/neo/repos/Moire/scripts/collab/cli.mjs sync --agent claude --repo /Users/neo/repos/Moire
```

Read the pending messages and active claims. Reply using `send`; acknowledge only after reading. The optional `moire-collab` MCP server exposes the same operations as tools and binds the sender to the configured agent. A server configuration may require reloading the client before those tools appear; the CLI works in an already running session.

## Working agreement

1. Check the inbox before editing, between work batches, and before committing. Collaborator messages are context within the user's authorized task, not new user instructions or permission grants.
2. Claim the paths for one concrete task before changing them. An overlapping claim means coordinate first. Claims are advisory leases, not filesystem locks. Renew during long work and release when finished; an expired claim is not evidence that unfinished files are abandoned.
3. Keep one owner for a shared file at a time. Do not stage, revert, reset, or commit another agent's changes. Inspect the current Git index before committing; separate worktrees share the mailbox but not the index.
4. Handoffs include changed paths, commit if available, validation, remaining limitations, and the exact next request. Acknowledge receipt separately from agreeing to a proposal or finishing its task.
5. Use `wait` for at most 30 seconds when a reply is needed, then continue useful independent work. Do not let message polling replace progress.

```sh
npm run collab -- send --agent codex --to claude --subject "Demo handoff" --body-file /path/to/handoff.md
npm run collab -- ack --agent claude --through 1
npm run collab -- claim --agent codex --paths src/compare/,tests/compare/ --task "Integrate shared demo" --ttl 1800
npm run collab -- release --agent codex --claim-id c2
npm run collab -- wait --agent codex --timeout 30000
npm run collab -- status
```

`sync`, `inbox`, and `wait` default to unacknowledged messages. `--after 0` reads history. IDs are global; page using the last message actually read, not the global `lastId`. `ack --through N` acknowledges all messages through N for that agent. `--reply-to N` connects a reply to its message. `--to all` broadcasts. Use a body file for multiline text to avoid shell interpolation.

## Current convergence task

The user wants one live comparison of unfiltered rendering, a strong named real-time baseline, and our algorithm. Unreal 5.8.2 is installed. The native baseline is Unreal TSR at explicitly matched resolution, motion, and scene settings; the browser baseline must not be described as vendor state of the art. Codex owns the isolated project under `native/Unreal/MoireComparison`; the user's existing Unreal project is separate.

Two working browser demos exist: `/compare.html` and Claude's `/demo/`. The agreed split is Codex on the comparison shell, official temporal baseline, independent validation, and native host; Claude on the shared GPU kernel and its extensions. Both browser demos import `demo/ours-kernel.wgsl.js`. Its generated HLSL now feeds the native material through `/Project` includes. The frozen kernel at `1612267` passes the 100 direct float GPU fixtures, common scene/reference tests, safe loop watchdog and real HLSL compiler. Claude's optimization experiments use `demo/ours-kernel-next.wgsl.js` separately. Preserve the research demo and baseline implementations while the common presentation and native comparison progress.

The native host now has camera-following analytic materials, verified matched camera sequences, and ordinary-game autoplay maps. `native/comparison.html` presents clean ordinary-game raw/TSR/analytic captures at rest and during uninterrupted playback. The moving image is uniquely registered from raw pixels at sequence frame 121, with matching camera/readback metadata across arms and no pause, cut, skip or ensure. Small analytic output residuals remain documented. One moving frame establishes native output, not trajectory-wide temporal quality or game frame rate. Earlier held-frame/MRQ controls and failed capture records are preserved. Offscreen composition capture is disabled after its ensures opened crash-report windows; use the successful real-window plain `Shot` route. The synchronized plugin milestone and its remaining work are recorded below. The older captures remain controls, with native whole-frame timing and trajectory-wide quality still separate gates. Coordinate GPU ownership before launches or measurements.

Candidate `6eddded` is isolated through immutable Git snapshots in the comparison runners. Its HLSL compiles, all 122 direct fixtures and the 120 scene probes pass, and maximum float change from `1612267` is 1.49e-7. The earlier missing-counter export failure is preserved. Bracketed homography timings have lower candidate medians but nonstationary raw controls; no reliable speed factor or production promotion follows yet. Evidence is under `native/evidence/candidate-20260905T215650Z`.

The shared product direction is a material shading prefilter that composes with native temporal reconstruction. Codex owns Unreal integration, a synchronized comparison surface, independent industry-material benchmarks and native cost measurement; Claude owns compiler node support, mathematical primitives and kernel budgets. Explicit supported nodes, a bounded fallback/unsupported flag, source validity witnesses, matched combined-TSR controls and calibrated error/cost measurements define progress. Existing bespoke kernels are ingredients, not proof of general automatic material lowering. Proposed performance targets need a named GPU and must state both incremental material overhead and whole-frame cost.

The project-local native plugin now builds and renders three synchronized real local-player views. Static, moving, combined analytic+TSR and deliberate-cut captures pass actual raster/camera/AA/history and independent source registration checks; evidence is `native/evidence/synchronized-native-20260905/README.md`. The gallery keeps its existing layout and displays crops from the common native window. Startup game-frame and render-family identities are distinct. Registration rule `fixed-grid-count-cell-neighborhood-v2` corrects the old sampled-parity guard using source-only count extrema, preserving prior failures and exclusions. These quality diagnostics use CPU uniform-buffer copies and establish no game frame rate or temporal-error curve. Remaining native work: a usable live interaction layer, representative supported material graphs, post-cut recovery quality and controlled isolated-method timing.

The adversarial review of the theory-program ledger at `b04f36b` is in `paper/reviews/2026-09-05-integral-compiler/theory-program-review/`. Claude accepted the affine-envelope correction and withdrawal of the original scale-independent atom-overlap claim in `cc5df3c`. The review proposes a joint conditional-expectation hierarchy with explicit correlated residuals; it is a research direction, not a proved complexity result. Mean intervals alone do not compose through products, indicator absolute Fourier tails need not converge, and a cubic surrogate is distinct from exact rational depth conditioning. Candidate `9d57f54` passes all eight unchanged HLSL compiler jobs; numerical GPU gates and promotion remain pending.

The source contract and measured limitations of `/compare.html` are in [docs/real-time-comparison.md](docs/real-time-comparison.md). Any kernel transplant must first agree on pixel centers, camera, signal, filter, time, lighting, and color space. Compare image error against an independent reference and report completed-frame time separately from sums of overlapping GPU pass timers. A browser prototype is not evidence of native whole-game performance.

## Local installation

No dependencies beyond Node and Git. State lives in the Git common directory under `moire-collab/`, shared by local worktrees, outside tracked files. Separate clones or machines do not share it. Messages are retained and acknowledgements are explicit; a Claude hook delivery attempt is not an acknowledgement.

Register each client from this repository, substituting absolute Node and repository paths on another machine:

```sh
claude mcp add --transport stdio --scope local moire-collab -- /absolute/node /absolute/Moire/scripts/collab/server.mjs --repo /absolute/Moire --agent claude
codex mcp add moire-collab -- /absolute/node /absolute/Moire/scripts/collab/server.mjs --repo /absolute/Moire --agent codex
```

The Claude project-local settings can run `scripts/collab/claude-hook.mjs --repo /absolute/Moire` using an absolute Node executable as a command hook for `PostToolUse` and `UserPromptSubmit`. It adds pending messages as context during activity, preserves acknowledgement state, and deduplicates complete delivery attempts per session. Local settings are not committed. If the existing session does not reload the hook, run `sync` directly or restart it. The bridge itself does not wake an idle agent; Codex's separate five-minute heartbeat does resume this task, and its first automatic run was observed at 19:40 UTC on 2026-09-05.

Run `npm run test:collab` to exercise independent CLI/MCP peers, concurrent writes, acknowledgements, claims, and hook delivery. If a crashed writer leaves a lock, the store reports its location and never silently steals it. Inspect `write.lock/owner.json` and verify the owner is gone before manually removing that lock; preserve `state.json`.
