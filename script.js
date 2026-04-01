const BBOX = {
  minlat: 20,
  maxlat: 60,
  minlon: 40,
  maxlon: 110
};

const REFRESH_MINUTES = 10;
const TIME_OFFSET = 6;

// Формирование URL для USGS GeoJSON
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
  if (!response.ok) {
    console.error("API error:", await response.text());
    return [];
  }

  const json = await response.json();
  return json.features || [];
}

// Перевод времени в KZ
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

// Карта (без кластеризации — как в рабочем варианте)
function renderMap(containerId, events) {
  const map = L.map(containerId).setView([48, 68], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  const layer = L.layerGroup().addTo(map);
  const bounds = [];

  events.forEach(f => {
    const p = f.properties;
    const c = f.geometry.coordinates;
    const lat = c[1], lon = c[0];

    const marker = L.circleMarker([lat, lon], {
      radius: Math.max(4, p.mag * 1.5),
      color: "#d9534f",
      fillColor: "#d9534f",
      fillOpacity: 0.7
    });

    marker.bindPopup(`
      <b>Магнитуда:</b> ${p.mag}<br>
      <b>Дата (KZ):</b> ${toKZTime(p.time)}<br>
      <b>Глубина:</b> ${c[2]} км<br>
      <b>Координаты:</b> ${lat}, ${lon}<br>
      <b>Место:</b> ${p.place}
    `);

    marker.addTo(layer);
    bounds.push([lat, lon]);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
}

// Обновление (сначала карта → потом таблица)
async function updateAll() {
  const magMin = parseFloat(document.getElementById("mag-filter").value);

  const data24 = (await loadData(1, magMin)).filter(f => f.properties.mag >= magMin);
  const data7  = (await loadData(7, magMin)).filter(f => f.properties.mag >= magMin);
  const data30 = (await loadData(30, magMin)).filter(f => f.properties.mag >= magMin);

  // СНАЧАЛА КАРТА
  renderMap("map-24h", data24);
  renderMap("map-7d", data7);
  renderMap("map-30d", data30);

  // ПОТОМ ТАБЛИЦА
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
