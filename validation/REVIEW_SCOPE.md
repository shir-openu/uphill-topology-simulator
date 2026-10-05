# Validation scope — frozen version 1.11.2

The reviewed executable is 470984 bytes, SHA256 `5c715e7fad50fbb491e75c2ea01ec39b604f5eec367d6a2efcb8de93e6d43282`.

An isolated independent review completed on 2026-10-03 recorded:

- 83 passing Node tests.
- An independently written raw-edge oracle over eight graphs, 48 models and 666 subset analyses.
- 36 logical targeted browser checks across worker and fallback engines.
- 13 visually inspected screenshots.
- Byte-identical source rebuild and verification of 3947 original source-package manifest entries.

The 36 logical browser checks combine 30 retained passing groups and six complete recovery groups. The original six group failures and earlier setup/observer errors remained in the review history. There were 44 group executions in that history (38 passing, six failing); those execution totals are not the logical-check total. This is not described as one uninterrupted 36/36 run.

Checks included degree-level drawing, neighbourhood selections, editing, export/import, restored state and mathematical invariants. No blocking application defect was found within that exercised scope.

## Limits

The independent browser review used Windows Chrome 154.0.8037.95. Other browsers, physical touch interaction and screen readers were not validated. The entire introductory tour was not exercised through all cues. Dense drawings and narrow-view labels can require zoom; long set keys can be abbreviated or wrap. The symbolic infinite-gallery examples were outside this review. Open-set enumeration is bounded and can return an incomplete list; the application reports its status.

Finite test coverage does not prove general mathematical claims or manuscript theorems. The application retains its original v12 mathematical-provenance label. This publication changes neither that label nor the reviewed runtime.

## Public packaging

The public repository contains reproducible source/tests and a focused, privacy-safe summary of the independent review. The review's original full local reports, personal paths and screenshot archive are not republished. New publication checks are reported separately in `reproducibility.json`; they do not replace or inflate the independent-review counts.
