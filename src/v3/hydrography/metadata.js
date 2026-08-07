'use strict';

import {get, slice} from "zarrita";
import {openZarrArray} from "../discharge/zarrFetchers.js";
import {hydrographyMetadataZarr} from "../urls.js";

const DEFAULT_CONCURRENCY = 8;

/**
 * Read one array of the hydrography metadata store whole, as the typed array zarrita decoded into.
 *
 * Deliberately not built on getCoordinateValues(): that spreads into a plain Array, which for an
 * axis with an entry per river in the model means millions of boxed numbers where four bytes each
 * would do. Callers of this get the buffer itself and can transfer it between threads.
 *
 * onProgress({done, total}) fires per chunk. `signal` aborts between chunks — mid-flight requests
 * are left to settle and discarded, which costs at most one chunk of wasted bandwidth.
 */
const fetchMetadataArray = async ({variable, group, onProgress, signal, concurrency = DEFAULT_CONCURRENCY} = {}) => {
  if (!variable) throw new Error("fetchMetadataArray requires a variable");
  const node = await openZarrArray({zarrUrl: hydrographyMetadataZarr({group}), variable});
  const total = node.shape[0];
  const step = node.chunks[0];
  if (!total || !step) throw new Error(`${variable}: expected a chunked 1-D array, got shape ${node.shape}`);

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException(`Aborted while reading ${variable}`, "AbortError");
  };

  // The first chunk decides the output type, so it is read alone rather than teaching the pool to
  // allocate. One extra round trip, and no branch on "have we allocated yet" in the hot path.
  throwIfAborted();
  const first = await get(node, [slice(0, Math.min(step, total))]);
  const out = new first.data.constructor(total);
  out.set(first.data, 0);
  let done = Math.min(step, total);
  onProgress?.({done, total});

  const starts = [];
  for (let start = step; start < total; start += step) starts.push(start);

  let next = 0;
  const worker = async () => {
    while (next < starts.length) {
      throwIfAborted();
      const start = starts[next++];
      const end = Math.min(start + step, total);
      const {data} = await get(node, [slice(start, end)]);
      out.set(data, start);
      done += end - start;
      onProgress?.({done, total});
    }
  };
  await Promise.all(Array.from({length: Math.min(concurrency, starts.length)}, worker));

  throwIfAborted();
  return out;
};

/**
 * Read one reach's values out of the metadata store — one position across one or more arrays,
 * returned as `{[variable]: value}`.
 *
 * The counterpart to fetchMetadataArray(): that one is for building something out of a whole axis,
 * this one is for asking about a reach you have already located. A zarr read of a single element
 * still fetches the chunk it sits in — ~40 KB here — so the cost is one request per variable and
 * not one per reach, which is what makes a coordinate something a consumer can look up on demand
 * instead of a table it has to build and keep.
 *
 * `index` is a position on the store's axis: a riverIndex, the same one the discharge readers take.
 */
const fetchMetadataAt = async ({variables, index, group} = {}) => {
  if (!variables?.length) throw new Error("fetchMetadataAt requires at least one variable");
  if (!Number.isInteger(index) || index < 0) throw new Error(`fetchMetadataAt requires a non-negative integer index, got ${index}`);
  const zarrUrl = hydrographyMetadataZarr({group});
  const entries = await Promise.all(variables.map(async (variable) => {
    const node = await openZarrArray({zarrUrl, variable});
    const total = node.shape[0];
    // Past the end of the axis, zarrita reads an empty selection and the value comes back
    // undefined — a bad index has to fail here, where it can still say what was wrong with it.
    if (index >= total) throw new Error(`${variable}: index ${index} is past the end of the axis (${total})`);
    const {data} = await get(node, [slice(index, index + 1)]);
    return [variable, Number(data[0])];
  }));
  return Object.fromEntries(entries);
};

export {fetchMetadataArray, fetchMetadataAt, DEFAULT_CONCURRENCY};
