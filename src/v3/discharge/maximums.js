'use strict';

import {fetchZarrValues, getTimeCoordinateValues, resolveRiverIndex} from "./zarrFetchers.js";
import {maximumsZarr} from "../urls.js";

// maximums.zarr has no Q: it carries the annual maxima of the hourly series and of the daily means
// as separate arrays named for the series, the same two the return period fits are derived from.
const allowedResolutions = ["hourly", "daily"];

export default async function ({riverIndex, riverId, resolution = "hourly"}) {
  /*
  The dimension order is (riverId, time)
  Retrieves the annual maximum discharge series for a given riverId — one value per year of the
  retrospective simulation, which is what the return period fits are derived from. The returns an
  object of structure:
  {
    riverIndex: Number,
    time: [Date, Date, ...],
    discharge: [Number, Number, ...],
  }
   */
  if (!allowedResolutions.includes(resolution)) {
    throw new Error(`Invalid resolution: ${resolution}. Must be one of ${allowedResolutions.join(", ")}.`);
  }
  const zarrUrl = maximumsZarr();
  const resolvedIdx = await resolveRiverIndex({zarrUrl, riverIndex, riverId});
  const [time, discharge] = await Promise.all([
    getTimeCoordinateValues({zarrUrl}),
    fetchZarrValues({zarrUrl, variable: resolution, selection: [null, resolvedIdx]})
  ])
  return {riverIndex: resolvedIdx, time, discharge}
}
