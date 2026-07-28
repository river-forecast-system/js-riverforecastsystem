'use strict';

// all data from rfsv3 are zarr version/format 3
import {FetchStore, get, open} from "zarrita";

// The stores are written with blosc(cname=zstd, clevel=5, shuffle), which zarrita's default codec
// registry already resolves — no registration step. rollup.config.js keeps numcodecs' blosc wasm
// in the bundle and stubs lz4 and zstd, so this is the one compressor a store may use.
const riverIdVariable = "riverId";
const timeVariable = "time";
const memberVariable = "member";
const dischargeVariable = "Q";

const openZarrArray = async ({zarrUrl, variable}) => {
  const store = new FetchStore(`${zarrUrl}/${variable}`);
  return await open.v3(store, {kind: "array"});
}

// The v3 stores use bitrounding, which makes low mantissa bits 0 but compresses much better.
// Its lossy and carries the full dozen decimals. Downloaded values get rounded to 2 again.
const DECIMAL_PLACES = 2;
const ROUNDING_FACTOR = 10 ** DECIMAL_PLACES;

// Multiply-round-divide rather than Number(v.toFixed(2)) because its much slower by comparison
const roundValue = (value) => Math.round(value * ROUNDING_FACTOR) / ROUNDING_FACTOR;
const roundValues = (values) => values.map(roundValue);

const resolveRiverIndex = async ({zarrUrl, riverIndex, riverId}) => {
  if (riverIndex === undefined && riverId === undefined) {
    throw new Error("Either 'riverIndex' or 'riverId' must be provided.");
  }
  if (riverIndex === undefined) {
    return await getCoordinateIndex({zarrUrl, variable: riverIdVariable, value: riverId});
  }
  return riverIndex;
}

const resolveRiverIdsToIndices = async ({zarrUrl, riverIds}) => {
  const coordinates = await getCoordinateValues({zarrUrl, variable: riverIdVariable});
  const positions = new Map();
  coordinates.forEach((id, i) => positions.set(Number(id), i));
  return riverIds.map(riverId => positions.get(Number(riverId)) ?? -1);
}

const decodeScaleOffsetCompression = (values, attrs) => {
  const scale = attrs?.scale_factor;
  const offset = attrs?.add_offset;
  const fill = attrs?._FillValue;
  if (scale === undefined && offset === undefined && fill === undefined) return values;
  return values.map(v => {
    const n = Number(v);
    if (fill !== undefined && n === Number(fill)) return NaN;
    return n * (scale ?? 1) + (offset ?? 0);
  });
}

const fetchZarrValues = async ({zarrUrl, variable, selection = null, round = true}) => {
  const node = await openZarrArray({zarrUrl, variable});
  const array = await get(node, selection);
  const values = decodeScaleOffsetCompression([...array.data], node.attrs);
  return round ? roundValues(values) : values;
}

const getCoordinateValues = async ({zarrUrl, variable}) => {
  return await fetchZarrValues({zarrUrl, variable, selection: [null], round: false});
}

const getCoordinateIndex = async ({zarrUrl, variable, value}) => {
  let coordinates = await getCoordinateValues({zarrUrl, variable});
  return coordinates.indexOf(value);
}

const getTimeCoordinateValues = async ({zarrUrl}) => {
  const node = await openZarrArray({zarrUrl, variable: timeVariable});
  const array = await get(node, [null]);

  const units = node.attrs.units;
  const originTime = new Date(units.split("since")[1].trim());
  const conversionFactor = {
    seconds: 1,
    minutes: 60,
    hours: 60 * 60,
    days: 60 * 60 * 24,
  }[units.split("since")[0].trim()];

  // Offset the epoch directly rather than with Date.setSeconds - setSeconds writes local time
  // fields, so any timestamp on the far side of a DST boundary from the origin comes back shifted
  // by an hour (e.g. 23:00 the previous day) and reads as the wrong date under getUTC*.
  const originEpoch = originTime.getTime();
  return [...array.data].map(t => new Date(originEpoch + (Number(t) * conversionFactor * 1000)));
}

export {
  // controlled vocabulary
  riverIdVariable,
  timeVariable,
  memberVariable,
  dischargeVariable,
  // readers
  fetchZarrValues,
  getCoordinateIndex,
  getCoordinateValues,
  getTimeCoordinateValues,
  openZarrArray,
  resolveRiverIdsToIndices,
  resolveRiverIndex,
  DECIMAL_PLACES,
  roundValue,
  roundValues,
}
