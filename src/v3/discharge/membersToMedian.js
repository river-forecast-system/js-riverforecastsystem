'use strict';

export default function (discharge) {
  /*
  The median-only counterpart to membersToStats, deliberately a duplicate rather than a wrapper
  around it. Bulk selections run this over thousands of rivers and only ever draw the median, so
  paying for eight percentiles and an average per reach is waste — this walks each timestep's
  column once. The returns an object of structure:
  {
    median: [Number, Number, ...],
    peak: Number,           // the largest value on the median series
    memberCount: Number,
  }
  The median is positional against the same time axis the discharge came in on, so a caller pairs
  it with the forecast's own `time`.

  Reach for membersToStats instead whenever the spread is actually drawn — a single river's
  hydrograph. If the percentile convention here ever has to change, it has to change in both.
  */
  const nMembers = discharge.length
  const nTimesteps = discharge[0]?.length ?? 0
  const median = Array(nTimesteps).fill(NaN)
  let peak = NaN
  for (let idx = 0; idx < nTimesteps; idx++) {
    const timestepValues = discharge.map(member => member[idx]).sort((a, b) => a - b)
    const n = timestepValues.length
    if (n === 0) continue
    // same convention as membersToStats: floor(0.5 * n), not an even-count midpoint average
    const v = timestepValues[Math.floor(0.5 * n)]
    median[idx] = v
    if (!(v <= peak)) peak = v
  }
  return {median, peak, memberCount: nMembers}
}
