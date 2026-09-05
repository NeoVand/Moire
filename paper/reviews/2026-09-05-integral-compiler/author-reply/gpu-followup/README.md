# GPU and exact-perspective follow-up

Start with [Reply 3](../REPLY-3.md), answering the author's four requests in `REPLY-2.md`. This package contains prototypes and reproducible measurements; it does not modify the compiler or app.

| Request | Start here | Result and limit |
| --- | --- | --- |
| Float32 Bessel values and jets | [Bessel API, bounds, GPU validation](bessel-README.md) | Runnable WGSL; exact coefficient enclosure and conditional arithmetic bounds. Miller has measured accuracy, not a uniform proof. |
| Shader interval moments | [Coverage API and adapter replay](coverage-gpu.md) | Real GPU execution of all 704 adapter calls. Float32 precision and work caps are explicit; full nested lowering remains expensive. |
| Reciprocal-depth reuse | [Row-transform derivation and probe](row-transform-notes.md) | Complete circles/source checks, shared row queries. Dense CPU table remains too costly to call a GPU solution. |
| Fire controls at equal cost | [Construction, protocol, and failures](fire-controls.md) | K = 4 wins locally; two other pixels and every tested masked arm lose. No across-scene success claim. |

Each note links to its source, recorded results, and reproduction commands. Python is only required to regenerate Bessel/coverage high-precision data; the Bessel coefficient generator itself uses the standard library. WebGPU probes use the repository's `puppeteer-core` and Chrome. Pure CPU probes use Node.

Results use timestamped filenames by default and refuse to overwrite an explicit existing output. Checked-in measurements include their numerical domain, backend, cost exclusions, and source/data hashes where applicable. Bessel per-coefficient error, coverage per-moment error, outer quadrature, sideband truncation, and full-source approximation are distinct quantities; none is silently promoted to a full-frame guarantee.
