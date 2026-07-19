import {t, tf} from "./translations";
import zoomPlugin from "chartjs-plugin-zoom";
import {AXIS, Chart, chartCanvas, GRID, rgba, TEXT} from "./shared";

Chart.register(zoomPlugin);
const SKY = "rgb(56,189,248)";
const pts = (dates, ys) => dates.map((d, i) => ({x: d.getTime(), y: ys[i]})).filter((p) => Number.isFinite(p.y));

function renderForecastHydrograph(host, fc) {
  const canvas = chartCanvas(host);
  const {riverId, time: x, stats: b} = fc;
  const firstX = x.length ? x[0].getTime() : 0;
  const lastX = x.length ? x[x.length - 1].getTime() : firstX;
  const chart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [
        {
          label: t("series.range"),
          data: pts(x, b.max),
          parsing: false,
          fill: "+1",
          backgroundColor: rgba(SKY, 0.12),
          borderWidth: 0,
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.2
        },
        {
          label: "_min",
          data: pts(x, b.min),
          parsing: false,
          fill: false,
          borderWidth: 0,
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.2
        },
        {
          label: t("series.iqr"),
          data: pts(x, b.p75),
          parsing: false,
          fill: "+1",
          backgroundColor: rgba(SKY, 0.25),
          borderWidth: 0,
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.2
        },
        {
          label: "_p25",
          data: pts(x, b.p25),
          parsing: false,
          fill: false,
          borderWidth: 0,
          pointRadius: 0,
          pointHitRadius: 0,
          tension: 0.2
        },
        {
          label: t("series.ensembleMedian"),
          data: pts(x, b.median),
          parsing: false,
          fill: false,
          borderColor: SKY,
          borderWidth: 2,
          pointRadius: 0,
          pointHitRadius: 6,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {mode: "index", axis: "x", intersect: false},
      plugins: {
        legend: {
          position: "right",
          labels: {color: TEXT, boxWidth: 12, font: {size: 11}, filter: (i) => !i.text.startsWith("_")}
        },
        title: {display: true, color: TEXT, text: tf("chart.forecastHydrograph", {riverId})},
        tooltip: {
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toISOString().slice(0, 16).replace("T", " ") + " UTC",
            label: (it) => ` ${it.dataset.label}: ${it.parsed.y.toFixed(2)} m³/s`
          }
        },
        zoom: {
          zoom: {
            drag: {enabled: true, backgroundColor: rgba(SKY, 0.15), borderColor: rgba(SKY, 0.6), borderWidth: 1},
            wheel: {enabled: false},
            pinch: {enabled: true},
            mode: "xy"
          },
          pan: {enabled: true, mode: "xy", modifierKey: "shift"},
          limits: {x: {min: firstX, max: lastX}}
        }
      },
      scales: {
        x: {
          type: "time",
          time: {unit: "day", displayFormats: {day: "MMM d"}},
          min: firstX,
          max: lastX,
          title: {display: true, text: t("axis.datetime"), color: AXIS},
          ticks: {color: AXIS, maxRotation: 0},
          grid: {color: GRID}
        },
        y: {
          // hydrographs always anchor the y-axis at 0 so discharge magnitude reads honestly
          beginAtZero: true,
          title: {display: true, text: t("axis.discharge"), color: AXIS},
          grace: "5%",
          ticks: {color: AXIS},
          grid: {color: GRID}
        }
      }
    }
  });
  return chart;
}

export {
  renderForecastHydrograph
};
