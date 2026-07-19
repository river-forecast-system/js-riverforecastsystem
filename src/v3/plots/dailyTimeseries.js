import {t, tf} from "./translations";
import {Decimation} from "chart.js";
import zoomPlugin from "chartjs-plugin-zoom";
import {AXIS, Chart, chartCanvas, GRID, TEXT} from "./shared";

Chart.register(Decimation, zoomPlugin);

function renderDailyTimeseries(host, ts) {
  const tools = document.createElement("div");
  tools.className = "chart-tools";
  host.appendChild(tools);
  const canvas = chartCanvas(host);
  const data = ts.time.map((d, i) => ({x: d.getTime(), y: ts.discharge[i]})).filter((p) => Number.isFinite(p.y));
  const firstX = data.length ? data[0].x : 0;
  const lastX = data.length ? data[data.length - 1].x : firstX;
  const chart = new Chart(canvas, {
    type: "line",
    data: {
      datasets: [{
        label: t("series.dailyMean"),
        data,
        parsing: false,
        borderColor: "#38bdf8",
        borderWidth: 1,
        pointRadius: 0,
        pointHitRadius: 4,
        tension: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {mode: "index", intersect: false},
      plugins: {
        legend: {display: false},
        title: {display: true, text: tf("chart.dailyTimeseries", {riverId: ts.riverId}), color: TEXT},
        decimation: {enabled: true, algorithm: "lttb", samples: 600},
        tooltip: {
          callbacks: {
            title: (items) => new Date(items[0].parsed.x).toISOString().slice(0, 10),
            label: (it) => ` ${it.parsed.y.toFixed(2)} m³/s`
          }
        },
        zoom: {
          // plain click-drag draws a rubber-band box to zoom into a rectangle (both axes);
          // wheel is off so scrolling the modal is never captured
          zoom: {
            drag: {enabled: true, backgroundColor: "rgba(56,189,248,.15)", borderColor: "rgba(56,189,248,.6)", borderWidth: 1},
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
          time: {unit: "year"},
          min: firstX,
          max: lastX,
          title: {display: true, text: t("axis.datetime"), color: AXIS},
          ticks: {color: AXIS, maxRotation: 0},
          grid: {color: GRID}
        },
        y: {title: {display: true, text: t("axis.discharge"), color: AXIS}, beginAtZero: true, ticks: {color: AXIS}, grid: {color: GRID}}
      }
    }
  });
  const setRange = (years) => {
    const x = chart.options.scales.x;
    if (years === "all") {
      x.min = firstX;
    } else {
      const start = new Date(lastX);
      start.setFullYear(start.getFullYear() - years);
      x.min = Math.max(firstX, start.getTime());
    }
    x.max = lastX;
    chart.update("none");
  };
  const mkBtn = (label, fn) => {
    const b = document.createElement("button");
    b.className = "chart-btn";
    b.textContent = label;
    b.addEventListener("click", fn);
    return b;
  };
  tools.append(
    mkBtn(tf("control.yearsShort", {n: 1}), () => setRange(1)),
    mkBtn(tf("control.yearsShort", {n: 5}), () => setRange(5)),
    mkBtn(tf("control.yearsShort", {n: 10}), () => setRange(10)),
    mkBtn(tf("control.yearsShort", {n: 30}), () => setRange(30)),
    mkBtn(t("control.all"), () => setRange("all")),
    mkBtn(t("control.resetZoom"), () => chart.resetZoom())
  );
  const hint = document.createElement("span");
  hint.className = "chart-hint";
  hint.textContent = t("control.zoomHint");
  tools.appendChild(hint);
  return chart;
}

export {
  renderDailyTimeseries
};
