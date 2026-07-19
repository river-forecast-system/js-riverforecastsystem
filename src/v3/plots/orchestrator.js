import {AXIS, GRID, refreshChartTheme, TEXT} from "./shared";
import {deriveRetro} from "./derive";
import {renderDailyTimeseries} from "./dailyTimeseries";
import {renderMonthlyStatus} from "./monthlyStatus";
import {renderFlowDurationCurve} from "./flowDurationCurve";
import {renderYearlyVolumes} from "./yearlyVolumes";
import {renderYearlyPeaks} from "./yearlyPeaks";
import {renderRasterHydrograph} from "./rasterHydrograph";
import {renderCumulativeVolume} from "./cumulativeVolume";
import {renderForecastHydrograph} from "./forecastHydrograph";
import {useLocale} from "./translations";

let activeRetro = [];
let activeForecast = [];
const destroy = (list) => list.forEach((c) => c.destroy());

function clearPlots() {
  destroy(activeRetro);
  activeRetro = [];
  destroy(activeForecast);
  activeForecast = [];
}

// Theme colors are baked into each chart's options when it's constructed, so flipping the theme
// with charts already on screen leaves them in the old palette. Rather than re-rendering (which
// would refetch the series), walk the live instances and patch the colors in place. AXIS/GRID/TEXT
// are live ESM bindings, so they already hold the new values once refreshChartTheme() has run.
function restyleCharts() {
  const live = [...activeRetro, ...activeForecast];
  // Read the new palette from a chart that is actually on screen, so any custom properties scoped
  // below :root apply. With nothing rendered there is nothing to restyle anyway.
  if (live.length === 0) return;
  refreshChartTheme(live[0].canvas);
  for (const c of live) {
    for (const scale of Object.values(c.options.scales ?? {})) {
      if (scale.title) scale.title.color = AXIS;
      if (scale.ticks) scale.ticks.color = AXIS;
      if (scale.grid) scale.grid.color = GRID;
    }
    const plugins = c.options.plugins ?? {};
    if (plugins.legend?.labels) plugins.legend.labels.color = TEXT;
    if (plugins.title) plugins.title.color = TEXT;
    c.update("none");
  }
}

function block(root) {
  const host = document.createElement("div");
  host.className = "plot-block";
  root.appendChild(host);
  return host;
}

/**
 * Render the retrospective charts into `root`.
 *
 * `lang` is a language code — "es", "en-GB", anything BCP-47-ish. The locale's chunk is fetched on
 * first use, which is why this is async; unknown codes and failed loads fall back to English rather
 * than rejecting. Callers hold no chart strings of their own: pass the code, get the language.
 */
async function plotAllRetro(root, ts, {lang} = {}) {
  await useLocale(lang);
  destroy(activeRetro);
  activeRetro = [];
  refreshChartTheme(root);
  root.innerHTML = "";
  const d = deriveRetro(ts);
  activeRetro.push(
    renderDailyTimeseries(block(root), ts),
    renderMonthlyStatus(block(root), d),
    renderFlowDurationCurve(block(root), d),
    renderYearlyVolumes(block(root), d),
    renderYearlyPeaks(block(root), d),
    renderRasterHydrograph(block(root), d),
    renderCumulativeVolume(block(root), d)
  );
}

/** Render the forecast chart into `root`. `lang` behaves as in plotAllRetro. */
async function plotAllForecast(root, fc, {lang} = {}) {
  await useLocale(lang);
  destroy(activeForecast);
  activeForecast = [];
  refreshChartTheme(root);
  root.innerHTML = "";
  activeForecast.push(renderForecastHydrograph(block(root), fc));
}

export {
  clearPlots,
  plotAllForecast,
  plotAllRetro,
  restyleCharts
};
