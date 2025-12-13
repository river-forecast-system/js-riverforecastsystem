'use strict';

import {fetchZarrValues, getCoordinateValues, resolveRiverIdToIndex} from "./zarrFetchers.js";

const s3Uri = "http://geoglows-v2.s3-us-west-2.amazonaws.com"
const cloudfrontUri = "https://d2grb3c773p1iz.cloudfront.net"

export default async function ({baseUrl, riverId, idx}) {
  /*
  The dimension order is (returnPeriod, riverId)
  Retrieves return period discharge values for a given riverId.
  The returns an object where the keys are integer return period values (in years) and the values are discharge values (in m3/s) of structure:
  {
    [returnPeriod]: dischargeValue,
    ...
  }
   */
  const zarrUrl = `${baseUrl ? baseUrl : s3Uri}/retrospective/return-periods.zarr`;

  const resolvedIdx = await resolveRiverIdToIndex({zarrUrl, riverId, idx, idVariable: 'river_id'});
  const [labels, returnPeriods] = await Promise.all([
    getCoordinateValues({zarrUrl, variable: 'return_period'}),
    fetchZarrValues({zarrUrl, variable: 'gumbel', selection: [null, resolvedIdx]})
  ]);
  return labels.reduce((acc, label, i) => {
    acc[Number(label)] = Number(returnPeriods[i]);
    return acc;
  }, {});
}
