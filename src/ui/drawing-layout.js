// A bounded drawing algorithm. It reads graph adjacency and returns positions;
// topology, selection, history and the graph itself are never mutated here.
export function relaxedNetworkLayout(graph) {
  const n = graph.nodes.length;
  if (!n) return {};
  const width = Math.max(1040, Math.ceil(Math.sqrt(n) * 100));
  const height = Math.max(560, Math.round(width * .54));
  const cx = width / 2, cy = height / 2;
  if (n === 1) return { [graph.nodes[0].id]: { x: cx, y: cy } };
  // Start from a repeatable circle, independent of earlier drags or layouts.
  const points = new Array(n);
  graph.order.forEach((index, rank) => {
    const angle = -Math.PI / 2 + 2 * Math.PI * rank / n;
    points[index] = { x: cx + width * .34 * Math.cos(angle), y: cy + height * .34 * Math.sin(angle) };
  });
  const unique = new Set(), edges = [];
  for (const e of graph.edges) {
    const key = e.u < e.v ? `${e.u}:${e.v}` : `${e.v}:${e.u}`;
    if (!unique.has(key)) { unique.add(key); edges.push([e.u, e.v]); }
  }
  const ideal = Math.max(68, Math.min(180, Math.sqrt(width * height / n) * .65));
  const steps = 180;
  for (let step = 0; step < steps; step++) {
    const forces = points.map(p => ({ x: (cx - p.x) * .018, y: (cy - p.y) * .018 }));
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
      if (Math.abs(dx) + Math.abs(dy) < .001) { dx = .1 * (i + 1); dy = -.1 * (j + 1); }
      const d = Math.max(.01, Math.hypot(dx, dy));
      const push = ideal * ideal / d * .075 + Math.max(0, 58 - d) * .45;
      const fx = dx / d * push, fy = dy / d * push;
      forces[i].x += fx; forces[i].y += fy;
      forces[j].x -= fx; forces[j].y -= fy;
    }
    for (const [i, j] of edges) {
      const dx = points[j].x - points[i].x, dy = points[j].y - points[i].y;
      const d = Math.max(.01, Math.hypot(dx, dy));
      const pull = d * d / ideal * .045;
      const fx = dx / d * pull, fy = dy / d * pull;
      forces[i].x += fx; forces[i].y += fy;
      forces[j].x -= fx; forces[j].y -= fy;
    }
    const temperature = 18 * (1 - step / steps) + .5;
    points.forEach((p, i) => {
      const f = forces[i], length = Math.hypot(f.x, f.y);
      const scale = length > temperature ? temperature / length : 1;
      p.x += f.x * scale;
      p.y += f.y * scale;
    });
  }
  // Fit once after relaxation. Clamping on every step pins nodes into straight
  // rows along the drawing border and distorts the network's natural spacing.
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const fit = Math.min((width - 100) / Math.max(1, maxX - minX), (height - 100) / Math.max(1, maxY - minY));
  const middleX = (minX + maxX) / 2, middleY = (minY + maxY) / 2;
  const arranged = points.map(p => ({ x: cx + (p.x - middleX) * fit, y: cy + (p.y - middleY) * fit }));
  // Node glyphs and degree labels have fixed sizes in SVG coordinates. Restore
  // their clearance after fitting, then translate only; another scale would
  // shrink that clearance again. The SVG viewBox fits the resulting positions.
  for (let pass = 0; pass < 120; pass++) {
    let overlap = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = arranged[j].x - arranged[i].x, dy = arranged[j].y - arranged[i].y;
      if (Math.abs(dx) + Math.abs(dy) < .001) { dx = .1 * (i + 1); dy = -.1 * (j + 1); }
      const d = Math.max(.01, Math.hypot(dx, dy));
      if (d >= 72) continue;
      overlap = Math.max(overlap, 72 - d);
      const push = (72 - d + .02) / 2;
      arranged[i].x -= dx / d * push; arranged[i].y -= dy / d * push;
      arranged[j].x += dx / d * push; arranged[j].y += dy / d * push;
    }
    if (overlap < .05) break;
  }
  const shiftX = Math.max(0, 50 - Math.min(...arranged.map(p => p.x)));
  const shiftY = Math.max(0, 50 - Math.min(...arranged.map(p => p.y)));
  return Object.fromEntries(graph.nodes.map((node, i) => [node.id, {
    x: Math.round(arranged[i].x + shiftX),
    y: Math.round(arranged[i].y + shiftY),
  }]));
}
