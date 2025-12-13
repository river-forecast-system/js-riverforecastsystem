'use strict';

import {fetchZarrValues, getTimeCoordinateValues, resolveRiverIdToIndex} from "./zarrFetchers.js";

const retrospectiveDischargeVariable = "Q"

const s3Uri = "http://geoglows-v2.s3-us-west-2.amazonaws.com"
const cloudfrontUri = "https://d2grb3c773p1iz.cloudfront.net"

export default async function ({baseUrl, resolution = 'daily', riverId, idx}) {
  /*
  The dimension order is (time, riverId)
  Retrieves retrospective discharge for a given riverId. The returns an object of structure:
  {
    datetime: [Date, Date, ...],
    discharge: [Number, Number, ...],
  }
   */
  // resolution should be hourly, daily, monthly, yearly
  if (!['hourly', 'daily', 'monthly', 'yearly'].includes(resolution)) {
    throw new Error(`Invalid resolution: ${resolution}. Must be one of 'hourly', 'daily', 'monthly', 'yearly'.`)
  }
  if (['monthly', 'yearly'].includes(resolution)) {
    resolution = `${resolution}-timeseries`;
  }
  const zarrUrl = `${baseUrl ? baseUrl : s3Uri}/retrospective/${resolution}.zarr`;
  const resolvedIdx = await resolveRiverIdToIndex({zarrUrl, riverId, idx, idVariable: 'river_id'});
  const [time, discharge] = await Promise.all([
    getTimeCoordinateValues({zarrUrl}),
    fetchZarrValues({zarrUrl, variable: retrospectiveDischargeVariable, selection: [null, resolvedIdx]})
  ])
  return {time, discharge}
}
