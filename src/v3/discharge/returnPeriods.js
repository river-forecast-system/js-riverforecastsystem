'use strict';

import {fetchZarrValues, getCoordinateValues, resolveRiverIndex} from "./zarrFetchers.js";
import {returnPeriodsZarr} from "../urls.js";

// the interval axis is named recurrence_interval in v3 (return_period in v2); the store also
// carries annual_exceedance_probability over the same axis
const recurrenceVariable = "recurrence_interval"

// v3 fits the Gumbel distribution twice — once to the annual maxima of the hourly series and once
// to those of the daily means — and publishes both as separate variables (v2 had the single
// `gumbel`). Hourly is the default because it is the one a forecast hydrograph is comparable to:
// the forecast is an instantaneous series, so an hourly-derived threshold is the like-for-like
// exceedance. Daily is the right fit for a daily-mean series, e.g. the retrospective charts.
const allowedResolutions = ["hourly", "daily"];

export default async function ({riverIndex, riverId, resolution = "hourly"}) {
  /*
  The dimension order is (returnPeriod, riverId)
  Retrieves return period discharge values for a given riverId.
  The returns an object where the keys are integer return period values (in years) and the values are discharge values (in m3/s) of structure:
  {
    [returnPeriod]: dischargeValue,
    ...
  }
   */
  if (!allowedResolutions.includes(resolution)) {
    throw new Error(`Invalid resolution: ${resolution}. Must be one of ${allowedResolutions.join(", ")}.`);
  }
  const zarrUrl = returnPeriodsZarr();

  const resolvedIdx = await resolveRiverIndex({zarrUrl, riverIndex, riverId});
  const [labels, returnPeriods] = await Promise.all([
    getCoordinateValues({zarrUrl, variable: recurrenceVariable}),
    fetchZarrValues({zarrUrl, variable: `gumbel_${resolution}`, selection: [null, resolvedIdx]})
  ]);
  return labels.reduce((acc, label, i) => {
    acc[Number(label)] = Number(returnPeriods[i]);
    return acc;
  }, {});
}
