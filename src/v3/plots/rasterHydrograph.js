import {t} from "./translations";
import {MatrixController, MatrixElement} from "chartjs-chart-matrix";
import {AXIS, axis, Chart, chartCanvas, commonPlugins, doyMonthAxis, VIRIDIS7} from "./shared";

Chart.register(MatrixController, MatrixElement);

function renderRasterHydrograph(host, d) {
  // Scanned in a loop rather than Math.min(...vals): the raster is years × 366, so spreading it
  // as call arguments runs close to the engine's argument limit and throws on longer records.
  let vmin = Infinity;
  let vmax = -Infinity;
  for (const row of d.raster.z) {
    for (const v of row) {
      if (v == null) continue;
      if (v < vmin) vmin = v;
      if (v > vmax) vmax = v;
    }
  }
  const color = (v) => VIRIDIS7[Math.min(6, Math.max(0, Math.floor((v - vmin) / (vmax - vmin || 1) * 7)))];
  const data = [];
  d.raster.z.forEach((row, yi) => row.forEach((v, di) => {
    if (v != null) data.push({x: di + 1, y: d.raster.years[yi], v});
  }));
  const nY = d.raster.years.length;
  return new Chart(chartCanvas(host), {
    type: "matrix",
    data: {
      datasets: [{
        label: t("axis.discharge"),
        data,
        backgroundColor: ((c) => color(c.raw.v)),
        borderWidth: 0,
        width: ((c) => c.chart.chartArea ? c.chart.chartArea.width / 366 : 0),
        height: ((c) => c.chart.chartArea ? c.chart.chartArea.height / nY : 0)
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        ...commonPlugins(t("chart.rasterHydrograph"), false),
        tooltip: {
          callbacks: {
            title: () => "",
            label: (c) => {
              const r = c.raw;
              return `${r.y} · ${t("tooltip.day")} ${r.x}: ${r.v.toFixed(1)} m³/s`;
            }
          }
        }
      },
      scales: {
        x: {...doyMonthAxis(), title: {display: true, text: t("axis.dayOfYear"), color: AXIS}},
        y: axis(t("axis.year"), {type: "linear", min: d.raster.years[0] - 0.5, max: d.raster.years[nY - 1] + 0.5, ticks: {color: AXIS, stepSize: 5, precision: 0}})
      }
    }
  });
}

export {
  renderRasterHydrograph
};
