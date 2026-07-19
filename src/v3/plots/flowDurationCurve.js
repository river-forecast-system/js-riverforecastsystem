import {t} from "./translations";
import {axis, Chart, chartCanvas, commonPlugins, VIRIDIS7} from "./shared";
import {PERCENTILES} from "./derive";

function renderFlowDurationCurve(host, d) {
  const pts = (ys) => PERCENTILES.map((x, i) => ({x, y: ys[i]}));
  const monthly = t("months").map((name, i) => ({
    label: name,
    data: pts(d.monthlyFdc[String(i + 1).padStart(2, "0")]),
    borderColor: VIRIDIS7[i % VIRIDIS7.length],
    borderWidth: 1,
    pointRadius: 0,
    hidden: true
  }));
  return new Chart(chartCanvas(host), {
    type: "line",
    data: {
      datasets: [
        {label: t("series.allMonths"), data: pts(d.fdc), borderColor: "#38bdf8", borderWidth: 2, pointRadius: 0},
        ...monthly
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      parsing: false,
      interaction: {mode: "nearest", intersect: false},
      plugins: commonPlugins(t("chart.flowDurationCurve")),
      scales: {x: axis(t("axis.percentile"), {type: "linear", min: 0, max: 100}), y: axis(t("axis.flow"), {beginAtZero: true})}
    }
  });
}

export {
  renderFlowDurationCurve
};
