# Testing an immutable kernel candidate

The comparison runners accept both `--kernel-ref=<commit>` and `--kernel-path=<repository-relative-module.js>`. For example:

```sh
node tests/compare/homography.mjs --kernel-ref=6eddded0ef1f04479a9b0560ddda881307e4eece --kernel-path=demo/ours-kernel-next.wgsl.js --out=/tmp/moire-candidate-homography.json
```

The same options work with `materials.mjs`, `performance.mjs`, and `run.mjs`. Coordinate exclusive GPU ownership before running those browser tests. CPU validation of the selector itself is:

```sh
node --test tests/compare/candidate-source.test.mjs
```

The selector resolves the requested Git commit once and copies the exact blob bytes into `<report-path>.kernel/source.mjs`. Its metadata records the requested ref, full commit, Git blob ID, repository path, SHA-256, selected export, and adapter hash. The source and adapter snapshots are created exclusively and read-only. Choose a fresh report path for every run; existing snapshots are never overwritten.

A Vite pre-load plugin substitutes only the resolved absolute `demo/ours-kernel.wgsl.js` module inside that test server. It serves the captured bytes from memory, re-exports the candidate's other exports, and aliases `OURS_KERNEL_CORE` to `OURS_KERNEL` when the core export exists. Otherwise it keeps `OURS_KERNEL`. The production module and the candidate's working-tree file are never written. There is no injected `WORK` counter or other WGSL repair. A candidate missing its own declarations must fail compilation.

Candidates must be self-contained JavaScript ESM modules; module imports, dynamic imports, re-exports from dependencies, `import.meta`, and symlink paths are rejected. This ensures that a committed snapshot does not silently borrow mutable module dependencies. Shader arithmetic and execution are unchanged. Selecting the checker/circle core does not validate the candidate's ripple extension.

Each report's `kernelSource.sha256` identifies the selected raw Git module, while `sourceHashes` and `sourceHashesAfter` identify the live harness files, including the unchanged production file and selector. Candidate runs check that their archive and production file remain unchanged. They also retain the ordinary before/after harness checks. A passing source check only establishes attribution; the numerical, range, reference, and timing gates must still pass.

With neither option the runners use their existing working-tree module and `OURS_KERNEL` export, with no override or snapshot. Merely adding the selector is CPU-tested infrastructure, not evidence that a candidate passed a GPU gate.
