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
  container.innerHTML = "";

  // Создаём карту Leaflet
  const map = L.map(containerId).setView([45, 70], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(map);

  // Преобразуем события в GeoJSON
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

  // Создаём кластеризатор
  const index = new Supercluster({
    radius: 60,
    maxZoom: 16
  }).load(geojson);

  // Функция рендера кластеров и точек
  function renderClusters() {
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
        // Кластер
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
        // Одиночная точка
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

  const layerGroup = L.layerGroup().addTo(map);

  // Рендерим кластеры при каждом движении карты
  map.on("moveend", renderClusters);

  // Первый рендер
  renderClusters();
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
