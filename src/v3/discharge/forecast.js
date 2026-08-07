'use strict';

import {
  dischargeVariable,
  fetchZarrValues,
  getCoordinateValues,
  getTimeCoordinateValues,
  memberVariable,
  resolveRiverIndex
} from "./zarrFetchers.js";
import membersToStats from "./membersToStats.js";
import {forecastZarr} from "../urls.js";

export default async function ({date, riverIndex, riverId}) {
  /*
  The dimension order is (member, time, riverId)
  Retrieves the ensemble forecast discharge for a given riverId and initialization date. The
  returns an object of structure:
  {
    riverIndex: Number,
    riverId: Number,
    time: [Date, Date, ...],
    discharge: [
      [Number, Number, ...],   // one subarray per member, in member coordinate order
      [Number, Number, ...],
      ...
    ],
    stats: {
      min: [Number, Number, ...],
      p20: [Number, Number, ...],
      ... // etc, see membersToStats
    }
  }
  Every member covers the whole time axis at the same uniform step with no missing values, so
  every returned timestep carries a full ensemble.
  */
  const zarrUrl = forecastZarr({date});
  const resolvedIdx = await resolveRiverIndex({zarrUrl, riverIndex, riverId});
  let [time, memberIds, discharge] = await Promise.all([
    getTimeCoordinateValues({zarrUrl}),
    getCoordinateValues({zarrUrl, variable: memberVariable}),
    fetchZarrValues({zarrUrl, variable: dischargeVariable, selection: [null, null, resolvedIdx]})
  ]);
  // discharge has shape of [memberIds.length, time.length] but it's flattened, so split it back into one subarray per member
  discharge = memberIds.map((_, i) => discharge.slice(i * time.length, (i + 1) * time.length));
  return {riverIndex: resolvedIdx, riverId, time, discharge, stats: membersToStats(discharge)}
}
