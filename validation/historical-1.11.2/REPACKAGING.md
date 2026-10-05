# Public repackaging of reviewed version 1.11.2

The original reviewed source archive has SHA256 `25c82791ece0ba17de830c63564bf9f5fbf866ad76a5a1a33653d8c2e4b4a3db`. It contains 3947 manifested files plus its manifest. Its historical screenshots and checkpoints are intentionally not redistributed here.

The minimal public package retains 40 original archive files byte-for-byte: runtime source, build script, package metadata, preservation helper, executable HTML, acceptance fixture, Node tests and two optional browser harnesses. `reproducibility.json` records their paths and hashes. The root and version-specific HTML files are additional exact copies of the reviewed executable.

`tests/manuscript_reference_evidence.json` retains the complete, unchanged `karate34` golden graph object required by the tests. Unrelated metadata about local manuscript and palette reference files was omitted. This changes neither application code nor the mathematical fixture.

New publication files provide the README, citation and author/contact metadata, rights notice, line-ending preservation, optional browser dependency pin and focused validation evidence. No runtime mathematics, UI or tested HTML bytes were modified. The original package's `private: true` npm setting is preserved; it prevents accidental npm publishing and does not control GitHub repository visibility.

The public source ZIP has its own SHA256 in the release checksums. It is a minimal repackaging, not a byte-identical copy of the original historical ZIP. Rebuilding its source must reproduce the original HTML SHA256 `5c715e7fad50fbb491e75c2ea01ec39b604f5eec367d6a2efcb8de93e6d43282`.
