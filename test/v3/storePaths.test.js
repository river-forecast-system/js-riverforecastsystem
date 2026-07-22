import {afterEach, beforeAll, describe, expect, it} from "vitest";
import forecast from "../../src/v3/discharge/forecast.js";
import forecastsBulk from "../../src/v3/discharge/forecastsBulk.js";
import retrospective from "../../src/v3/discharge/retrospective.js";
import returnPeriods from "../../src/v3/discharge/returnPeriods.js";
import maximums from "../../src/v3/discharge/maximums.js";
import {FloodMapsIndex} from "../../src/v3/floodmaps/index.js";
import {configure} from "../../src/v3/config.js";
import {floodMapsBase, floodMapsTileBoundaries, forecastZarr} from "../../src/v3/urls.js";

const BASE = "https://example.test/v3";
const realFetch = globalThis.fetch;

// the base url is global config now, set once — no reader takes a baseUrl
beforeAll(() => configure({v3Base: BASE}));

// Record every url a fetcher asks for, answering 404 so it gives up after the first request. The
// point is the path it walked, which is the part that has to track data/diagram.md.
function recordFetches() {
  const urls = [];
  globalThis.fetch = async (input) => {
    urls.push(typeof input === "string" ? input : input.url);
    return new Response(null, {status: 404});
  };
  return urls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("v3 store paths", () => {
  it("reads retrospective discharge from one store per resolution", async () => {
    const urls = recordFetches();
    await expect(retrospective({resolution: "daily", riverId: 1})).rejects.toThrow();
    expect(urls[0]).toBe(`${BASE}/retrospective/daily.zarr/riverId/zarr.json`);
  });

  it("reads return periods from the retrospective tree", async () => {
    const urls = recordFetches();
    await expect(returnPeriods({riverId: 1})).rejects.toThrow();
    expect(urls[0]).toBe(`${BASE}/retrospective/return-periods.zarr/riverId/zarr.json`);
  });

  it("reads annual maximums from the retrospective tree", async () => {
    const urls = recordFetches();
    await expect(maximums({riverId: 1})).rejects.toThrow();
    expect(urls[0]).toBe(`${BASE}/retrospective/maximums.zarr/riverId/zarr.json`);
  });

  it("reads forecasts from the date-partitioned tree", async () => {
    const urls = recordFetches();
    await expect(forecast({date: "2026-07-18", riverId: 1})).rejects.toThrow();
    expect(urls[0]).toBe(`${BASE}/forecasts15/year=2026/month=07/day=18/discharge.zarr/riverId/zarr.json`);
  });

  it("reads bulk forecasts from the same store as a single river forecast", async () => {
    const urls = recordFetches();
    await expect(forecastsBulk({date: "2026-07-19", riverIds: [1, 2]})).rejects.toThrow();
    for (const url of urls) {
      expect(url.startsWith(`${BASE}/forecasts15/year=2026/month=07/day=19/discharge.zarr/`)).toBe(true);
    }
  });

  it("takes the date with or without dashes and rejects anything else", () => {
    const partitioned = `${BASE}/forecasts15/year=2026/month=07/day=18/discharge.zarr`;
    expect(forecastZarr({date: "2026-07-18"})).toBe(partitioned);
    expect(forecastZarr({date: "20260718"})).toBe(partitioned);
    expect(() => forecastZarr({date: "18-07-2026"})).toThrow(/Invalid date format/);
    expect(() => forecastZarr({date: "2026-7-8"})).toThrow(/Invalid date format/);
  });

  it("reads the flood library from the flood-maps tree, manifest first", async () => {
    expect(floodMapsBase()).toBe(`${BASE}/flood-maps`);
    expect(floodMapsTileBoundaries()).toBe(`${BASE}/flood-maps/tile_boundaries.pmtiles`);
    const urls = recordFetches();
    // 404 on the manifest is the first thing FloodMapsIndex does, so this is the whole path it walks
    // before it knows any tile exists.
    await expect(FloodMapsIndex.open()).rejects.toThrow(/manifest\.json not found/);
    expect(urls[0]).toBe(`${BASE}/flood-maps/manifest.json`);
  });

  it("rejects resolutions that have no store", async () => {
    await expect(retrospective({resolution: "weekly", riverId: 1})).rejects.toThrow(/Invalid resolution/);
  });
});
