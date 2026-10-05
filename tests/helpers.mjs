// re-exports for the tests (the oracle file imports only what it compares)
export { buildTopologyModel, equalDegreeComponents } from '../src/kernel/topology.js';
export { neighbourSets as neighbourSetsForTest } from '../src/kernel/graph.js';
