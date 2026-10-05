// Presets: the 12 specification fixtures (graph data read from
// fixtures/acceptance_fixtures_spec_v1.json at build time into FIXTURE_GRAPHS)
// plus hand-placed layouts, and a few extra workbench presets.
// Layouts are presentation only; they never enter a computation.

export const PRESET_INFO = [
  ['hard19', 'Cube, triangle, branches and islands (19 vertices)', { a:[300,200],b:[420,200],c:[420,320],d:[300,320],e:[180,90],f:[540,90],g:[540,430],h:[180,430],i:[70,90],j:[660,90],k:[760,40],l:[760,140],m:[660,430],n:[770,430],p:[180,540],q:[300,540],r:[420,540],s:[540,540],t:[700,540] }],
  ['clb7', 'Triangle with branching paths (7 vertices)', { a:[80,80],b:[80,260],c:[240,170],d:[410,170],e:[570,90],f:[730,90],g:[570,290] }],
  ['square_diagonal', 'Square with diagonal ac', { a: [80, 80], b: [260, 80], c: [260, 260], d: [80, 260] }],
  ['path3', 'Path a—b—c', { a: [60, 170], b: [180, 170], c: [300, 170] }],
  ['crown7', 'Seven-vertex crown', { 0: [40, 250], 1: [120, 250], 2: [200, 250], 3: [280, 250], 4: [80, 80], 5: [180, 80], 6: [280, 80] }],
  ['isolated3', 'Three isolated vertices', { a: [80, 170], b: [180, 170], c: [280, 170] }],
  ['cycle4', 'Four-cycle', { a: [80, 80], b: [260, 80], c: [260, 260], d: [80, 260] }],
  ['disjoint_triangles', 'Two disjoint triangles', null],
  ['triangle3', 'Triangle K₃', null],
  ['edge2', 'Single edge K₂', null],
  ['empty0', 'Zero vertices', null],
  ['subspace_intermediate', 'Tree ab, bc, cd, ce', { a: [40, 170], b: [120, 170], c: [200, 170], d: [280, 110], e: [280, 230] }],
  ['joined_triangles', 'Two triangles joined by p—v—q', null],
  ['konigsberg', 'Königsberg (loopless multigraph)', { A: [180, 170], B: [180, 50], C: [180, 290], D: [320, 170] }],
  ['overlap5', 'Overlap playground — try b and d', { a: [150, 90], b: [340, 90], c: [340, 280], d: [150, 280], e: [30, 40] }],
  ['star5', 'Four-leaf star — try a and b', { c: [220, 180], a: [220, 40], b: [360, 180], d: [220, 320], e: [80, 180] }],
  ['path6', 'Six-vertex path — try a and f', { a: [40, 160], b: [140, 160], c: [240, 160], d: [340, 160], e: [440, 160], f: [540, 160] }],
  ['diamond8', 'Uphill diamond with leaves — try b and c', { a: [240, 360], b: [130, 250], c: [350, 250], d: [240, 120], p: [30, 300], q: [450, 300], e: [130, 40], f: [350, 40] }],
  ['disconnected7', 'Two paths and an isolate — try a and d', { a: [40, 110], b: [160, 110], c: [280, 110], d: [40, 290], e: [160, 290], f: [280, 290], g: [430, 200] }],
  ['bowtie5', 'Two triangles sharing a vertex — try a and d', { a: [80, 80], b: [80, 260], c: [240, 170], d: [400, 80], e: [400, 260] }],
  ['cube11', 'Cube + three vertices of degree 1, 2, 3', { a: [170, 160], b: [450, 160], c: [450, 440], d: [170, 440], e: [270, 250], f: [550, 250], g: [550, 530], h: [270, 530], x: [40, 70], y: [400, 20], z: [720, 140] }],
  // Exact vertex positions from Figure 3 of the user-supplied manuscript.
  ['karate34', 'Karate-club network — manuscript figure 3 (34 vertices)', {
    1:[384.7,369.9],2:[465.2,431.7],3:[600.9,290.3],4:[428.2,278.6],5:[182.4,460.9],6:[235.6,216.4],
    7:[168.4,297.4],8:[440.1,176.3],9:[557.1,378.0],10:[681.3,129.1],11:[237.4,371.1],12:[311.7,138.8],
    13:[287.1,463.7],14:[536.7,217.4],15:[893.9,155.8],16:[804.5,103.4],17:[40.0,180.7],18:[291.1,567.6],
    19:[891.9,263.3],20:[559.6,481.9],21:[979.5,321.3],22:[387.5,602.5],23:[980.0,215.6],24:[868.7,518.6],
    25:[635.4,666.6],26:[749.3,664.6],27:[973.8,509.1],28:[753.1,491.1],29:[692.5,233.6],30:[931.2,413.3],
    31:[656.8,522.6],32:[645.8,422.9],33:[785.6,279.2],34:[772.7,369.9],
  }],
];

// Small, editable playgrounds supplement the fixed acceptance fixtures.
// Their topology still comes only from graph edges and the selected mode;
// neither the drawing nor the suggested comparison pair supplies results.
const simplePreset = (ids, pairs) => ({
  schemaVersion: 'uphill-graph/1', kind: 'simple-undirected',
  nodes: ids.map(id => ({ id, label: id })),
  edges: pairs.map(([source, target], i) => ({ id: `e${i + 1}`, source, target })),
});

export const EXTRA_PRESETS = {
  // The complete unweighted karate-club graph, relabelled 1–34, as drawn in
  // manuscript Figure 3. All 78 SVG edge endpoints were mapped to the labelled
  // vertex centres; degrees and neighbourhoods are still computed by the kernel.
  // These are graph/topology colours, not the observed social-club split.
  karate34: simplePreset(Array.from({ length: 34 }, (_, i) => String(i + 1)), [
    ['1','2'],['1','3'],['1','4'],['1','5'],['1','6'],['1','7'],['1','8'],['1','9'],
    ['1','11'],['1','12'],['1','13'],['1','14'],['1','18'],['1','20'],['1','22'],['1','32'],
    ['2','3'],['2','4'],['2','8'],['2','14'],['2','18'],['2','20'],['2','22'],['2','31'],
    ['3','4'],['3','8'],['3','9'],['3','10'],['3','14'],['3','28'],['3','29'],['3','33'],
    ['4','8'],['4','13'],['4','14'],['5','7'],['5','11'],['6','7'],['6','11'],['6','17'],['7','17'],
    ['9','31'],['9','33'],['9','34'],['10','34'],['14','34'],['15','33'],['15','34'],['16','33'],['16','34'],
    ['19','33'],['19','34'],['20','34'],['21','33'],['21','34'],['23','33'],['23','34'],
    ['24','26'],['24','28'],['24','30'],['24','33'],['24','34'],['25','26'],['25','28'],['25','32'],
    ['26','32'],['27','30'],['27','34'],['28','34'],['29','32'],['29','34'],['30','33'],['30','34'],
    ['31','33'],['31','34'],['32','33'],['32','34'],['33','34'],
  ]),
  // Finite examples recovered from the user's specified Claude conversation.
  // hard19 follows CLB_PRACTICE_HARD_GRAPH_2026-09-28_r5.ipynb, cell 7;
  // its layout follows the companion r5 figure. All degrees are recomputed.
  hard19: simplePreset(['a','b','c','d','e','f','g','h','i','j','k','l','m','n','p','q','r','s','t'], [
    ['a','b'],['b','c'],['c','d'],['d','a'],['a','e'],['b','f'],['c','g'],['d','h'],
    ['e','f'],['f','g'],['g','h'],['h','e'],['e','i'],['f','j'],['j','k'],['k','l'],['l','j'],
    ['g','m'],['m','n'],['p','q'],['q','r'],['r','s'],
  ]),
  clb7: simplePreset(['a','b','c','d','e','f','g'], [['a','b'],['b','c'],['c','a'],['c','d'],['d','e'],['e','f'],['d','g']]),
  overlap5: simplePreset(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'], ['a', 'c'], ['a', 'e']]),
  star5: simplePreset(['c', 'a', 'b', 'd', 'e'], [['c', 'a'], ['c', 'b'], ['c', 'd'], ['c', 'e']]),
  path6: simplePreset(['a', 'b', 'c', 'd', 'e', 'f'], [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e'], ['e', 'f']]),
  diamond8: simplePreset(['a', 'b', 'c', 'd', 'p', 'q', 'e', 'f'], [['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['b', 'p'], ['c', 'q'], ['d', 'e'], ['d', 'f']]),
  disconnected7: simplePreset(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'b'], ['b', 'c'], ['d', 'e'], ['e', 'f']]),
  bowtie5: simplePreset(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd'], ['d', 'e'], ['e', 'c']]),
  cube11: simplePreset(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'x', 'y', 'z'], [
    ['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a'],
    ['e', 'f'], ['f', 'g'], ['g', 'h'], ['h', 'e'],
    ['a', 'e'], ['b', 'f'], ['c', 'g'], ['d', 'h'],
    ['x', 'a'], ['y', 'a'], ['y', 'b'], ['z', 'a'], ['z', 'b'], ['z', 'c'],
  ]),
};

export function isolatedPreset(k) {
  const nodes = Array.from({ length: k }, (_, i) => ({ id: 'i' + (i + 1), label: 'i' + (i + 1) }));
  return { schemaVersion: 'uphill-graph/1', kind: 'simple-undirected', nodes, edges: [] };
}
