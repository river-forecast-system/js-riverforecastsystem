'use strict';

import {riverNetworkGraph} from "../urls.js";

/**
 * River topology: the flow graph, and the selections that can only be answered by walking it.
 *
 * The graph is a forest — every reach has exactly one downstream reach — which is what makes the
 * traversals here cheap and what between() leans on. It arrives as
 * `{schema, meta, edges: [[riverId, nextRiverId, usContAreaKm2?], ...]}`; see loadRiverNetwork().
 *
 * The published graph need not be the whole network. Where it is a subset, a downstream id can
 * point outside it, and every traversal here treats that as the end of the chain — correct at a
 * domain boundary, and the reason between() reports what it could not connect rather than
 * pretending it did.
 */
class RiverNetwork {
  terminal;
  downMap;
  // riverId -> nextRiverId (-1 = terminal outlet)
  upAdj;
  // nextRiverId -> Set(immediate upstream riverIds)
  areaKm2;
  // upstream contributing area, where the graph has it
  meta;

  constructor(graph) {
    this.terminal = graph.schema.terminal_value;
    this.meta = graph.meta;
    this.downMap = new Map();
    this.upAdj = new Map();
    this.areaKm2 = new Map();
    for (const e of graph.edges) {
      const [id, ds] = e;
      this.downMap.set(id, ds);
      if (e.length > 2 && e[2] > 0) this.areaKm2.set(id, e[2]);
      if (ds !== this.terminal) {
        let up = this.upAdj.get(ds);
        if (!up) this.upAdj.set(ds, up = new Set());
        up.add(id);
      }
    }
  }

  /** Is this reach part of the loaded network? */
  has(id) {
    return this.downMap.has(id);
  }

  /** Every reach that drains to `outlet`, inclusive. Reverse BFS with a head pointer, O(V). */
  upstreamOf(outlet) {
    const visited = new Set([outlet]);
    const queue = [outlet];
    for (let head = 0; head < queue.length; head++) {
      const parents = this.upAdj.get(queue[head]);
      if (!parents) continue;
      for (const p of parents) if (!visited.has(p)) {
        visited.add(p);
        queue.push(p);
      }
    }
    return visited;
  }

  /** Every reach on the flow path from `inlet` to its terminal outlet, inclusive. */
  downstreamOf(inlet) {
    const chain = new Set();
    let cur = inlet;
    while (this.downMap.has(cur) && !chain.has(cur)) {
      chain.add(cur);
      const ds = this.downMap.get(cur);
      if (ds === this.terminal) break;
      cur = ds;
    }
    return chain;
  }

  /** Union of upstreamOf over every outlet. */
  upstreamClosure(outlets) {
    const out = new Set();
    for (const o of outlets) for (const id of this.upstreamOf(o)) out.add(id);
    return out;
  }

  /** Union of downstreamOf over every inlet. */
  downstreamClosure(inlets) {
    const out = new Set();
    for (const i of inlets) for (const id of this.downstreamOf(i)) out.add(id);
    return out;
  }

  // ---- click-radius selection ------------------------------------------------------------
  /** Total upstream reach count per node (drainage-area proxy; lazily built once, O(V)).
   * At a junction, the parent with the larger count is treated as the main stem. */
  upCounts = null;

  buildUpCounts() {
    if (this.upCounts) return this.upCounts;
    const count = new Map();
    const remaining = new Map();
    const queue = [];
    for (const id of this.downMap.keys()) {
      const nUp = this.upAdj.get(id)?.size ?? 0;
      count.set(id, 1);
      remaining.set(id, nUp);
      if (nUp === 0) queue.push(id);
    }
    for (let head = 0; head < queue.length; head++) {
      const n = queue[head];
      const ds = this.downMap.get(n);
      if (ds === undefined || ds === this.terminal || !this.downMap.has(ds)) continue;
      count.set(ds, (count.get(ds) ?? 1) + (count.get(n) ?? 1));
      const r = (remaining.get(ds) ?? 1) - 1;
      remaining.set(ds, r);
      if (r === 0) queue.push(ds);
    }
    this.upCounts = count;
    return count;
  }

  /** Immediate upstream parents of `id`, main stem first: by true drainage area when the
   * graph carries it for every parent at this junction, else by total upstream reach count
   * (needed for old-snapshot rivers backfilled without metadata attributes). */
  parentsByStem(id) {
    const parents = this.upAdj.get(id);
    if (!parents || parents.size === 0) return [];
    const list = [...parents];
    if (list.every((p) => this.areaKm2.has(p))) {
      return list.sort((a, b) => this.areaKm2.get(b) - this.areaKm2.get(a) || a - b);
    }
    const c = this.buildUpCounts();
    return list.sort((a, b) => (c.get(b) ?? 0) - (c.get(a) ?? 0) || a - b);
  }

  /** Follow a branch's own principal (largest-drainage) path upstream for `depth`
   * segments total, adding them to `sel`. Sub-branches are not expanded. */
  walkBranch(head, depth, sel) {
    let cur = head;
    for (let i = 0; i < depth; i++) {
      if (sel.has(cur)) break;
      sel.add(cur);
      const parents = this.parentsByStem(cur);
      if (parents.length === 0) break;
      cur = parents[0];
    }
  }

  /**
   * Click-radius selection: the clicked reach, `mainUp` segments up the main stem and
   * `mainDown` down the flow path, plus the first `branchDepth` segments of every side
   * branch met along the way (tributaries joining the downstream path, and non-main
   * parents at junctions on the upstream path). "Main stem" at a junction = the parent
   * with the largest total upstream reach count (drainage-area proxy — the graph carries
   * no stream-order attributes).
   */
  aroundClick(rid, mainUp, mainDown, branchDepth) {
    const sel = new Set();
    if (!this.downMap.has(rid)) return sel;
    sel.add(rid);
    const branchHeads = [];
    let cur = rid;
    for (let i = 0; i < mainUp; i++) {
      const parents = this.parentsByStem(cur);
      if (parents.length === 0) break;
      for (let k = 1; k < parents.length; k++) branchHeads.push(parents[k]);
      if (sel.has(parents[0])) break;
      sel.add(parents[0]);
      cur = parents[0];
    }
    cur = rid;
    for (let i = 0; i < mainDown; i++) {
      const ds = this.downMap.get(cur);
      if (ds === undefined || ds === this.terminal || !this.downMap.has(ds) || sel.has(ds)) break;
      for (const p of this.upAdj.get(ds) ?? []) if (p !== cur) branchHeads.push(p);
      sel.add(ds);
      cur = ds;
    }
    for (const head of branchHeads) this.walkBranch(head, branchDepth, sel);
    return sel;
  }

  // ---- corridor between clicked reaches ----------------------------------------------------

  // Memoized rankToOutlet(); one entry per reach the walks have touched.
  ranks = new Map();

  /**
   * Hops from `id` to the end of its flow path — 0 at a terminal outlet or where the path leaves
   * this graph, -1 for a reach the graph doesn't carry.
   *
   * Strictly decreasing downstream, so it orders any two reaches that lie on one path. That is the
   * same property the global riverIndex has (verified: every non-terminal edge in the hydrography
   * metadata has riverIndex(downstream) > riverIndex(upstream)) — but riverIndex only reaches this
   * module for reaches the user clicked, and the walk below needs a rank for the interior reaches
   * it discovers, so it is derived from the graph instead. riverId is NOT a substitute: ~16% of the
   * edges here run to a *smaller* id.
   *
   * Iterative, so a chain thousands of reaches long can't blow the stack, and memoized on the way
   * back up — the first walk down a trunk ranks every reach on it.
   */
  rankToOutlet(id) {
    if (!this.downMap.has(id)) return -1;
    const stack = [];
    let cur = id;
    while (this.ranks.get(cur) === undefined) {
      stack.push(cur);
      const ds = this.downMap.get(cur);
      // End of the line: a terminal outlet, or a downstream id this graph doesn't carry (the
      // coverage subset is not closed — a path can simply leave it).
      if (ds === undefined || ds === this.terminal || !this.downMap.has(ds)) {
        this.ranks.set(cur, 0);
        break;
      }
      // The data is a forest, so this cannot loop — unless it is corrupt, in which case stop
      // rather than hang, and let the ranks that result be merely wrong.
      if (stack.length > this.downMap.size) {
        this.ranks.set(cur, 0);
        break;
      }
      cur = ds;
    }
    for (let i = stack.length - 1; i >= 0; i--) {
      const n = stack[i];
      if (this.ranks.get(n) === undefined) this.ranks.set(n, this.ranks.get(this.downMap.get(n)) + 1);
    }
    return this.ranks.get(id);
  }

  /**
   * Every reach between the clicked ones: the smallest connected piece of river that holds them
   * all, which is each click's flow path down to the point where they converge, and nothing below
   * that point. Tributaries that merely drain *into* the corridor are not included — they are
   * beside the clicks, not between them.
   *
   * Why a walk and not an ordering: rank (like riverIndex) says which of two reaches on ONE path is
   * the upper, but two clicks on different tributaries are ordered by it too and neither is
   * upstream of the other. Only following the graph can tell those apart, and only following it
   * finds the confluence they meet at, which is generally below both and was never clicked.
   *
   * The walk is one pointer per click, and each step advances whichever pointer is furthest
   * upstream (highest rank). A pointer that is already the lowest can never rise to meet another,
   * so moving it could step straight over the junction — advancing the highest cannot. Pointers
   * that land on the same reach merge, carrying both clicks and both trails. One pointer left means
   * everything converged; it stops at the junction, so a corridor between neighbouring reaches
   * costs a few steps even on a river that runs for thousands more.
   *
   * Returns {corridor, junctions, detached}: the reaches between the clicks (always including the
   * clicks themselves, even ones this graph has never heard of), the reach each group converged on,
   * and the clicks that reached no other — a click in another basin, or one whose path left the
   * coverage subset before it could meet anything.
   */
  between(clicked) {
    const ids = [...new Set(clicked)];
    const corridor = new Set(ids);
    // A click the graph doesn't carry can still be flooded on its own; it just can't be connected.
    let live = ids.filter((id) => this.downMap.has(id)).map((id) => ({at: id, clicks: [id], trail: [id]}));
    if (live.length < 2) return {corridor, junctions: [], detached: ids};

    // Every step drops one pointer's rank by one, and ranks are bounded by the reach count, so this
    // is unreachable — it is here so corrupt topology fails as a wrong answer, not a frozen tab.
    const limit = live.length * this.downMap.size + 1;
    for (let step = 0; live.length > 1 && step < limit; step++) {
      let w = live[0];
      for (const x of live) if (this.rankToOutlet(x.at) > this.rankToOutlet(w.at)) w = x;
      const ds = this.downMap.get(w.at);
      // The furthest-upstream pointer has run out of river. Everything else is at or below it and
      // only ever moves down, so nothing can meet it now — whatever hasn't converged never will.
      if (ds === undefined || ds === this.terminal || !this.downMap.has(ds)) break;
      w.at = ds;
      w.trail.push(ds);
      const met = live.find((x) => x !== w && x.at === ds);
      if (met) {
        met.clicks.push(...w.clicks);
        met.trail.push(...w.trail);
        // Where this group stands converged, and everything it took to get there. A merged pointer
        // keeps walking to look for the groups still out there, and those steps are below the
        // junction — they belong to the corridor only if they reach one, which the next merge
        // records in turn.
        met.junction = ds;
        met.settled = met.trail.length;
        live = live.filter((x) => x !== w);
      }
    }

    const junctions = [];
    const detached = ids.filter((id) => !this.downMap.has(id));
    for (const w of live) {
      // A pointer still carrying one click met nobody, so its trail is a walk downstream that
      // led nowhere — the click stays selected, the reaches it passed through do not.
      if (w.clicks.length < 2) {
        detached.push(w.clicks[0]);
        continue;
      }
      junctions.push(w.junction);
      for (const id of w.trail.slice(0, w.settled)) corridor.add(id);
    }
    return {corridor, junctions, detached};
  }
}

/**
 * Fetch the published network graph and build a RiverNetwork from it.
 *
 * `url` defaults to the configured v3 root's graph (urls.riverNetworkGraph()); pass one to read a
 * graph from somewhere else. Throws if the fetch fails — whether an app can work without topology
 * is the app's call, not this function's.
 */
async function loadRiverNetwork(url = riverNetworkGraph()) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`river network graph fetch failed: ${resp.status} ${url}`);
  return new RiverNetwork(await resp.json());
}

export {
  RiverNetwork,
  loadRiverNetwork
};
