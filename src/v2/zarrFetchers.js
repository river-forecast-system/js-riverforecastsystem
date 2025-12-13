'use strict';

// all data from rfsv2 are zarr version/format 2
import {FetchStore, get, open} from "zarrita"

const resolveRiverIdToIndex = async ({zarrUrl, riverId, idx, idVariable}) => {
  // idx is preferred. if not provided, riverId must be given to look up the index.
  // validate that at least one of riverId or idx is provided
  if (idx === undefined && riverId === undefined) {
    throw new Error("Either 'riverId' or 'idx' must be provided.");
  }
  if (idx === undefined) {
    idx = await getCoordinateIndex({zarrUrl, variable: idVariable, value: riverId})
  }
  return idx;
}

const fetchZarrValues = async ({zarrUrl, variable, selection = null}) => {
  const store = new FetchStore(`${zarrUrl}/${variable}`);
  const node = await open.v2(store);
  const array = await get(node, selection);
  return [...array.data];
}

const getCoordinateValues = async ({zarrUrl, variable}) => {
  return await fetchZarrValues({zarrUrl, variable, selection: [null]});
}

const getCoordinateIndex = async ({zarrUrl, variable, value}) => {
  let coordinates = await getCoordinateValues({zarrUrl, variable});
  return coordinates.indexOf(value);
}

const getTimeCoordinateValues = async ({zarrUrl}) => {
  const store = new FetchStore(`${zarrUrl}/time`);
  const node = await open.v2(store);
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
  fetchZarrValues,
  getCoordinateValues,
  getCoordinateIndex,
  getTimeCoordinateValues,
  resolveRiverIdToIndex,
}
