import {t} from "./translations";
import {axis, Chart, chartCanvas, commonPlugins, rgba, TEXT} from "./shared";
import {STATUS_COLORS} from "./derive";

function renderMonthlyStatus(host, d) {
  const bands = t("status").map((label, idx) => ({
    label,
    data: d.monthlyStatus[idx],
    borderWidth: 0,
    pointRadius: 0,
    backgroundColor: rgba(STATUS_COLORS[idx], 0.5),
    fill: idx < t("status").length - 1 ? "+1" : "origin"
  }));
  const years = Array.from(new Set(Object.keys(d.monthlyAverageTimeseries).map((k) => k.slice(0, 4)))).sort();
  const recent = years.slice(-2).reverse().map((y, i) => ({
    label: `Year ${y}`,
    borderColor: i === 0 ? TEXT : "#64748b",
    borderWidth: i === 0 ? 2 : 1.5,
    borderDash: i === 0 ? [] : [6, 4],
    pointRadius: 0,
    fill: false,
    data: t("months").map((_, m) => d.monthlyAverageTimeseries[`${y}-${String(m + 1).padStart(2, "0")}`] ?? null)
  }));
  return new Chart(chartCanvas(host), {
    type: "line",
    data: {
      labels: t("months"),
      datasets: [
        ...bands,
        {label: t("series.monthlyAverage"), data: d.monthlyAverages.map((m) => m.value), borderColor: "#009dff", borderWidth: 2, borderDash: [6, 4], pointRadius: 0, fill: false},
        ...recent
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {mode: "index", intersect: false},
      plugins: commonPlugins(t("chart.monthlyStatus")),
      scales: {x: axis(t("axis.month")), y: axis(t("axis.flow"), {beginAtZero: true})}
    }
  });
}

export {
  renderMonthlyStatus
};
