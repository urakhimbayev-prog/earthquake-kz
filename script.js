// Конфиг
const BBOX = {
  minlat: 20,
  maxlat: 60,
  minlon: 40,
  maxlon: 110
};
const REFRESH_MINUTES = 10;
const TIME_OFFSET = 6;

// Состояние
let lastData24 = [];
let lastData7 = [];
let lastData30 = [];

const maps = {
  "24h": null,
  "7d": null,
  "30d": null
};

// Время KZ
function toKZTime(utcMs) {
  const d = new Date(utcMs + TIME_OFFSET * 3600000);
  return d.toISOString().replace("T", " ").replace("Z", "");
}

// URL USGS
function buildUrl(days, minMag) {
  const now = new Date();
  const end = now.toISOString().split(".")[0];
  const start = new Date(now.getTime() - days * 86400000)
    .toISOString()
    .split(".")[0];

  return (
    "https://earthquake.usgs.gov/fdsnws/event/1/query?" +
    new URLSearchParams({
      format: "geojson",
      starttime: start,
      endtime: end,
      minlatitude: BBOX.minlat,
      maxlatitude: BBOX.maxlat,
      minlongitude: BBOX.minlon,
      maxlongitude: BBOX.maxlon,
      minmagnitude: minMag,
      orderby: "time",
      limit: 20000
    })
  );
}

// Загрузка данных
async function loadData(days, minMag) {
  const url = buildUrl(days, minMag);
  const res = await fetch(url);
  if (!res.ok) return [];
  const json = await res.json();
  return json.features || [];
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
        <td>${(c[2] ?? "").toString()}</td>
        <td>${c[1]?.toFixed(3) || ""}</td>
        <td>${c[0]?.toFixed(3) || ""}</td>
        <td>${p.place || ""}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  document.getElementById(containerId).innerHTML = html;
}

// Создание карты для вкладки
function createMap(containerId) {
  const map = L.map(containerId, {
    preferCanvas: true
  }).setView([45, 70], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(map);

  const layerGroup = L.layerGroup().addTo(map);

  return {
    map,
    layerGroup,
    index: null,
    geojson: []
  };
}

// Обновление кластеров на карте
function updateClusters(state) {
  const { map, layerGroup, index } = state;
  if (!index) return;

  const bounds = map.getBounds();
  const zoom = map.getZoom();

  const clusters = index.getClusters(
    [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
    zoom
  );

  layerGroup.clearLayers();

  clusters.forEach(c => {
    const [lng, lat] = c.geometry.coordinates;

    if (c.properties.cluster) {
      const count = c.properties.point_count;

      const marker = L.circleMarker([lat, lng], {
        radius: 12,
        color: "#d9534f",
        fillColor: "#d9534f",
        fillOpacity: 0.7
      }).bindTooltip(`${count} событий`);

      marker.on("click", () => {
        const expansionZoom = index.getClusterExpansionZoom(c.id);
        map.setView([lat, lng], expansionZoom);
      });

      layerGroup.addLayer(marker);
    } else {
      const p = c.properties;

      const marker = L.circleMarker([lat, lng], {
        radius: Math.max(4, p.mag * 1.5),
        color: "#d9534f",
        fillColor: "#d9534f",
        fillOpacity: 0.8
      });

      marker.bindPopup(`
        <b>Магнитуда:</b> ${p.mag}<br>
        <b>Дата (KZ):</b> ${toKZTime(p.time)}<br>
        <b>Глубина:</b> ${p.depth} км<br>
        <b>Место:</b> ${p.place}
      `);

      layerGroup.addLayer(marker);
    }
  });
}

// Применить данные к карте вкладки
function renderMapData(tabKey, events) {
  const state = maps[tabKey];
  if (!state) return;

  const geojson = events.map(f => ({
    type: "Feature",
    geometry: f.geometry,
    properties: {
      mag: f.properties.mag,
      place: f.properties.place,
      time: f.properties.time,
      depth: f.geometry.coordinates[2]
    }
  }));

  state.geojson = geojson;
  state.index = new Supercluster({
    radius: 60,
    maxZoom: 16
  }).load(geojson);

  updateClusters(state);
}

// Обновление всех вкладок
async function updateAll() {
  const magMin = parseFloat(document.getElementById("mag-filter").value);

  const [d24, d7, d30] = await Promise.all([
    loadData(1, magMin),
    loadData(7, magMin),
    loadData(30, magMin)
  ]);

  lastData24 = d24;
  lastData7 = d7;
  lastData30 = d30;

  renderTable("table-24h", d24);
  renderTable("table-7d", d7);
  renderTable("table-30d", d30);

  renderMapData("24h", d24);
  renderMapData("7d", d7);
  renderMapData("30d", d30);
}

// Вкладки
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

    btn.classList.add("active");
    document.getElementById("tab-" + tab).classList.add("active");

    const state = maps[tab];
    if (state && state.index) {
      updateClusters(state);
    }
  });
});

// Фильтр
document.getElementById("mag-filter").addEventListener("change", () => {
  updateAll();
});

// Инициализация карт
function initMaps() {
  maps["24h"] = createMap("map-24h");
  maps["7d"] = createMap("map-7d");
  maps["30d"] = createMap("map-30d");

  Object.values(maps).forEach(state => {
    state.map.on("moveend", () => updateClusters(state));
  });
}

// Автообновление
setInterval(updateAll, REFRESH_MINUTES * 60000);

// Старт
initMaps();
updateAll();
