const BBOX = {
  minlat: 20,
  maxlat: 60,
  minlon: 40,
  maxlon: 110
};

const REFRESH_MINUTES = 10;
const TIME_OFFSET = 6;

// Формирование URL
function buildUrl(days, minMag) {
  const now = new Date();
  const end = now.toISOString().split('.')[0];
  const start = new Date(now.getTime() - days * 86400000)
    .toISOString()
    .split('.')[0];

  return "https://earthquake.usgs.gov/fdsnws/event/1/query?" +
    new URLSearchParams({
      format: "geojson",
      starttime: start,
      endtime: end,
      minlatitude: BBOX.minlat,
      maxlatitude: BBOX.maxlat,
      minlongitude: BBOX.minlon,
      maxlongitude: BBOX.maxlon,
      minmagnitude: minMag,
      orderby: "time"
    });
}

// Загрузка данных
async function loadData(days, minMag) {
  const url = buildUrl(days, minMag);
  const response = await fetch(url);
  if (!response.ok) return [];
  const json = await response.json();
  return json.features || [];
}

// Время KZ
function toKZTime(utcMs) {
  const d = new Date(utcMs + TIME_OFFSET * 3600000);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

// Таблица
function renderTable(containerId, events) {
  let html = `
    <table>
      <thead>
        <tr>
          <th>Дата (KZ)</th>
          <th>Магнитуда</th>
          <th>Глубина</th>
          <th>Широта</th>
          <th>Долгота</th>
          <th>Место</th>
        </tr>
      </thead>
      <tbody>
  `;

  events.forEach(f => {
    const p = f.properties;
    const c = f.geometry.coordinates;

    html += `
      <tr>
        <td>${toKZTime(p.time)}</td>
        <td>${p.mag?.toFixed(1) || ""}</td>
        <td>${c[2]?.toFixed(1) || ""}</td>
        <td>${c[1]?.toFixed(3) || ""}</td>
        <td>${c[0]?.toFixed(3) || ""}</td>
        <td>${p.place || ""}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  document.getElementById(containerId).innerHTML = html;
}

// Карта MapLibre
function renderMap(containerId, events) {
  const container = document.getElementById(containerId);

  // ВАЖНО: очистить контейнер перед созданием карты
  container.innerHTML = "";

  const map = new maplibregl.Map({
    container: containerId,
    style: "https://tiles.stadiamaps.com/styles/osm_bright.json",
    center: [70, 40],
    zoom: 3
  });

  map.on("load", () => {
    map.resize(); // критично для вкладок

    map.addSource("eq", {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: events
      },
      cluster: true,
      clusterRadius: 50
    });

    map.addLayer({
      id: "clusters",
      type: "circle",
      source: "eq",
      filter: ["has", "point_count"],
      paint: {
        "circle-color": "#d9534f",
        "circle-radius": ["step", ["get", "point_count"], 15, 50, 20, 100, 30]
      }
    });

    map.addLayer({
      id: "cluster-count",
      type: "symbol",
      source: "eq",
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 12
      }
    });

    map.addLayer({
      id: "unclustered",
      type: "circle",
      source: "eq",
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": "#d9534f",
        "circle-radius": 6
      }
    });

    map.on("click", "unclustered", e => {
      const f = e.features[0];
      const p = f.properties;
      const c = f.geometry.coordinates;

      new maplibregl.Popup()
        .setLngLat(c)
        .setHTML(`
          <b>Магнитуда:</b> ${p.mag}<br>
          <b>Дата (KZ):</b> ${toKZTime(p.time)}<br>
          <b>Глубина:</b> ${c[2]} км<br>
          <b>Координаты:</b> ${c[1]}, ${c[0]}<br>
          <b>Место:</b> ${p.place}
        `)
        .addTo(map);
    });
  });
}

// Обновление
async function updateAll() {
  const magMin = parseFloat(document.getElementById("mag-filter").value);

  const data24 = await loadData(1, magMin);
  const data7 = await loadData(7, magMin);
  const data30 = await loadData(30, magMin);

  renderMap("map-24h", data24);
  renderMap("map-7d", data7);
  renderMap("map-30d", data30);

  renderTable("table-24h", data24);
  renderTable("table-7d", data7);
  renderTable("table-30d", data30);
}

// Вкладки
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.add("active");
  });
});

// Фильтр
document.getElementById("mag-filter").addEventListener("change", updateAll);

// Автообновление
setInterval(updateAll, REFRESH_MINUTES * 60000);

// Первый запуск
updateAll();
