'use strict';

import {dischargeVariable, fetchZarrValues, getTimeCoordinateValues, resolveRiverIndex} from "./zarrFetchers.js";
import {maximumsZarr} from "../urls.js";

export default async function ({riverIndex, riverId}) {
  /*
  The dimension order is (time, riverId)
  Retrieves the annual maximum discharge series for a given riverId — one value per year of the
  retrospective simulation, which is what the return period fits are derived from. The returns an
  object of structure:
  {
    riverIndex: Number,
    time: [Date, Date, ...],
    discharge: [Number, Number, ...],
  }
   */
  const zarrUrl = maximumsZarr();
  const resolvedIdx = await resolveRiverIndex({zarrUrl, riverIndex, riverId});
  const [time, discharge] = await Promise.all([
    getTimeCoordinateValues({zarrUrl}),
    fetchZarrValues({zarrUrl, variable: dischargeVariable, selection: [null, resolvedIdx]})
  ])
  return {riverIndex: resolvedIdx, time, discharge}
}
