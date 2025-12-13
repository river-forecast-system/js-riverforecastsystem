'use strict';

import {fetchZarrValues, getTimeCoordinateValues, resolveRiverIdToIndex} from "./zarrFetchers.js";

const s3Uri = "http://geoglows-v2-forecasts.s3-website-us-west-2.amazonaws.com"
const cloudfrontUri = "https://d14ritg1bypdp7.cloudfront.net"
const forecastDischargeVariable = "Qout"

const _membersToStats = membersArray => {
  // takes an array of equally sized subarrays (one for each member) and computes timestep-wise statistics
  const nMembers = membersArray.length
  const nTimesteps = membersArray[0].length
  let stats = {
    min: Array(nTimesteps).fill(0),
    p20: Array(nTimesteps).fill(0),
    p25: Array(nTimesteps).fill(0),
    median: Array(nTimesteps).fill(0),
    p75: Array(nTimesteps).fill(0),
    p80: Array(nTimesteps).fill(0),
    max: Array(nTimesteps).fill(0),
    average: Array(nTimesteps).fill(0),
  }
  Array(nTimesteps).fill(0).forEach((_, idx) => {
    const timestepValues = membersArray.map(member => member[idx]).sort((a, b) => a - b)
    stats.min[idx] = timestepValues[0]
    stats.p20[idx] = timestepValues[Math.floor(0.20 * nMembers)]
    stats.p25[idx] = timestepValues[Math.floor(0.25 * nMembers)]
    stats.median[idx] = timestepValues[Math.floor(0.5 * nMembers)]
    stats.p75[idx] = timestepValues[Math.floor(0.75 * nMembers)]
    stats.p80[idx] = timestepValues[Math.floor(0.80 * nMembers)]
    stats.max[idx] = timestepValues[nMembers - 1]
    stats.average[idx] = timestepValues.reduce((a, b) => a + b, 0) / nMembers
  })
  return stats
}

export default async function ({baseUrl, date, riverId, idx}) {
  /*
  The dimension order is (memberNumber, time, riverId)
  Retrieves 51 member ensemble forecast discharge for a given riverId and initialization date (YYYYMMDD). The returns an object of structure:
  {
    datetime: [Date, Date, ...],
    discharge: [
      [Number, Number, ...],
      [Number, Number, ...],
      ...
    ], // array of arrays, one per ensemble member (51 total)
    stats: {
      min: [Number, Number, ...],
      p20: [Number, Number, ...],
      ... // etc, see _membersToStats function
    }
  }
  */
  const nEnsMems = 51;
  if (!/^\d{8}$/.test(date)) {
    // check that dates are in YYYYMMDD format. the function will add in the 00 hour
    throw new Error(`Invalid date format: ${date}. Must be YYYYMMDD.`);
  }

  const zarrUrl = `${baseUrl ? baseUrl : s3Uri}/${date}00.zarr`;
  const resolvedIdx = await resolveRiverIdToIndex({zarrUrl, riverId, idx, idVariable: 'rivid'});
  let [time, discharge] = await Promise.all([
    getTimeCoordinateValues({zarrUrl}),
    fetchZarrValues({zarrUrl, variable: forecastDischargeVariable, selection: [{start: 0, stop: 51, step: 1}, null, resolvedIdx]})
  ]);
    // discharge has shape of [nEnsMems, datetime.length] but it's flattened. find out which discharges are nan in the first ensemble member for reference in filtering the rest
  const validTimeIndices = discharge.slice(0, time.length).map((val, i) => !isNaN(val) ? i : -1).filter(i => i !== -1);
  // split the discharge array into the correct number of subarrays
  const memberStartIndices = Array(nEnsMems).fill(0).map((_, i) => i * time.length);
  discharge = memberStartIndices
    .map(startIdx => discharge.slice(startIdx, startIdx + time.length))  // array of nEnsMems subarrays
    .map(memberArray => validTimeIndices.map(i => memberArray[i]))  // for each member array, select only the valid time indices
  time = validTimeIndices.map(i => time[i]);
  const stats = _membersToStats(discharge);
  return {time, discharge, stats}
}
