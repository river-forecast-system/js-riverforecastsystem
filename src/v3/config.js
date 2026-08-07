'use strict';

// Where the v3 data lives. There is one endpoint: the root of the v3 tree. Everything the package
// reads hangs off it — retrospective, forecasts, hydrography, and the FLDPLN flood libraries under
// flood-maps/ — so configuring this one value points every reader and url builder at the same tree.

const DEFAULTENDPOINTS = {
  v3Base: "https://d3nbgbhk5goaof.cloudfront.net/sample-data"
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
