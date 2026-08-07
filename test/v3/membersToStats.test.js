import {describe, expect, it} from "vitest";
import membersToStats from "../../src/v3/discharge/membersToStats.js";

// four members over three timesteps, deliberately out of order across members so the sort matters
const discharge = [
  [10, 40, 5],
  [20, 30, 5],
  [30, 20, 5],
  [40, 10, 5]
];

describe("membersToStats", () => {
  it("collapses the ensemble timestep-wise", () => {
    const stats = membersToStats(discharge);
    expect(stats.memberCount).toBe(4);
    expect(stats.min).toEqual([10, 10, 5]);
    expect(stats.max).toEqual([40, 40, 5]);
    expect(stats.average).toEqual([25, 25, 5]);
    // the sorted column is [10,20,30,40]; floor(0.5*4) = index 2
    expect(stats.median).toEqual([30, 30, 5]);
    expect(stats.peak).toBe(30);
  });

  it("takes only the discharge array, so any source of member series can call it", () => {
    // the shape forecastsBulk builds per river: typed arrays rather than plain ones
    const typed = discharge.map(member => Float64Array.from(member));
    expect(membersToStats(typed).median).toEqual([30, 30, 5]);
  });

  it("returns an empty summary for an ensemble with no timesteps", () => {
    const stats = membersToStats([]);
    expect(stats.memberCount).toBe(0);
    expect(stats.median).toEqual([]);
    expect(stats.peak).toBeNaN();
  });
});
