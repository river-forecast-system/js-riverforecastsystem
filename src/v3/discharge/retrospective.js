'use strict';

import {dischargeVariable, fetchZarrValues, getTimeCoordinateValues, resolveRiverIndex} from "./zarrFetchers.js";
import {retrospectiveZarr} from "../urls.js";


export default async function ({resolution = 'daily', riverIndex, riverId}) {
  /*
  The dimension order is (time, riverId)
  Retrieves retrospective discharge for a given riverId. The returns an object of structure:
  {
    riverId: Number,
    time: [Date, Date, ...],
    Q: [Number, Number, ...],
  }
   */
  const zarrUrl = retrospectiveZarr({resolution});
  const resolvedIdx = await resolveRiverIndex({zarrUrl, riverIndex, riverId});
  const [time, discharge] = await Promise.all([
    getTimeCoordinateValues({zarrUrl}),
    fetchZarrValues({zarrUrl, variable: dischargeVariable, selection: [null, resolvedIdx]})
  ])
  return {riverIndex: resolvedIdx, time, discharge}
}
