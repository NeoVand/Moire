# Candidate handoff preflight

The exact next-kernel module from `b05d227` is archived as inert `kernel-source.txt`. Its own exports produced `kernel-core.wgsl` and `kernel.hlsl`; no shim or mathematical rewrite was applied. Provenance and hashes are in [provenance.json](provenance.json).

The separately handed-off HLSL file at `3b81661` is byte-identical to this generated input, as recorded in [hlsl-handoff.json](hlsl-handoff.json). The same compilation result therefore applies to both handoffs.

All eight real DXC jobs failed: checker/circle, compute/pixel, DXIL/SPIR-V. Each reports undeclared `WORK` at generated HLSL lines 20, 304 and 547. The diagnostic counter writes have no matching declaration in the exported module. The known-invalid compiler control also failed as expected. See the [unchanged-source compiler report](../compile-20260905T213946.470454Z/report.json).

The WGSL core similarly writes `WORK` without declaring it. Existing common adapters provide the documented `PI` and `TAU` constants; introducing a counter dependency changes that host contract. The author was asked to make production exports self-contained or split instrumentation from production code. No GPU ran and the stable shared/native kernel remains unchanged. Numerical and cost gates remain pending; the new ripple entry is outside this checker/circle handoff.
