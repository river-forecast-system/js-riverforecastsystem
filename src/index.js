import * as v2 from './v2/index.js';
import * as v3 from './v3/index.js';
import * as urls from './v3/urls.js';
import {configure, getConfig} from './v3/config.js';

const rfs = {
  configure,
  getConfig,
  urls,
  v2,
  v3
};
export {rfs as default, configure, getConfig, urls, v2, v3};
