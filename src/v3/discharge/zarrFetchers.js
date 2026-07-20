'use strict';

// all data from rfsv3 are zarr version/format 3
import {FetchStore, get, open} from "zarrita"
import {registerCodecs} from "../codecs.js";

// The controlled vocabulary of the v3 stores — the names every reader addresses arrays by. These
// live here, not in each reader, so a rename in the data is one edit. Resolutions are not here:
// they are a path concern and urls.js owns them, which also keeps the urls entry free of zarrita.
const riverIdVariable = "riverId";
const timeVariable = "time";
// v3 renamed v2's `ensemble` coordinate to `member` (and dropped member 52)
const memberVariable = "member";
const dischargeVariable = "Q";


const openZarrArray = async ({zarrUrl, variable}) => {
  registerCodecs();
  const store = new FetchStore(`${zarrUrl}/${variable}`);
  return await open.v3(store, {kind: "array"});
}

// The v3 stores are compressed with bitrounding, which trades the low mantissa bits for a much
// smaller file. That is lossy in a way that shows: a discharge the model produced as 12.34 comes
// back as 12.339996337890625, and no amount of formatting downstream makes the stored value itself
// honest. Two decimals is the precision this data is meaningful to anyway — well below the model's
// own error — so retrievals round to it here, once, rather than leaving every consumer to discover
// the ragged decimals and paper over them at their own display layer.
//
// This is deliberately not configurable. The point is that every reader in the package returns
// values at the same precision; a per-call override would just reintroduce the inconsistency.
const DECIMAL_PLACES = 2;
const ROUNDING_FACTOR = 10 ** DECIMAL_PLACES;

// Multiply-round-divide rather than Number(v.toFixed(2)): toFixed rounds on the decimal string and
// so is exact where `v * 100` is not (1.005 * 100 is 100.49999999999999), but it allocates a string
// per value and the bulk forecast reader runs this over millions. The two disagree only for values
// sitting within an ULP of a half-cent, which bitrounded float32 discharge does not produce, and
// where "correct" is arbitrary anyway.
//
// NaN and ±Infinity fall through unchanged, which is what decodeScaleOffsetCompression's NaN fill
// values depend on.
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

// `round` is opt-out for the coordinate reads below: riverId and recurrence_interval are integer
// labels, not measurements, so rounding them is a no-op bought at one pass over an axis with an
// entry per river in the model.
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

  return [...array.data].map(t => {
    let origin = new Date(originTime);
    origin.setSeconds(origin.getSeconds() + (Number(t) * conversionFactor));
    return origin;
  });
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
