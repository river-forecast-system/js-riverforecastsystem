'use strict';

// Codec registration for the v3 stores.
//
// zarrita ships a codec registry whose zstd and blosc entries dynamic-import numcodecs, which are
// Emscripten builds carrying inlined base64 wasm — 757 KB for zstd and 615 KB for blosc. The v3
// stores are written with shuffle + zstd rather than blosc precisely so that a browser client can
// decode them with plain JavaScript: fzstd is ~25 KB and shuffle is the thirty lines below. We
// override the registry entries before any array is opened so those numcodecs chunks are never
// requested, and a consuming app's bundler never has a reason to load them.
//
// Decode only. Nothing in this package writes zarr, fzstd has no compressor, and a silently
// missing encode path would be worse than an explicit throw.

import {decompress} from "fzstd";
import {registry} from "zarrita";

// zarr v3 spells the dtype as "float32"/"int16"/"uint8"; the trailing number is the width in bits.
// Shuffle needs the element width to know how far apart a value's bytes were spread.
const bytesPerElement = (dataType) => {
  const bits = /(\d+)$/.exec(dataType ?? "")?.[1];
  if (!bits) return undefined;
  return Number(bits) / 8;
}

class ZstdCodec {
  kind = "bytes_to_bytes";

  static fromConfig() {
    return new ZstdCodec();
  }

  // fzstd hands back a view into its own scratch buffer, and that view starts at whatever byte
  // offset the decompressor happened to land on (12, in practice) rather than at 0. zarrita's
  // `bytes` codec then builds the chunk with `new BigInt64Array(bytes.buffer, bytes.byteOffset, …)`,
  // and a TypedArray constructor rejects an offset that is not a multiple of its element size — so
  // any int64/float64 array whose codec chain is just bytes+zstd fails to decode at all. Arrays
  // that also carry shuffle survive only by accident: undoing the shuffle allocates a fresh
  // zero-offset buffer, which is why the shuffled data arrays read fine and the plain time
  // coordinate does not.
  //
  // Copy only when the view is offset. It is one pass over an already-decompressed chunk, and it
  // falls on the unshuffled coordinate arrays rather than the bulky data arrays.
  decode(bytes) {
    const decompressed = decompress(bytes);
    return decompressed.byteOffset === 0 ? decompressed : new Uint8Array(decompressed);
  }

  encode() {
    throw new Error("zstd encoding is not supported: rfsjs reads zarr, it does not write it.");
  }
}

class ShuffleCodec {
  kind = "bytes_to_bytes";
  #elementSize;

  constructor(elementSize) {
    this.#elementSize = elementSize;
  }

  static fromConfig(configuration, meta) {
    // The array's own dtype is authoritative — the config's elementsize is what the writer claimed.
    // They agree in practice; prefer the dtype so a store written with a stale config still decodes.
    const size = bytesPerElement(meta?.dataType) ?? configuration?.elementsize;
    if (!size) {
      throw new Error(`shuffle codec requires a fixed-size dtype, got "${meta?.dataType}"`);
    }
    return new ShuffleCodec(size);
  }

  // Shuffle groups the nth byte of every element together. Undoing it interleaves them back.
  decode(bytes) {
    const elementSize = this.#elementSize;
    if (elementSize === 1) return bytes;
    const nElements = Math.floor(bytes.length / elementSize);
    const result = new Uint8Array(bytes.length);
    for (let byte = 0; byte < elementSize; byte++) {
      const offset = byte * nElements;
      for (let i = 0; i < nElements; i++) {
        result[i * elementSize + byte] = bytes[offset + i];
      }
    }
    return result;
  }

  encode() {
    throw new Error("shuffle encoding is not supported: rfsjs reads zarr, it does not write it.");
  }
}

let registered = false;

// Called from openZarrArray rather than run as an import side effect: rollup.config.js sets
// treeshake.moduleSideEffects false for everything that isn't a chartjs plugin, so a bare
// `import "./codecs.js"` would be dropped from the build and the override would silently never
// happen. An explicit call is a reference the bundler has to keep.
const registerCodecs = () => {
  if (registered) return;
  registered = true;
  // Both spellings: zarr v3 names the codec "zstd"/"shuffle", while an array written through
  // numcodecs.zarr3 names it "numcodecs.zstd"/"numcodecs.shuffle". Same bytes either way.
  registry.set("zstd", () => ZstdCodec);
  registry.set("numcodecs.zstd", () => ZstdCodec);
  registry.set("shuffle", () => ShuffleCodec);
  registry.set("numcodecs.shuffle", () => ShuffleCodec);
}

export {registerCodecs, ShuffleCodec, ZstdCodec};
