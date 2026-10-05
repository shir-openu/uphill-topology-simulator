// Presentation only: use the active kernel's least open neighbourhoods.
// Every selected vertex is an origin; selection order determines its key colour.
export function neighbourhoodComparison(graph, topology, selectedIds) {
  const selected = [...new Set(selectedIds)].filter(id => graph.index.has(id));
  const anchors = selected.map(id => graph.index.get(id));
  const masks = anchors.map(origin => topology.N[origin]);
  const colours = anchors.map((_, i) => neighbourhoodColour(i));
  const memberships = Array.from({ length: topology.n }, (_, vertex) =>
    masks.flatMap((mask, start) => mask[vertex] ? [start] : []));
  const union = Uint8Array.from(memberships, starts => Number(starts.length > 0));
  const shared = Uint8Array.from(memberships, starts => Number(starts.length > 1));
  // Retain the familiar one/two-start representation and exact pair sets.
  const first = masks[0] || new Uint8Array(topology.n);
  const second = masks[1] || new Uint8Array(topology.n);
  const intersection = first.map((present, i) => Number(Boolean(present && second[i])));
  const firstOnly = first.map((present, i) => Number(Boolean(present && !second[i])));
  const secondOnly = second.map((present, i) => Number(Boolean(present && !first[i])));
  const regions = anchors.length <= 2
    ? Array.from(first, (present, i) => present ? second[i] ? 'intersection' : 'first' : second[i] ? 'second' : 'outside')
    : memberships.map(starts => starts.length > 1 ? 'shared' : starts.length ? 'single' : 'outside');
  return { anchors, selectedCount: selected.length, masks, colours, memberships, union, shared,
    first, second, intersection, firstOnly, secondOnly, regions };
}

// Keep the familiar wine/turquoise pair. The third start uses bright blue
// to stay distinct from wine/pink; later starts retain report61 palette shades.
const START_COLOURS = ['#86264f', '#147f87', '#2563eb', '#7b1fa2', '#e151a9', '#00acc1',
  '#ae96d8', '#9d1b6b', '#bb7be6', '#6a1b9a', '#0aeaff', '#b5179e'];

export function neighbourhoodColour(index) {
  return START_COLOURS[index] || `hsl(${(170 + index * 137.507764 % 175).toFixed(3)} 60% ${40 + index % 3 * 7}%)`;
}

export const NEIGHBOURHOOD_COLOURS = {
  first: '#86264f', second: '#147f87', intersection: '#7946ad', outside: '#f3f0f4',
};
