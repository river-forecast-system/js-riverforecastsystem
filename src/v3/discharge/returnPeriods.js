'use strict';

import {fetchZarrValues, getCoordinateValues, resolveRiverIndex} from "./zarrFetchers.js";
import {returnPeriodsZarr} from "../urls.js";

// the interval axis is named recurrence_interval in v3 (return_period in v2); the store also
// carries annual_exceedance_probability over the same axis
const recurrenceVariable = "recurrence_interval"

export default async function ({riverIndex, riverId}) {
  /*
  The dimension order is (returnPeriod, riverId)
  Retrieves return period discharge values for a given riverId.
  The returns an object where the keys are integer return period values (in years) and the values are discharge values (in m3/s) of structure:
  {
    [returnPeriod]: dischargeValue,
    ...
  }
   */
  const zarrUrl = returnPeriodsZarr();

  const resolvedIdx = await resolveRiverIndex({zarrUrl, riverIndex, riverId});
  const [labels, returnPeriods] = await Promise.all([
    getCoordinateValues({zarrUrl, variable: recurrenceVariable}),
    fetchZarrValues({zarrUrl, variable: 'gumbel', selection: [null, resolvedIdx]})
  ]);
  return labels.reduce((acc, label, i) => {
    acc[Number(label)] = Number(returnPeriods[i]);
    return acc;
  }, {});
}
