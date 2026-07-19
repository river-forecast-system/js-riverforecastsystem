'use strict';

export default function (discharge) {
  /*
  Takes an array of equally sized subarrays (one for each member) and computes timestep-wise
  statistics — the summary box a hydrograph plot draws. Takes only the discharge array, so it
  stands alone: forecast.js and forecastsBulk.js both call it, and a caller holding member series
  from anywhere else can too. The returns an object of structure:
  {
    min: [Number, Number, ...],
    p20: [Number, Number, ...],
    p25: [Number, Number, ...],
    median: [Number, Number, ...],
    p75: [Number, Number, ...],
    p80: [Number, Number, ...],
    max: [Number, Number, ...],
    average: [Number, Number, ...],
    peak: Number,            // the largest value on the median series
    memberCount: Number,
  }
  The statistics are positional against the same time axis the discharge came in on, so a caller
  pairs them with the forecast's own `time`.

  Every member covers the whole time axis at the same uniform step and no value is missing, so a
  timestep's statistics are just its sorted column across all members. There is no high resolution
  member on a finer axis to hold out of the spread, and no returned timestep is NaN.
  */
  const nMembers = discharge.length
  const nTimesteps = discharge[0]?.length ?? 0
  let stats = {
    min: Array(nTimesteps).fill(NaN),
    p20: Array(nTimesteps).fill(NaN),
    p25: Array(nTimesteps).fill(NaN),
    median: Array(nTimesteps).fill(NaN),
    p75: Array(nTimesteps).fill(NaN),
    p80: Array(nTimesteps).fill(NaN),
    max: Array(nTimesteps).fill(NaN),
    average: Array(nTimesteps).fill(NaN),
    peak: NaN,
    memberCount: nMembers,
  }
  Array(nTimesteps).fill(0).forEach((_, idx) => {
    const timestepValues = discharge.map(member => member[idx]).sort((a, b) => a - b)
    const n = timestepValues.length
    if (n === 0) return
    stats.min[idx] = timestepValues[0]
    stats.p20[idx] = timestepValues[Math.floor(0.20 * n)]
    stats.p25[idx] = timestepValues[Math.floor(0.25 * n)]
    stats.median[idx] = timestepValues[Math.floor(0.5 * n)]
    stats.p75[idx] = timestepValues[Math.floor(0.75 * n)]
    stats.p80[idx] = timestepValues[Math.floor(0.80 * n)]
    stats.max[idx] = timestepValues[n - 1]
    stats.average[idx] = timestepValues.reduce((a, b) => a + b, 0) / n
  })
  // the flood extent animation drives off the median series, so its maximum comes back with it
  if (nTimesteps > 0) stats.peak = stats.median.reduce((mx, v) => (v > mx ? v : mx), -Infinity)
  return stats
}
