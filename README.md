# Uphill Topology Explorer — Supplement S1

**Version 1.11.2** is the frozen, independently reviewed finite simulator accompanying the manuscript **Uphill graph topologies and degree-constrained realizations of posets**.

**Author:** Shir Sivroni  
**Affiliation:** Department of Mathematics and Computer Science, The Open University of Israel  
**Contact:** shirsivroni@gmail.com

[Open the version-specific simulator](https://shir-openu.github.io/uphill-topology-simulator/v1.11.2/) · [Download release v1.11.2](https://github.com/shir-openu/uphill-topology-simulator/releases/tag/v1.11.2) · [Validation scope](validation/REVIEW_SCOPE.md)

The simulator is a separate supplementary illustration. Its finite computations and drawings do not prove the manuscript's theorems. This repository does not contain the manuscript or a journal submission.

## Run

Open the link above, or download `uphill-topology-explorer-v1.11.2.html` from the release and open it in a current desktop browser. The downloaded HTML works offline and includes its styles, scripts and computation worker; no server is required. If Blob workers are unavailable, computation has a bounded main-thread fallback.

Select vertices in the main graph to compare their smallest open neighbourhoods. The topology selector changes the allowed-step rule. The original graph is undirected; any arrowheads are a derived step overlay. In the full workbench, **Edit this graph & drawing → Layout → Degree levels** arranges the drawing by degree without changing the graph or topology.

The version-specific page, root page and `dist/index.html` are identical copies of the exact reviewed HTML:

```text
SHA256  5c715e7fad50fbb491e75c2ea01ec39b604f5eec367d6a2efcb8de93e6d43282
Bytes   470984
```

This publication preserves version 1.11.2 exactly. Later development versions are not included or represented as having this review.

## Reproduce

Node.js is the only build/Node-test requirement; there are no npm dependencies. Node v24.12.0 was used for the fresh publication check.

```sh
node --test tests/*.test.mjs
node build.mjs
```

The 83 Node tests pass, and rebuilding produces the HTML hash above. Preserve the original source line endings: `.gitattributes` disables Git line-ending conversion because changing them can change the byte-level build output.

Optional browser checks use Python, Chrome/Chromium and the dependency in `requirements-browser.txt`:

```sh
python -m pip install -r requirements-browser.txt
python tests/e2e_acceptance.py
python tests/e2e_acceptance.py --force-fallback
python tests/e2e_regressions.py
```

Set `UPHILL_CHROME` to the browser executable if automatic discovery cannot find it. These scripts create local reports and screenshots; generated reports can contain local paths and are not part of this public package.

## Review and provenance

The independent review of this exact artifact covered 83 Node tests, an independent oracle over 48 models and 666 subset analyses, and 36 logical targeted browser checks. The browser evidence combines 30 retained passing groups and six complete recovery groups, with original observer/setup failures retained in the review history. It was **not one uninterrupted 36/36 run**. See [review scope and limitations](validation/REVIEW_SCOPE.md) and the fresh [publication build evidence](validation/reproducibility.json).

The minimal public source ZIP is repackaged from the reviewed source archive; it has a different ZIP hash because private metadata and historical artifacts are excluded. Runtime source, build inputs, executable HTML and test logic are preserved. The only test-fixture adjustment removes private manuscript/palette metadata; its mathematical graph data is unchanged. [Repackaging details](validation/REPACKAGING.md) distinguish original bytes from new publication wrappers.

The exported application's historical manuscript-version marker remains v12. It is preserved provenance of the tested software and is not a claim that the accompanying manuscript is still v12.

## Citation and rights

Use the software version when citing:

> Sivroni, Shir. Uphill Topology Explorer, version 1.11.2. Supplement S1 to “Uphill graph topologies and degree-constrained realizations of posets.” 2026.

Machine-readable citation metadata is in [CITATION.cff](CITATION.cff). No DOI is assigned by this repository.

No software license was documented in the reviewed package, and this publication introduces no new license grant. **All rights reserved; licensing awaits the author's choice.** See [RIGHTS.md](RIGHTS.md).
