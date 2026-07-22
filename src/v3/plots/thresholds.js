'use strict';

import {tf} from "./translations";
import {rgba} from "./shared";

/**
 * Warning levels drawn across a hydrograph — return periods, or any other set of named discharge
 * thresholds — as shaded boxes or as horizontal lines.
 *
 * They are datasets rather than something painted underneath the chart, so every level is always on
 * the chart and in its legend, and showing or hiding one is the ordinary legend click it looks like.
 * Two consequences worth knowing: a hidden dataset is left out of the axis calculation, so revealing
 * a level well above the forecast grows the y-axis to reach it on its own; and each level is one
 * dataset in both forms, since a box is a line filled to the next level's value rather than a pair
 * of series with a fill between them.
 *
 * Which of the two forms is not a control this package offers. It is a standing preference of the
 * app the charts are rendered into — one that outlives any single chart — so it arrives as an
 * argument and the consuming app is the one that remembers it.
 */

// Ascending severity. Deliberately the v2 hydroviewer's return-period palette, in its order, so a
// 2/5/10/25/50/100-year set renders in the colours users already read as "yellow is a nuisance
// flood, violet is a catastrophe".
const SEVERITY_RAMP = [
  "rgb(254, 240, 1)",
  "rgb(253, 154, 1)",
  "rgb(255, 56, 5)",
  "rgb(255, 0, 0)",
  "rgb(128, 0, 106)",
  "rgb(128, 0, 246)"
];

// Sample the ramp by position so any number of levels spans the same yellow-to-violet range. With
// exactly six levels this is the identity, which is the common case (the standard return periods).
const rampColor = (i, n) => SEVERITY_RAMP[Math.round((i * (SEVERITY_RAMP.length - 1)) / Math.max(1, n - 1))];

// Enough digits to tell two thresholds apart without implying precision the fit doesn't have.
const formatValue = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

/**
 * Accept either shape and return one: levels ascending, each with a label, a value and a colour.
 *
 *   {2: 451.2, 5: 780.4, ...}                        return periods keyed by recurrence interval
 *   [{label: "Bankfull", value: 900, color: "..."}]  any other set of named warning levels
 *
 * Anything without a finite value is dropped rather than drawn — a store with no fit for a reach
 * writes NaN, and a reach with no fit has no threshold to show. Empty is spelled out rather than
 * left to Number(), which turns both null and "" into a real level at zero.
 */
const toValue = (value) => (value === null || value === undefined || value === "" ? NaN : Number(value));

function normalizeLevels(input) {
  if (!input) return [];
  const raw = Array.isArray(input)
    ? input.map((lvl) => ({label: lvl.label, value: toValue(lvl.value), color: lvl.color}))
    : Object.entries(input).map(([years, value]) => ({label: tf("label.returnPeriodYears", {n: years}), value: toValue(value)}));
  const levels = raw.filter((lvl) => Number.isFinite(lvl.value)).sort((a, b) => a.value - b.value);
  return levels.map((lvl, i) => ({
    ...lvl,
    color: lvl.color ?? rampColor(i, levels.length),
    text: `${lvl.label} · ${formatValue(lvl.value)}`
  }));
}

/**
 * Whether the levels come up shown or hidden.
 *
 * The test is the ensemble median against 90% of the lowest level: a forecast that gets that close
 * to its smallest threshold is one where the thresholds are the point of looking. Below it they
 * stay hidden — a river spends most of its life far under its 2-year flood, and a band painted
 * across every hydrograph that never approaches one teaches people to ignore the bands on the
 * hydrographs that do. Hidden, not absent: they are still in the legend, one click away.
 *
 * The median rather than the ensemble maximum, because a single member brushing a threshold is not
 * the forecast saying so.
 */
const APPROACH_FRACTION = 0.9;
const levelsVisibleByDefault = (levels, medianPeak) =>
  levels.length > 0 && Number.isFinite(medianPeak) && medianPeak >= levels[0].value * APPROACH_FRACTION;

/**
 * How a level is drawn in each form. A box is the level's own line filled up to the next level's
 * value — so the band is bounded by the two thresholds it lies between, and the topmost one runs to
 * the top of the scale, there being no bound above the largest threshold. `above` and `below` are
 * both set because which side of the target the line falls on is not worth reasoning about.
 */
function modeStyle(lvl, i, levels, mode) {
  if (mode === "lines") {
    return {fill: false, borderColor: lvl.color, borderWidth: 1.5, borderDash: [6, 4], backgroundColor: undefined};
  }
  const next = levels[i + 1];
  const band = rgba(lvl.color, 0.3);
  return {
    fill: next ? {target: {value: next.value}, above: band, below: band} : {target: "end", above: band, below: band},
    borderColor: lvl.color,
    borderWidth: 0,
    borderDash: [],
    backgroundColor: band
  };
}

/**
 * One dataset per level, spanning the full x-range at a constant y.
 *
 * `rfsLevel` marks them for the tooltip to skip: they carry two points rather than one per
 * timestep, so in the chart's index interaction mode they would otherwise appear in the tooltip at
 * the first and last steps and nowhere else.
 */
function levelDatasets(levels, {mode, firstX, lastX, hidden}) {
  return levels.map((lvl, i) => ({
    label: lvl.text,
    data: [{x: firstX, y: lvl.value}, {x: lastX, y: lvl.value}],
    parsing: false,
    hidden,
    rfsLevel: true,
    // Chart.js draws the highest order first, which puts these behind the forecast they are context
    // for. Both forms are translucent anyway; this keeps the ensemble median on top of them.
    order: 10,
    pointRadius: 0,
    pointHitRadius: 0,
    tension: 0,
    ...modeStyle(lvl, i, levels, mode)
  }));
}

export {
  levelDatasets,
  levelsVisibleByDefault,
  normalizeLevels
};
