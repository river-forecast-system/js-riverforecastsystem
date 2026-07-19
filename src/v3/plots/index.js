'use strict';

// Chart rendering for the v3 discharge readers. Give it a host element, the object a reader
// returned, and a language code — the plots carry their own text (translations/) and read their
// own colours from the host's CSS custom properties (--rfs-chart-*, see shared.js), so a consuming
// app supplies neither strings nor a palette.
//
// Reached as rfs.v3.plots, or as the `rfsjs/plots` subpath to keep chart.js out of a bundle that
// only reads data.

import {clearPlots, plotAllForecast, plotAllRetro, restyleCharts} from "./orchestrator.js";
import {availableLocales, useLocale} from "./translations/index.js";

export {
  // rendering
  plotAllRetro,
  plotAllForecast,
  clearPlots,
  // repaint live charts after a theme change, without refetching the series
  restyleCharts,
  // language
  availableLocales,
  useLocale
};
