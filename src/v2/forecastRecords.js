'use strict';

import {fetchZarrValues, getTimeCoordinateValues, resolveRiverIdToIndex} from "./zarrFetchers.js";
import listDates from "./dates.js";

// website endpoint for object reads (matches forecast.js); dates() uses the REST endpoint to list
const s3Uri = "http://geoglows-v2-forecasts.s3-website-us-west-2.amazonaws.com";
const nEnsMembers = 51; // members 1..51; the 52nd (high-resolution) member is excluded, per pygeoglows

// numpy's default "linear" percentile over an ascending-sorted array
const percentile = (sortedAsc, p) => {
  const n = sortedAsc.length;
  if (n === 1) return sortedAsc[0];
  const rank = (p / 100) * (n - 1);
  const lo = Math.floor(rank), hi = Math.ceil(rank);
  return lo === hi ? sortedAsc[lo] : sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (rank - lo);
};

const dateToInit = yyyymmdd => new Date(Date.UTC(
  Number(yyyymmdd.slice(0, 4)), Number(yyyymmdd.slice(4, 6)) - 1, Number(yyyymmdd.slice(6, 8))
));

// Run an async mapper over items with at most `limit` concurrent, preserving order.
const mapLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i]); } };
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return results;
};

export default async function ({baseUrl, riverId, idx, startDate, endDate} = {}) {
  /*
  Assembles a continuous forecast record for a river by concatenating the near-term portion of each
  daily forecast between startDate and endDate (YYYYMMDD, inclusive). For each forecast day this uses
  pygeoglows' "simple forecast" statistic (median / 80th / 20th percentile over the 51 ensemble
  members, excluding the high-resolution member), keeping only the timesteps before the next available
  forecast so segments do not overlap. Returns:
  {
    time: [Date, ...],
    flow_median: [Number, ...],
    flow_uncertainty_upper: [Number, ...],  // 80th percentile
    flow_uncertainty_lower: [Number, ...],  // 20th percentile
  }
  */
  if (!startDate || !endDate) throw new Error("Both 'startDate' and 'endDate' (YYYYMMDD) are required.");

  const bucketUrl = baseUrl ? baseUrl : s3Uri;
  const available = (await listDates(baseUrl ? {baseUrl} : {})).sort();
  const dates = available.filter(d => d >= startDate && d <= endDate);
  if (dates.length === 0) {
    throw new Error(`No forecasts available between ${startDate} and ${endDate}.`);
  }

  // The river's index in the rivid coordinate is the same across daily forecasts,
  // so resolve it once (not per date — that re-read the full rivid array every time).
  let resolvedIdx = idx;
  if (resolvedIdx === undefined) {
    resolvedIdx = await resolveRiverIdToIndex({zarrUrl: `${bucketUrl}/${dates[0]}00.zarr`, riverId, idx, idVariable: "rivid"});
  }

  // Fetch each day's time axis + Qout in parallel (bounded, to avoid overwhelming S3).
  const fetched = await mapLimit(dates, 6, async date => {
    const zarrUrl = `${bucketUrl}/${date}00.zarr`;
    const [time, flat] = await Promise.all([
      getTimeCoordinateValues({zarrUrl}),
      fetchZarrValues({zarrUrl, variable: "Qout", selection: [{start: 0, stop: nEnsMembers, step: 1}, null, resolvedIdx]}),
    ]);
    return {time, flat};
  });

  // Assemble in date order: keep each day's timesteps before the next forecast's init.
  const record = {time: [], flow_median: [], flow_uncertainty_upper: [], flow_uncertainty_lower: []};
  for (let i = 0; i < dates.length; i++) {
    // gaps in the archive naturally extend the preceding segment; the final day keeps its full horizon.
    const cutoff = i + 1 < dates.length ? dateToInit(dates[i + 1]) : null;
    const {time, flat} = fetched[i];
    const nT = time.length; // flat is [member, time] row-major

    for (let t = 0; t < nT; t++) {
      if (cutoff && time[t] >= cutoff) break; // timesteps are ordered; nothing later qualifies
      const members = [];
      for (let m = 0; m < nEnsMembers; m++) members.push(flat[m * nT + t]);
      if (members.some(v => v === null || Number.isNaN(v))) continue; // dropna
      members.sort((a, b) => a - b);
      record.time.push(time[t]);
      record.flow_median.push(percentile(members, 50));
      record.flow_uncertainty_upper.push(percentile(members, 80));
      record.flow_uncertainty_lower.push(percentile(members, 20));
    }
  }
  return record;
}
