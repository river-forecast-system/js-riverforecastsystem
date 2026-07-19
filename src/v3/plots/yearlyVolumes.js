import {t} from "./translations";
import {axis, Chart, chartCanvas, commonPlugins} from "./shared";

function renderYearlyVolumes(host, d) {
  const labels = d.yearlyVolumes.map((v) => v.year);
  const fiveYearFor = (year) => {
    const g = d.fiveYearAverages.find((a) => a.period === Math.floor(year / 5) * 5);
    return g ? g.average : null;
  };
  return new Chart(chartCanvas(host), {
    type: "line",
    data: {
      labels,
      datasets: [
        {label: t("series.annualVolume"), data: d.yearlyVolumes.map((v) => v.value), borderColor: "#00a6ff", borderWidth: 2, pointRadius: 2, tension: 0},
        {label: t("series.fiveYearAverage"), data: labels.map(fiveYearFor), borderColor: "#ef4444", borderWidth: 2, pointRadius: 0, stepped: true}
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {mode: "index", intersect: false},
      plugins: commonPlugins(t("chart.yearlyVolumes")),
      scales: {x: axis(t("axis.year")), y: axis(t("axis.volume"), {beginAtZero: true})}
    }
  });
}

export {
  renderYearlyVolumes
};
