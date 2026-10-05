# Public repackaging of delivered version 1.12.1

The original delivered source archive has SHA256 `b72a72cea5a147d250313f5d75c0a2f78fc65a334c1fa0c658a19ced68ce211e`. Historical checkpoints, private captures, conversations, coordination and manuscript material are excluded from this minimal public package.

The package retains 42 original archive files byte-for-byte: runtime source, build script, package metadata, preservation helper, executable HTML, acceptance fixture, Node tests and two optional browser harnesses. `reproducibility.json` records their exact paths and hashes. The root and version-specific 1.12.1 HTML pages are additional exact copies of the executable. The old `v1.11.2/index.html` remains an exact frozen copy for the independently reviewed paper supplement.

`tests/manuscript_reference_evidence.json` retains its complete, unchanged `karate34` golden graph object. Unrelated manuscript/palette path metadata was omitted without changing the mathematical fixture or tests.

New publication wrappers provide README, citation and author/contact metadata, rights notice and focused validation. The previous 1.11.2 publication evidence is preserved under `validation/historical-1.11.2/` and clearly separated from current evidence. No runtime mathematics, UI or tested HTML bytes were modified. The original `private: true` npm setting remains; it prevents accidental npm publishing, not GitHub visibility.

The new public source ZIP has a distinct SHA256 in the release checksums. It is minimal repackaging, not a byte-identical copy of the original large historical ZIP. Building its current source reproduces `1481cfc02eef2db0797068707d1286fde649c14868da4eb83148f421f3a57ff0`. Version 1.12.1 retains the known later Cancel-reading introduction stall; no fix or broader independent review is claimed.
