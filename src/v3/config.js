'use strict';

// Where the v3 data lives. There is one endpoint: the root of the v3 tree. The flood library
// (FLDPLN) is deliberately absent — that data is read by the consuming app, not by this package,
// so its location is the app's to hold.

const DEFAULTENDPOINTS = {
  v3Base: "https://d3nbgbhk5goaof.cloudfront.net/synthetic-v3-data"
};
const OVERRIDEENDPOINTS = {
  v3Base: ""
}

// remove trailing slashes of override urls so the join pattern stays `${base}/thing`
const _normalize = value => (typeof value === "string" ? value.trim().replace(/\/+$/, "") : "");

// set overrides url
const configure = ({v3Base} = {}) => {
  if (v3Base !== undefined) OVERRIDEENDPOINTS.v3Base = _normalize(v3Base);
};

const v3Base = () => OVERRIDEENDPOINTS.v3Base || _normalize(DEFAULTENDPOINTS.v3Base)

// the endpoints in effect right now, defaults and overrides already resolved
const getConfig = () => ({v3Base: v3Base()});

export {configure, getConfig, v3Base};
