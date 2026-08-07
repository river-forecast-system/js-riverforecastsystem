import {describe, expect, it} from "vitest";
import {get, open} from "zarrita";
import {DECIMAL_PLACES, roundValue, roundValues} from "../../src/v3/discharge/zarrFetchers.js";

// A real zarr v3 chunk: eight float32s encoded bytes -> blosc(cname=zstd, clevel=5, shuffle),
// exactly the pipeline the v3 stores are written with. Held as base64 so the test needs no
// compressor at runtime. Regenerate with zarr-python:
//
//   zarr.create_array(store=..., shape=(2, 4), chunks=(2, 4), dtype="float32", zarr_format=3,
//                     compressors=[BloscCodec(typesize=4, cname="zstd", clevel=5,
//                                             shuffle="shuffle")])
const CHUNK_B64 = "AgGTBCAAAAAgAAAAMAAAAKBwRUEK16M7AADkwCtSmkQAAAAAff/HQtAPSUBIAXpD";

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
    {name: "blosc", configuration: {typesize: 4, cname: "zstd", clevel: 5, shuffle: "shuffle", blocksize: 0}},
  ],
  attributes: {},
};

// zarrita only asks a store for `get(key)`, so an in-memory one is enough to exercise the whole
// codec pipeline without a network.
const memoryStore = (meta, key, b64) => {
  const entries = new Map([
    ["/zarr.json", new TextEncoder().encode(JSON.stringify(meta))],
    [key, Uint8Array.from(atob(b64), c => c.charCodeAt(0))],
  ]);
  return {get: async (k) => entries.get(k)};
}

describe("blosc decoding", () => {
  it("decodes a blosc(zstd, shuffle) chunk through zarrita's default registry", async () => {
    // Nothing registers a codec by hand. zarrita maps "blosc" to numcodecs/blosc out of the box,
    // and rollup.config.js is what keeps that one wasm build — and only that one — in the bundle.
    const node = await open.v3(memoryStore(ARRAY_METADATA, "/c/0/0", CHUNK_B64), {kind: "array"});
    const chunk = await get(node, null);
    expect(Array.from(chunk.data)).toEqual(EXPECTED_RAW);
  });

  it("decodes a 64-bit array, where a non-zero byteOffset would break the bytes codec", async () => {
    // zarrita's `bytes` codec builds the chunk with `new BigInt64Array(bytes.buffer,
    // bytes.byteOffset, …)`, and a TypedArray constructor rejects an offset that is not a multiple
    // of its element size. A decompressor that hands back a view into its own scratch buffer at a
    // ragged offset therefore fails on exactly the int64 time coordinate every store carries — the
    // failure mode the previous fzstd-backed codec had to copy around. numcodecs' blosc returns a
    // fresh zero-offset buffer; this pins that so a numcodecs upgrade cannot quietly regress it.
    const meta = {
      ...ARRAY_METADATA,
      shape: [5],
      data_type: "int64",
      chunk_grid: {name: "regular", configuration: {chunk_shape: [5]}},
      codecs: [
        {name: "bytes", configuration: {endian: "little"}},
        {name: "blosc", configuration: {typesize: 8, cname: "zstd", clevel: 5, shuffle: "shuffle", blocksize: 0}},
      ],
    };
    const b64 = "AgGTCCgAAAAoAAAAOAAAAAEAAAAAAAAAAgAAAAAAAAADAAAAAAAAAAAA72S6P0kY+/////////8=";
    const node = await open.v3(memoryStore(meta, "/c/0", b64), {kind: "array"});
    const chunk = await get(node, null);
    expect(Array.from(chunk.data)).toEqual([1n, 2n, 3n, 1750000000000000000n, -5n]);
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
