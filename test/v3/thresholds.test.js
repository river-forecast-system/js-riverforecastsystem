import {describe, expect, it} from "vitest";
import {levelDatasets, levelsVisibleByDefault, normalizeLevels} from "../../src/v3/plots/thresholds.js";

// The standard return-period set, as the returnPeriods reader returns it: keyed by recurrence
// interval, values in m³/s. Deliberately not in ascending key order — an object's key order is not
// something the reader promises, and the bands only make sense ascending.
const RETURN_PERIODS = {10: 41638, 2: 27516, 100: 59253, 5: 36013, 50: 54019, 25: 48746};

describe("normalizeLevels", () => {
  it("sorts ascending and labels return periods by their interval", () => {
    const levels = normalizeLevels(RETURN_PERIODS);
    expect(levels.map((l) => l.value)).toEqual([27516, 36013, 41638, 48746, 54019, 59253]);
    expect(levels.map((l) => l.label)).toEqual(["2-year", "5-year", "10-year", "25-year", "50-year", "100-year"]);
  });

  it("colours the standard six-level set as the v2 hydroviewer did, yellow through violet", () => {
    expect(normalizeLevels(RETURN_PERIODS).map((l) => l.color)).toEqual([
      "rgb(254, 240, 1)",
      "rgb(253, 154, 1)",
      "rgb(255, 56, 5)",
      "rgb(255, 0, 0)",
      "rgb(128, 0, 106)",
      "rgb(128, 0, 246)"
    ]);
  });

  it("spans the same ramp for a set that isn't six levels long", () => {
    const colors = normalizeLevels({2: 10, 5: 20, 10: 30}).map((l) => l.color);
    expect(colors[0]).toBe("rgb(254, 240, 1)"); // still starts at yellow
    expect(colors[2]).toBe("rgb(128, 0, 246)"); // and still ends at violet
    expect(new Set(colors).size).toBe(3);
  });

  it("takes arbitrary warning levels, keeping a caller's own label and colour", () => {
    const levels = normalizeLevels([
      {label: "Major", value: 900, color: "rgb(1, 2, 3)"},
      {label: "Action", value: 100}
    ]);
    expect(levels.map((l) => l.label)).toEqual(["Action", "Major"]);
    expect(levels[1].color).toBe("rgb(1, 2, 3)");
    expect(levels[0].color).toBe("rgb(254, 240, 1)"); // no colour given, so it takes the ramp's
  });

  it("drops levels with no value rather than drawing them at NaN", () => {
    // what a store writes for a reach the distribution was never fit for
    expect(normalizeLevels({2: 100, 5: NaN, 10: null}).map((l) => l.value)).toEqual([100]);
  });

  it("has nothing to draw without levels", () => {
    expect(normalizeLevels(undefined)).toEqual([]);
    expect(normalizeLevels({})).toEqual([]);
  });

  it("states the value beside the label, at a precision that doesn't outrun the fit", () => {
    expect(normalizeLevels([{label: "a", value: 1234.56}])[0].text).toBe("a · 1235");
    expect(normalizeLevels([{label: "b", value: 12.345}])[0].text).toBe("b · 12.3");
    expect(normalizeLevels([{label: "c", value: 1.234}])[0].text).toBe("c · 1.23");
  });
});

describe("levelsVisibleByDefault", () => {
  const levels = normalizeLevels(RETURN_PERIODS);
  const lowest = 27516; // the 2-year, so the test is against 24764.4

  it("stays hidden while the median peak is short of 90% of the lowest level", () => {
    expect(levelsVisibleByDefault(levels, 16019)).toBe(false);
    expect(levelsVisibleByDefault(levels, lowest * 0.9 - 1)).toBe(false);
  });

  it("shows once the median peak reaches 90% of the lowest level, before it crosses", () => {
    expect(levelsVisibleByDefault(levels, lowest * 0.9)).toBe(true);
    expect(levelsVisibleByDefault(levels, lowest)).toBe(true);
    expect(levelsVisibleByDefault(levels, 60000)).toBe(true);
  });

  it("stays hidden with no levels, or no forecast to compare them to", () => {
    expect(levelsVisibleByDefault([], 60000)).toBe(false);
    expect(levelsVisibleByDefault(levels, -Infinity)).toBe(false);
    expect(levelsVisibleByDefault(levels, NaN)).toBe(false);
  });
});

describe("levelDatasets", () => {
  const levels = normalizeLevels({2: 100, 5: 200, 10: 300});
  const span = {firstX: 10, lastX: 90};

  it("spans the full x-range at a constant y, and stays out of the tooltip", () => {
    const [first] = levelDatasets(levels, {...span, mode: "boxes", hidden: false});
    expect(first.data).toEqual([{x: 10, y: 100}, {x: 90, y: 100}]);
    expect(first.rfsLevel).toBe(true);
    expect(first.label).toBe("2-year · 100");
  });

  it("fills each box up to the next level, and the topmost to the end of the scale", () => {
    const sets = levelDatasets(levels, {...span, mode: "boxes", hidden: false});
    expect(sets[0].fill.target).toEqual({value: 200});
    expect(sets[1].fill.target).toEqual({value: 300});
    expect(sets[2].fill.target).toBe("end");
    expect(sets.every((d) => d.borderWidth === 0)).toBe(true);
  });

  it("draws unfilled dashes in lines mode", () => {
    const sets = levelDatasets(levels, {...span, mode: "lines", hidden: false});
    expect(sets.every((d) => d.fill === false)).toBe(true);
    expect(sets.every((d) => d.borderWidth > 0 && d.borderDash.length)).toBe(true);
  });

  it("carries the hidden flag through to every level, so they default together", () => {
    expect(levelDatasets(levels, {...span, mode: "boxes", hidden: true}).every((d) => d.hidden)).toBe(true);
  });
});
