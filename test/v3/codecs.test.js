import {describe, expect, it} from "vitest";
import {get, open} from "zarrita";
import {registerCodecs, ShuffleCodec} from "../../src/v3/codecs.js";
import {DECIMAL_PLACES, roundValue, roundValues} from "../../src/v3/discharge/zarrFetchers.js";

// A real zarr v3 chunk: eight float32s encoded bytes -> shuffle -> zstd, exactly the pipeline the
// v3 stores are being rewritten with. Held as base64 so the test needs no compressor at runtime.
// Regenerate by shuffling the raw little-endian bytes and piping them through `zstd -19`.
const CHUNK_B64 = "KLUv/SQgAQEAoAoAKwB90Ehw1wBSAP8PAUWj5JoAx0l6QTvARABCQEOYwCOL";

// The values as float32 sees them — deliberately ragged in the way bitrounded data is.
const EXPECTED_RAW = [
  12.339996337890625,
  0.004999999888241291,
  -7.125,
  1234.5677490234375,
  0,
  99.9990005493164,
  3.141590118408203,
  250.0050048828125,
];

const ARRAY_METADATA = {
  zarr_format: 3,
  node_type: "array",
  shape: [2, 4],
  data_type: "float32",
  chunk_grid: {name: "regular", configuration: {chunk_shape: [2, 4]}},
  chunk_key_encoding: {name: "default", configuration: {separator: "/"}},
  fill_value: 0,
  codecs: [
    {name: "bytes", configuration: {endian: "little"}},
    {name: "shuffle", configuration: {elementsize: 4}},
    {name: "zstd", configuration: {level: 19, checksum: false}},
  ],
  attributes: {},
};

// zarrita only asks a store for `get(key)`, so an in-memory one is enough to exercise the whole
// codec pipeline without a network.
const memoryStore = () => {
  const entries = new Map([
    ["/zarr.json", new TextEncoder().encode(JSON.stringify(ARRAY_METADATA))],
    ["/c/0/0", Uint8Array.from(atob(CHUNK_B64), c => c.charCodeAt(0))],
  ]);
  return {get: async (key) => entries.get(key)};
}

describe("zstd + shuffle decoding", () => {
  it("decodes a shuffle+zstd chunk through zarrita without numcodecs", async () => {
    registerCodecs();
    const node = await open.v3(memoryStore(), {kind: "array"});
    const chunk = await get(node, null);
    expect(Array.from(chunk.data)).toEqual(EXPECTED_RAW);
  });

  it("registers both the zarr v3 and numcodecs spellings of each codec", async () => {
    registerCodecs();
    const {registry} = await import("zarrita");
    for (const name of ["zstd", "numcodecs.zstd", "shuffle", "numcodecs.shuffle"]) {
      expect(registry.get(name)).toBeDefined();
    }
  });

  it("takes the element width from the array dtype, not just the codec config", () => {
    // A store whose config claims 4 but whose dtype is 8 wide must follow the dtype, or every
    // value comes back as garbage rather than as an error.
    const codec = ShuffleCodec.fromConfig({elementsize: 4}, {dataType: "float64"});
    const src = new Float64Array([1.5, -2.25, 3.125]);
    const raw = new Uint8Array(src.buffer.slice(0));
    const shuffled = new Uint8Array(raw.length);
    const n = src.length;
    for (let b = 0; b < 8; b++) for (let i = 0; i < n; i++) shuffled[b * n + i] = raw[i * 8 + b];
    expect(Array.from(new Float64Array(codec.decode(shuffled).buffer))).toEqual([1.5, -2.25, 3.125]);
  });

  it("refuses a dtype it cannot size", () => {
    expect(() => ShuffleCodec.fromConfig({}, {dataType: "string"})).toThrow(/fixed-size dtype/);
  });
});

describe("rounding retrieved values", () => {
  it("rounds the ragged decimals bitrounding leaves behind", () => {
    // 0.004999999888 rounds to 0, not to 0.01: the float32 value is just under the halfway point,
    // which is the honest answer for a number bitrounding has already thrown precision away from.
    // -7.125 goes to -7.12 because Math.round breaks ties toward +Infinity. Discharge is never
    // negative so that asymmetry is unreachable in practice, but it is what this does.
    expect(roundValues(EXPECTED_RAW)).toEqual([12.34, 0, -7.12, 1234.57, 0, 100, 3.14, 250.01]);
  });

  // Exact decimal halves are not worth asserting against: 1.005 as a float64 is really
  // 1.00499999999999989, so "round the half up" has no stable answer and the data never contains
  // one anyway. These are the properties a consumer actually relies on.
  it("never returns more than two decimals, and never moves a value by more than half a cent", () => {
    const samples = [0, 0.001, 0.005, 1.005, 2.675, 12.339996337890625, -7.125, 99.9990005493164,
      1234.5677490234375, 250.0050048828125, 1e-9, 987654.321];
    for (const rounded of roundValues(samples)) {
      expect(Number(rounded.toFixed(2))).toBe(rounded);
    }
    roundValues(samples).forEach((rounded, i) => {
      expect(Math.abs(rounded - samples[i])).toBeLessThanOrEqual(0.005 + 1e-9);
    });
  });

  it("passes NaN and infinities through, so fill values survive", () => {
    expect(roundValue(NaN)).toBeNaN();
    expect(roundValue(Infinity)).toBe(Infinity);
    expect(roundValue(-Infinity)).toBe(-Infinity);
  });

  it("leaves values already at or below the precision alone", () => {
    expect(roundValues([0, 1, 12.3, 12.34, -5])).toEqual([0, 1, 12.3, 12.34, -5]);
  });

  it("rounds to the documented precision", () => {
    expect(DECIMAL_PLACES).toBe(2);
  });
});
