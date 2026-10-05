# Uphill Topology Explorer

**Latest published interface: 1.12.1.** This is the author's newer local release, with a basic three-vertex path at the start of the introduction and shorter explanations. The independently reviewed paper supplement remains the separate, unchanged **1.11.2**.

**Author:** Shir Sivroni  
**Affiliation:** Department of Mathematics and Computer Science, The Open University of Israel  
**Contact:** shirsivroni@gmail.com  
**Associated paper:** Uphill graph topologies and degree-constrained realizations of posets

[Open latest version 1.12.1](https://shir-openu.github.io/uphill-topology-simulator/v1.12.1/) · [Download release v1.12.1](https://github.com/shir-openu/uphill-topology-simulator/releases/tag/v1.12.1)

[Open independently reviewed supplement 1.11.2](https://shir-openu.github.io/uphill-topology-simulator/v1.11.2/) · [Frozen release v1.11.2](https://github.com/shir-openu/uphill-topology-simulator/releases/tag/v1.11.2)

The root Pages address follows the latest published interface. Use a version-specific link when citing an exact artifact. Version 1.12.1 has not received the independent manuscript-side review of 1.11.2; that earlier signoff does not transfer to this release. The simulator is a separate finite illustration, and its computations and drawings do not prove manuscript theorems. This repository does not contain the manuscript or a journal submission.

## What changed in 1.12.1

The introduction begins with the basic path a—b—c, uses shorter reading pauses, and actually loads the demonstrated preset cards in the main view. The neighbourhood summary and visual key are below the graph. The third neighbourhood uses bright blue; vertices belonging to several selected neighbourhoods show concentric rings in their original colours after three whole-neighbourhood blinks. Degree rows change drawing positions without changing the graph or topology.

**Known limitation:** a later introductory-tour demonstration of **Cancel reading** can stall in this release. Use **Stop intro** to leave the demonstration and explore the graph. The complete later tour is not represented as passing natural-completion testing. This publication preserves the exact delivered 1.12.1 executable.

## Run

Open the latest link above, or download `uphill-topology-explorer-v1.12.1.html` from its release and open it in a desktop browser. The standalone HTML works offline and includes styles, scripts and a computation worker. If Blob workers are unavailable, computation has a bounded main-thread fallback.

Select vertices in the main graph to compare their smallest open neighbourhoods. The topology selector changes the allowed-step rule. The original graph is undirected; arrowheads are a derived step overlay. In the full workbench, **Edit this graph & drawing → Layout → Degree levels** rearranges the drawing by degree.

The root page, `dist/index.html` and `v1.12.1/index.html` are exact copies of the accepted local executable:

```text
Version 1.12.1
SHA256  1481cfc02eef2db0797068707d1286fde649c14868da4eb83148f421f3a57ff0
Bytes   484229
```

The frozen paper-supplement page `v1.11.2/index.html` remains unchanged:

```text
Version 1.11.2
SHA256  5c715e7fad50fbb491e75c2ea01ec39b604f5eec367d6a2efcb8de93e6d43282
Bytes   470984
```

## Reproduce

Node.js is the only build/Node-test requirement; there are no npm dependencies. Node v24.12.0 was used for the fresh publication check.

```sh
node --test tests/*.test.mjs
node build.mjs
```

All 88 Node tests pass, and rebuilding reproduces the 1.12.1 HTML hash above. `.gitattributes` preserves the original source line endings, which are needed for byte-identical output. The build's preservation helper archives a differing existing `dist/index.html` before replacing it.

Optional browser harnesses require Python, Chrome/Chromium and `requirements-browser.txt`:

```sh
python -m pip install -r requirements-browser.txt
python tests/e2e_acceptance.py
python tests/e2e_acceptance.py --force-fallback
python tests/e2e_regressions.py
```

Set `UPHILL_CHROME` to the browser executable if automatic discovery cannot find it. These retained harnesses generate local reports/screenshots and are not claimed as freshly passing by the Node/build report. Earlier presentation assertions can describe superseded interfaces; the [validation scope](validation/REVIEW_SCOPE.md) distinguishes retained scripts, previous release evidence and fresh checks. Do not publish generated reports without checking for local paths.

## Validation and provenance

[Current validation scope](validation/REVIEW_SCOPE.md) and [fresh build/Node evidence](validation/reproducibility.json) apply to 1.12.1. The earlier independent [1.11.2 review summary](validation/historical-1.11.2/REVIEW_SCOPE.md) is retained as historical evidence only. The original reviewed tag and downloadable artifacts remain available unchanged.

The public source ZIP is a minimal repackaging of the delivered 1.12.1 archive, with private metadata and historical bulk excluded. Runtime source, build inputs, executable HTML and test logic are unchanged. The test fixture retains its complete `karate34` graph object while removing private manuscript/palette paths. [Repackaging details](validation/REPACKAGING.md) list these distinctions. The application's historical v12 manuscript marker is retained provenance, not the current paper's version.

## Citation and rights

> Sivroni, Shir. Uphill Topology Explorer, version 1.12.1. 2026. Associated with “Uphill graph topologies and degree-constrained realizations of posets.”

For the independently reviewed paper supplement, cite version 1.11.2 and its version-specific link instead. [CITATION.cff](CITATION.cff) describes the current 1.12.1 software. No DOI is assigned by this repository.

No software license was documented in either packaged release, and this publication introduces no new license grant. **All rights reserved; licensing awaits the author's choice.** See [RIGHTS.md](RIGHTS.md).
