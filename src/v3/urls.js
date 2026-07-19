// This is the source of truth for building urls around the v3 data organization pattern.
// Users and submodules should all refer to this module for consistency and correctness and easy updates.
// The source of truth diagram is in ${v3Base}/organization.md
// The base urls come from config.js, so callers configure() once and every builder here follows.

// This module builds urls and nothing else. Configuring where the data lives is a separate
// concern and lives with config.js — reach it as rfs.v3.configure, or import the dependency-free
// `rfsjs/config` subpath. It is deliberately not re-exported here.
import {v3Base} from "./config.js";

// ── hydrography ──────────────────────────────────────────────────────────────
const _globalHydrographyGroupNumber = "000";
const _streamsPmtilesFile = "streams_z4delayed.pmtiles";
const hydrographyGroup = ({group} = {}) => `${v3Base()}/hydrography/group=${group}`;
const streamsPmtiles = () => `${hydrographyGroup({group: _globalHydrographyGroupNumber})}/${_streamsPmtilesFile}`;

// ── retrospective ────────────────────────────────────────────────────────────
const allowedResolutions = ["hourly", "daily", "monthly", "yearly"];
const retrospectiveZarr = ({resolution = "hourly"} = {}) => {
  if (!allowedResolutions.includes(resolution)) {
    throw new Error(`Invalid resolution: ${resolution}. Must be one of ${allowedResolutions.join(", ")}.`);
  }
  return `${v3Base()}/retrospective/${resolution}.zarr`;
}
const returnPeriodsZarr = () => `${v3Base()}/retrospective/return-periods.zarr`;
const maximumsZarr = () => `${v3Base()}/retrospective/maximums.zarr`;

// ── forecasts ────────────────────────────────────────────────────────────────
const _datePartition = date => {
  if (!/^\d{4}-?\d{2}-?\d{2}$/.test(date)) {
    throw new Error(`Invalid date format: ${date}. Must be YYYYMMDD or YYYY-MM-DD.`);
  }
  const ymd = date.replace(/-/g, "");
  return `year=${ymd.slice(0, 4)}/month=${ymd.slice(4, 6)}/day=${ymd.slice(6, 8)}`;
};
const forecastDir = ({date}) => `${v3Base()}/forecasts15/${_datePartition(date)}`;
const forecastZarr = ({date}) => `${forecastDir({date})}/discharge.zarr`;

// ── map-styles ─────────────────────────────────────────────────────────────
const stylesets = Object.freeze({
  timeseries: "time-series",
  maxFlow: "max-flow",
  timeToPeak: "time-to-peak",
  belowQ95: "below-q95"
});
const streamsStyles = ({date, styleset}) => {
  if (!styleset) throw new Error("streamsStyles requires a styleset, consult stylesets for valid values");
  return `${forecastDir({date})}/map-styles/${styleset}/styles.`;
};

export {
  // hydrography url builders
  hydrographyGroup, streamsPmtiles,
  // retrospective url builders
  retrospectiveZarr, returnPeriodsZarr, maximumsZarr,
  // forecast url builders
  forecastDir, forecastZarr,
  // map-styles url builders
  stylesets, streamsStyles
}
