import {describe, expect, it} from "vitest";
import membersToMedian from "../../src/v3/discharge/membersToMedian.js";
import membersToStats from "../../src/v3/discharge/membersToStats.js";

// four members over three timesteps, deliberately out of order across members so the sort matters
const discharge = [
  [10, 40, 5],
  [20, 30, 5],
  [30, 20, 5],
  [40, 10, 5]
];

describe("membersToMedian", () => {
  it("returns the median series, its peak, and the member count", () => {
    const {median, peak, memberCount} = membersToMedian(discharge);
    expect(median).toEqual([30, 30, 5]);
    expect(peak).toBe(30);
    expect(memberCount).toBe(4);
  });

  // the whole point of the duplicate is speed, so the two must not drift apart on convention
  it("agrees with membersToStats on the median and the peak", () => {
    const odd = [[1, 9], [2, 8], [3, 7]];
    for (const members of [discharge, odd]) {
      const fast = membersToMedian(members);
      const full = membersToStats(members);
      expect(fast.median).toEqual(full.median);
      expect(fast.peak).toBe(full.peak);
      expect(fast.memberCount).toBe(full.memberCount);
    }
  });

  it("takes the typed arrays forecastsBulk builds", () => {
    const typed = discharge.map(member => Float64Array.from(member));
    expect(membersToMedian(typed).median).toEqual([30, 30, 5]);
  });

  it("returns an empty median for an ensemble with no timesteps", () => {
    const {median, peak, memberCount} = membersToMedian([]);
    expect(median).toEqual([]);
    expect(peak).toBeNaN();
    expect(memberCount).toBe(0);
  });
});
