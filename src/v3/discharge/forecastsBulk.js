'use strict';

import {get, slice} from "zarrita";
import {
  dischargeVariable,
  getTimeCoordinateValues,
  openZarrArray,
  resolveRiverIdsToIndices,
  roundValue
} from "./zarrFetchers.js";
import membersToMedian from "./membersToMedian.js";
import {forecastZarr} from "../urls.js";

// TODO: revisit whether caching and read strategy belong in this package at all — see TODO.md.
// callers pass store rows, so opening a store no longer has to pull the riverId coordinate — the
// one array with an entry per river in the model, and previously the expensive part of this. Only
// the time axis is read up front — the member count comes off the read's own shape, so the member
// coordinate is never fetched. Stores are still cached per url so repeated selections against one
// forecast share it.
const stores = new Map();

const openForecastStore = async ({zarrUrl}) => {
  const [discharge, time] = await Promise.all([
    openZarrArray({zarrUrl, variable: dischargeVariable}),
    getTimeCoordinateValues({zarrUrl})
  ]);
  return {discharge, time};
}

const getForecastStore = ({zarrUrl}) => {
  let store = stores.get(zarrUrl);
  if (!store) {
    store = openForecastStore({zarrUrl}).catch(e => {
      stores.delete(zarrUrl);
      throw e;
    });
    stores.set(zarrUrl, store);
  }
  return store;
}

export default async function ({date, riverIndices, riverIds, onProgress}) {
  /*
  The dimension order is (member, time, riverId)
  Retrieves the ensemble forecast for many rivers in one pass, which is what drives the flood
  extent animation. Only the median survives per reach — see membersToMedian. The returns an
  object of structure:
  {
    date: String,
    time: [Date, Date, ...],
    forecasts: Map(key -> {riverIndex, median, peak, memberCount}),
    missing: [Number, Number, ...],  // requested reaches outside this forecast's river axis
  }
  where `key` is whatever identified the reach on the way in — a riverIndex if riverIndices was
  passed, a riverId if riverIds was — so a caller that identifies reaches by id downstream (the
  flood library keys its rivers by riverId) does not have to translate the results back.

  riverIndices are store rows, which is what the vector tiles already carry per reach. riverIds is
  a deprecated fallback: it costs a scan of the riverId coordinate to translate, so a caller that
  has indices should pass them.

  Discharge is chunked across the river axis (tens of MB per chunk), so reads are grouped by chunk
  and each chunk is pulled exactly once. A flood corridor's reaches are adjacent in the store, so a
  whole selection usually costs one or two chunks instead of one per reach.

  Rows outside the store's river axis are reported in missing rather than throwing. A selection
  can legitimately mix reaches that do and don't appear in a given forecast run.

  The time axis is uniform and every member populates every step, so the returned axis is the
  store's own: each step is a real forecast and no interpolation or compaction is needed.
  */
  const zarrUrl = forecastZarr({date});
  const store = await getForecastStore({zarrUrl});
  const forecasts = new Map();
  const missing = [];
  const keys = riverIndices ?? riverIds;
  const rows = riverIndices ?? await resolveRiverIdsToIndices({zarrUrl, riverIds});
  // bucket the rows by chunk
  const byChunk = new Map();
  const chunkLen = store.discharge.chunks[2];
  const nRivers = store.discharge.shape[2];
  keys.forEach((key, i) => {
    const riverIndex = Number(rows[i]);
    if (!Number.isInteger(riverIndex) || riverIndex < 0 || riverIndex >= nRivers) {
      missing.push(key);
      return;
    }
    const c = Math.floor(riverIndex / chunkLen);
    const bucket = byChunk.get(c);
    if (bucket) bucket.push([key, riverIndex]);
    else byChunk.set(c, [[key, riverIndex]]);
  });
  let done = 0;
  const found = keys.length - missing.length;
  for (const bucket of byChunk.values()) {
    // one read per chunk, spanning only the rows actually wanted inside it
    const lo = Math.min(...bucket.map(([, riverIndex]) => riverIndex));
    const hi = Math.max(...bucket.map(([, riverIndex]) => riverIndex));
    const sel = await get(store.discharge, [null, null, slice(lo, hi + 1)]);
    const data = sel.data;
    const [nEns, nT] = sel.shape;
    const [sEns, sT, sR] = sel.stride;
    for (const [key, riverIndex] of bucket) {
      const r = (riverIndex - lo) * sR;
      // split into one series per member, the shape membersToMedian takes. This is transient: only
      // the median it returns is kept, so a selection holds one reach's ensemble at a time rather
      // than every reach's at once.
      // This path reads the selection's buffer directly rather than through fetchZarrValues, so it
      // has to apply the same 2-decimal rounding itself — see the note there on bitrounding.
      // Rounding here rather than on the median is what keeps this reader's output identical to
      // the single-river one: membersToMedian picks a member's value rather than averaging two, so
      // a rounded input is a rounded output.
      const discharge = Array.from({length: nEns}, (_, e) => {
        const member = new Float64Array(nT);
        for (let t = 0; t < nT; t++) member[t] = roundValue(data[e * sEns + t * sT + r]);
        return member;
      });
      forecasts.set(key, {riverIndex, ...membersToMedian(discharge)});
      onProgress?.(++done, found);
    }
  }
  return {date, time: store.time, forecasts, missing}
}
