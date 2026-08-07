'use strict';

// pointing the client at data — rfs.v3.configure({v3Base}) / rfs.v3.getConfig()
import {configure, getConfig} from "./config.js";
// building urls to datasets
import * as urls from "./urls.js";

// other modules are not exported here because they carry optional and large dependencies.

export {
  configure,
  getConfig,
  urls,
};
