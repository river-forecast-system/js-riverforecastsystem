'use strict';

// The v3 api surface:

// pointing the client at data — rfs.v3.configure({v3Base}) / rfs.v3.getConfig()
import {configure, getConfig} from "./config.js";
// building urls to datasets
import * as urls from "./urls.js";
// discharge readers (discharge/)
import * as discharge from "./discharge/index.js"
// chart rendering for what those readers return (plots/)
import * as plots from "./plots/index.js";

export {
  configure,
  getConfig,
  urls,
  discharge,
  plots,
};
