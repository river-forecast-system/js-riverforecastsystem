import * as zarr from "zarrita";
import {floodMapsBase, floodMapsManifest} from "../urls.js";

const httpFetcher = async (url) => {
  const r = await fetch(url);
  if (r.status === 404) return void 0;
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.arrayBuffer();
};

function fetcherStore(baseUrl, fetcher) {
  return {
    async get(key) {
      const buf = await fetcher(`${baseUrl}${key}`);
      return buf === void 0 ? void 0 : new Uint8Array(buf);
    }
  };
}

const mPerMm = (v) => {
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = Math.fround(v[i] / 1e3);
  return out;
};
const globalize = (v, origin) => {
  const out = new Int32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] + origin;
  return out;
};
// The worker is long-lived, so its caches need a ceiling — a session that pans the globe and
// selects reach after reach would otherwise grow both without bound (each slice holds ~13 typed
// arrays of per-pixel library data). Map iterates in insertion order, so re-inserting on hit and
// dropping the first key gives a plain LRU. Evicting only drops the cache entry: an in-flight
// consumer already holds the promise, and a later request simply refetches.
const MAX_CACHED_SLICES = 512;
const MAX_CACHED_TILES = 64;

function lruGet(cache, key) {
  const v = cache.get(key);
  if (v === void 0) return void 0;
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function lruSet(cache, key, value, max) {
  cache.set(key, value);
  while (cache.size > max) cache.delete(cache.keys().next().value);
  return value;
}

class FloodMapsIndex {
  constructor(dataBase, fetcher, tilePath, riverTiles) {
    // No codec registration: the tile stores are written with blosc(cname=zstd, clevel=5, shuffle),
    // which zarrita's default registry already resolves. rollup.config.js stubs numcodecs' lz4 and
    // zstd wasm builds away and leaves blosc alone, so blosc is the only compressor that decodes.
    this.dataBase = dataBase;
    this.fetcher = fetcher;
    this.tilePath = tilePath;
    this.riverTiles = riverTiles;
  }

  dataBase;
  fetcher;
  tilePath;
  riverTiles;
  tiles = /* @__PURE__ */ new Map();
  slices = /* @__PURE__ */ new Map();
  // `${tile}/${riverId}`
  activeTiles = /* @__PURE__ */ new Set();

  // tiles whose river ids have been folded into riverTiles (viewport-driven coverage)
  /**
   * The flood library root — manifest.json and the lat=*\/lon=*\/*.zarr stores — comes from
   * config: it sits under the configured v3Base like every other v3 dataset, so a consumer that
   * has called configure() need say nothing here. `base` is an escape hatch for tests reading a
   * local tree off disk with their own fetcher; app code leaves it alone.
   * Coverage starts empty — call setActiveTiles() to fold viewport tiles' rivers into it.
   */
  static async open({fetcher = httpFetcher, base = null} = {}) {
    const root = base ?? floodMapsBase();
    // urls.js owns the filename; an overridden base re-joins it by hand rather than teaching every
    // builder there about a base it will never see in an app.
    const manBuf = await fetcher(base ? `${base}/manifest.json` : floodMapsManifest());
    if (!manBuf) throw new Error(`manifest.json not found under ${root}`);
    const manifest = JSON.parse(new TextDecoder().decode(manBuf));
    const tilePath = /* @__PURE__ */ new Map();
    for (const [name, t] of Object.entries(manifest.tiles)) tilePath.set(name, t.path);
    // Coverage is built up from the tiles the viewport actually touches, via setActiveTiles():
    // each tile's own river id list (read from its zarr.json header) is the source of truth.
    return new FloodMapsIndex(root, fetcher, tilePath, /* @__PURE__ */ new Map());
  }

  /** Dev/test entry: open named tiles directly (no manifest needed);
   * coverage is built from each tile's own directory. Same `base` escape hatch as open(). */
  static async openTiles({tiles, fetcher = httpFetcher, base = null} = {}) {
    const idx = new FloodMapsIndex(
      base ?? floodMapsBase(),
      fetcher,
      new Map(Object.entries(tiles)),
      /* @__PURE__ */ new Map()
    );
    for (const name of idx.tilePath.keys()) {
      const h = await idx.tile(name);
      for (const c of h.attrs.rivers.riverId) {
        const list = idx.riverTiles.get(c);
        if (list) list.push(name);
        else idx.riverTiles.set(c, [name]);
      }
    }
    return idx;
  }

  /** All river ids with flood-library coverage (transfer-friendly). */
  coverage() {
    return Uint32Array.from(this.riverTiles.keys());
  }

  hasCoverage(riverId) {
    return this.riverTiles.has(riverId);
  }

  /**
   * Fold the given tiles' river lists into coverage (riverId -> tiles), loading each new tile's
   * header once. Accumulates: a tile stays active after it leaves the viewport, so coverage
   * only grows as the user pans. Returns the current coverage river ids (transfer-friendly).
   *
   * Caveat: a river spanning several tiles is only fully covered once every tile it touches
   * has been made active — a reach whose flood library extends into an off-screen tile is
   * under-covered until that tile is panned into view.
   */
  async setActiveTiles(names) {
    for (const name of names) {
      if (this.activeTiles.has(name) || !this.tilePath.has(name)) continue;
      this.activeTiles.add(name);
      let h;
      try {
        h = await this.tile(name);
      } catch {
        this.activeTiles.delete(name);
        this.tiles.delete(name);
        continue;
      }
      for (const c of h.attrs.rivers.riverId) {
        const list = this.riverTiles.get(c);
        if (list) {
          if (!list.includes(name)) list.push(name);
        } else {
          this.riverTiles.set(c, [name]);
        }
      }
    }
    return this.coverage();
  }

  tile(name) {
    let h = lruGet(this.tiles, name);
    if (!h) h = lruSet(this.tiles, name, this.openTile(name), MAX_CACHED_TILES);
    return h;
  }

  async openTile(name) {
    const path = this.tilePath.get(name);
    if (!path) throw new Error(`tile ${name} not in manifest`);
    const storeUrl = `${this.dataBase}/${path}`;
    const metaBuf = await this.fetcher(`${storeUrl}/zarr.json`);
    if (!metaBuf) throw new Error(`zarr.json missing for ${name}`);
    const attrs = JSON.parse(new TextDecoder().decode(metaBuf)).attributes;
    if (!attrs.schemaVersion?.startsWith("tiles-1.")) {
      throw new Error(`${name}: unsupported store schema ${attrs.schemaVersion}`);
    }
    const rank = /* @__PURE__ */ new Map();
    attrs.rivers.riverId.forEach((c, i) => rank.set(c, i));
    const root = zarr.root(fetcherStore(storeUrl, this.fetcher));
    return {attrs, rank, root, arrays: /* @__PURE__ */ new Map()};
  }

  array(h, name) {
    let a = h.arrays.get(name);
    if (!a) {
      a = zarr.open(h.root.resolve(name), {kind: "array"});
      h.arrays.set(name, a);
    }
    return a;
  }

  async read1d(h, name, start, count) {
    const arr = await this.array(h, name);
    if (count === 0) {
      return new (arr.shape.length ? Uint8Array : Uint8Array)(0);
    }
    const res = await zarr.get(arr, [zarr.slice(start, start + count)]);
    return res.data;
  }

  async read2d(h, name, start, count) {
    if (count === 0) return new Float32Array(0);
    const arr = await this.array(h, name);
    const res = await zarr.get(arr, [zarr.slice(start, start + count), null]);
    return res.data;
  }

  /** Load (and cache) one river's slice from one tile. */
  slice(tileName, riverId) {
    const key = `${tileName}/${riverId}`;
    let s = lruGet(this.slices, key);
    if (!s) s = lruSet(this.slices, key, this.loadSlice(tileName, riverId), MAX_CACHED_SLICES);
    return s;
  }

  async loadSlice(tileName, riverId) {
    const h = await this.tile(tileName);
    const r = h.rank.get(riverId);
    if (r === void 0) throw new Error(`riverId ${riverId} not in tile ${tileName}`);
    const d = h.attrs.rivers;
    const {gRow0, gCol0} = h.attrs.grid;
    const vs = d.visitStart[r];
    const vc = d.visitCount[r];
    const ps = d.pixStart[r];
    const pc = d.pixCount[r];
    const rs = d.relStart[r];
    const rc = d.relCount[r];
    const [fspLocal, sRow, sCol, bed, qBaseflow, q, wse, pixRow, pixCol, fill, relCount, relFspLocal, relDtf] = await Promise.all([
      this.read1d(h, "streams/fsp_local", vs, vc),
      this.read1d(h, "streams/row", vs, vc),
      this.read1d(h, "streams/col", vs, vc),
      this.read1d(h, "streams/bed", vs, vc),
      this.read1d(h, "streams/q_baseflow", vs, vc),
      this.read2d(h, "streams/q", vs, vc),
      this.read2d(h, "streams/wse", vs, vc),
      this.read1d(h, "library/pix_row", ps, pc),
      this.read1d(h, "library/pix_col", ps, pc),
      this.read1d(h, "library/fill_mm", ps, pc),
      this.read1d(h, "library/rel_count", ps, pc),
      this.read1d(h, "library/fsp_local", rs, rc),
      this.read1d(h, "library/dtf_mm", rs, rc)
    ]);
    const runs = d.runStarts[r];
    const runStarts = new Int32Array(runs.length + 1);
    runStarts.set(runs);
    runStarts[runs.length] = vc;
    return {
      riverId,
      tile: tileName,
      nVisit: vc,
      nFsp: d.fspCount[r],
      runStarts,
      fspLocal,
      row: globalize(sRow, gRow0),
      col: globalize(sCol, gCol0),
      bed,
      qBaseflow,
      q,
      wse,
      nPix: pc,
      pixRow: globalize(pixRow, gRow0),
      pixCol: globalize(pixCol, gCol0),
      fill: mPerMm(fill),
      relCount,
      relFspLocal,
      relDtf: mPerMm(relDtf)
    };
  }

  /**
   * Fetch every (tile, riverId) slice for the selected rivers. River ids without coverage are
   * silently skipped (callers gate UI on hasCoverage). A river crossing tiles yields one
   * slice per owning tile; the slices are disjoint by construction and compose by
   * scatter-max in the global frame.
   */
  async slicesFor(riverIds) {
    const jobs = [];
    for (const c of riverIds) {
      for (const t of this.riverTiles.get(c) ?? []) jobs.push(this.slice(t, c));
    }
    return Promise.all(jobs);
  }
}

export {
  FloodMapsIndex,
  httpFetcher
};
