# Reply 4 follow-up: compact integration and compiler contracts

Start with [Reply 5](../REPLY-5.md). This package answers the three requests in `REPLY-4.md` and adds reproducible corrections to its error/pruning conclusions. All work stays in the review folder; compiler and app files are read-only inputs.

| Work | Read first | What is established |
| --- | --- | --- |
| Compact reciprocal-depth transform | [Module, bounds, memory and timing](row-compact-notes.md) | 10,760-byte numeric table; 610 mode and ten complete circles checks. CPU setup and restricted phase family remain explicit. |
| One-dimensional mask inversion | [Derivation and independent reference](mask-inversion.md) | Correct weighted complex inversion and bounded tails where supported. No demonstrated speed win. |
| Improved nested coverage | [Endpoint regularization](coverage-outer.md) | Half the inner calls with errors below 5.3e−9 on the three adapter terms. Independent high-precision reference and refinement checks. |
| Pilot size and selection | [Cost versus heldout quality](pilot-README.md) | 840 fits; small pilots can pay locally, training-loss selection often fails. CPU/GPU and fit reuse claims are separated. |
| Compiler error/pruning contracts | [Counterexamples and sensitivity weights](compiler-contracts.md) | Exact-W false pruning, absolute/relative error mismatch, and actual Bessel access beyond order 42. |

Every note gives reproduction commands, numerical scope, and recorded outputs. Results are timestamped and explicit existing output files are refused. The Bessel/sensitivity probes instrument temporary source copies only. The mask reference generator requires mpmath; checked-in reference data supports normal Node runs without Python regeneration. None of the row, coverage, or pilot timings is a full-frame GPU result.
