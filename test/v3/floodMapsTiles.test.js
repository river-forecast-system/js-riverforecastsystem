import {describe, expect, it} from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import {FloodMapsIndex} from "../../src/v3/floodmaps/index.js";

// A real flood library is far too large to commit, so these run against a local tree and skip when
// it is absent. Point RFS_FLOOD_MAPS_ROOT at any directory holding manifest.json + the tile stores.
const ROOT = process.env.RFS_FLOOD_MAPS_ROOT ?? `${os.homedir()}/data/fldpln-merged/tiles-zarr`;
const TILE = "N24W104_FABDEM_V1-2";
// the store leaf is the constant fldpln.zarr — the lat=/lon= partition identifies the cell, and the
// DEM tile name lives in the store's `tile` attr and keys manifest.json's `tiles` map
const TILE_PATH = "lat=24/lon=-104/fldpln.zarr";
const RIVER_ID = 770148173;
const G_ROW0 = Math.round((90 - (24 + 1.1)) * 3600);
const G_COL0 = Math.round((-104 - 0.1 + 180) * 3600);

// Reads the store off disk instead of over http — the same injection point the browser uses for
// fetch, which is why FloodMapsIndex takes a fetcher rather than opening a FetchStore itself.
const fileFetcher = async (url) => {
  try {
    const b = await fs.promises.readFile(url);
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  } catch (e) {
    if (e.code === "ENOENT") return void 0;
    throw e;
  }
};

describe.skipIf(!fs.existsSync(`${ROOT}/${TILE_PATH}`))("flood-maps zarr stores", () => {
  it("loads a river slice with correct shapes and global coordinates", async () => {
    const idx = await FloodMapsIndex.openTiles({tiles: {[TILE]: TILE_PATH}, fetcher: fileFetcher, base: ROOT});
    expect(idx.riverTiles.size).toBe(159);
    const s = await idx.slice(TILE, RIVER_ID);
    expect(s.riverId).toBe(RIVER_ID);
    expect(s.nVisit).toBe(280);
    expect(s.relFspLocal.length).toBe(31193);
    expect(s.relDtf.length).toBe(31193);
    let relSum = 0;
    for (const c of s.relCount) relSum += c;
    expect(relSum).toBe(31193);
    expect(s.runStarts[0]).toBe(0);
    expect(s.runStarts[s.runStarts.length - 1]).toBe(s.nVisit);
    expect(s.q.length).toBe(s.nVisit * 30);
    for (const v of [s.row[0], s.row[s.nVisit - 1], s.pixRow[0], s.pixRow[s.nPix - 1]]) {
      expect(v).toBeGreaterThanOrEqual(G_ROW0);
      expect(v).toBeLessThan(G_ROW0 + 4320);
    }
    for (const v of [s.col[0], s.pixCol[0], s.pixCol[s.nPix - 1]]) {
      expect(v).toBeGreaterThanOrEqual(G_COL0);
      expect(v).toBeLessThan(G_COL0 + 4320);
    }
    let dtfMax = 0;
    for (const d of s.relDtf) if (d > dtfMax) dtfMax = d;
    expect(dtfMax).toBeGreaterThan(0);
    expect(dtfMax).toBeLessThanOrEqual(25.5);
  });

  it.skipIf(!fs.existsSync(`${ROOT}/manifest.json`))(
    "opens via manifest and builds coverage from active (viewport) tiles",
    async () => {
      const idx = await FloodMapsIndex.open({fetcher: fileFetcher, base: ROOT});
      expect(idx.tilePath.size).toBe(1106);
      // no global riverId->tile index anymore; coverage is empty until a tile is made active
      expect(idx.riverTiles.size).toBe(0);
      const coverage = await idx.setActiveTiles([TILE]);
      expect(idx.activeTiles.has(TILE)).toBe(true);
      expect(coverage.length).toBe(idx.riverTiles.size);
      expect(coverage.length).toBeGreaterThan(0);
      expect(idx.riverTiles.get(RIVER_ID)).toContain(TILE);
      const slices = await idx.slicesFor([RIVER_ID]);
      expect(slices.length).toBeGreaterThanOrEqual(1);
    }
  );
});
