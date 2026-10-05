import { compareIds } from '../kernel/graph.js';

// A drawing-only arrangement for the finite introductory examples. The caller
// supplies the current model's recomputed degree statistic, indexed by node.
// Edges, neighbourhoods, selection and the old positions remain untouched.
// Equal degrees share a row; preserve their previous left-to-right order so
// the transition remains easy to follow. This does not promise uncrossed edges.
export function degreeRowLayout(graph, degree, previousLayout = graph.layout) {
  if (degree.length !== graph.nodes.length || [...degree].some(value => !Number.isInteger(value) || value < 0)) {
    throw new TypeError('Degree rows require one non-negative integer statistic per vertex.');
  }
  if (!graph.nodes.length) return {};

  const groups = new Map();
  graph.nodes.forEach((node, index) => {
    if (!groups.has(degree[index])) groups.set(degree[index], []);
    groups.get(degree[index]).push(node);
  });
  const rows = [...groups.entries()].sort((left, right) => right[0] - left[0]);
  const oldX = node => Number.isFinite(previousLayout?.[node.id]?.x) ? previousLayout[node.id].x : Infinity;
  for (const [, row] of rows) {
    row.sort((a, b) => {
      const left = oldX(a), right = oldX(b);
      return (left < right ? -1 : left > right ? 1 : 0) || compareIds(a.id, b.id);
    });
  }

  // Spacing is in SVG units, independent of the current viewport. The existing
  // camera fits these positions without changing the graph's mathematical data.
  const columnGap = 120, rowGap = 130, margin = 80;
  const width = Math.max(600, (Math.max(...rows.map(([, row]) => row.length)) - 1) * columnGap + 2 * margin);
  const height = Math.max(360, (rows.length - 1) * rowGap + 2 * margin);
  const positions = [];
  rows.forEach(([, row], rank) => {
    const y = rows.length === 1 ? height / 2 : margin + rank * (height - 2 * margin) / (rows.length - 1);
    const left = (width - (row.length - 1) * columnGap) / 2;
    row.forEach((node, column) => positions.push([node.id, { x: left + column * columnGap, y }]));
  });
  return Object.fromEntries(positions);
}
