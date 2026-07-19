'use strict';

// all data from rfsv3 are zarr version/format 3
import {FetchStore, get, open} from "zarrita"

// The controlled vocabulary of the v3 stores — the names every reader addresses arrays by. These
// live here, not in each reader, so a rename in the data is one edit. Resolutions are not here:
// they are a path concern and urls.js owns them, which also keeps the urls entry free of zarrita.
const riverIdVariable = "riverId";
const timeVariable = "time";
// v3 renamed v2's `ensemble` coordinate to `member` (and dropped member 52)
const memberVariable = "member";
const dischargeVariable = "Q";


const openZarrArray = async ({zarrUrl, variable}) => {
  const store = new FetchStore(`${zarrUrl}/${variable}`);
  return await open.v3(store, {kind: "array"});
}

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

const fetchZarrValues = async ({zarrUrl, variable, selection = null}) => {
  const node = await openZarrArray({zarrUrl, variable});
  const array = await get(node, selection);
  const values = [...array.data];
  return decodeScaleOffsetCompression(values, node.attrs);
}

const getCoordinateValues = async ({zarrUrl, variable}) => {
  return await fetchZarrValues({zarrUrl, variable, selection: [null]});
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
}
