const BBOX = { minlat: 40, maxlat: 56, minlon: 46, maxlon: 88 };
const REFRESH_MINUTES = 10;
const TIME_OFFSET = 6;

// Формирование URL для QuakeML
function buildUrl(days, minMag) {
  const now = new Date();
  const end = now.toISOString().split('.')[0] + "Z";
  const start = new Date(now.getTime() - days * 86400000)
    .toISOString()
    .split('.')[0] + "Z";

  return "https://service.earthscope.org/fdsnws/event/1/query?" +
    new URLSearchParams({
      format: "quakeml",
      starttime: start,
      endtime: end,
      minlat: BBOX.minlat,
      maxlat: BBOX.maxlat,
      minlon: BBOX.minlon,
      maxlon: BBOX.maxlon,
      minmagnitude: minMag,
      orderby: "time",
      limit: 200,
      includeallorigins: true,
      includeallmagnitudes: true
    });
}

// Парсер QuakeML → JSON
function parseQuakeML(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "text/xml");
  const events = [...xml.getElementsByTagName("event")];

  return events.map(ev => {
    const get = (tag) => ev.getElementsByTagName(tag)[0]?.textContent || null;

    return {
      time: get("value"), // время
      lat: parseFloat(get("latitude")),
      lon: parseFloat(get("longitude")),
      depth: parseFloat(get("depth")) / 1000, // метры → км
      mag: parseFloat(get("mag")),
      place: get("text")
    };
  }).filter(e => e.time && e.lat && e.lon);
}

// Загрузка данных
async function loadData(days, minMag) {
  const url = buildUrl(days, minMag);

  const response = await fetch(url);
  if (!response.ok) {
    console.error("API error:", await response.text());
    return [];
  }

  const xmlText = await response.text();
  return parseQuakeML(xmlText);
}

// Перевод времени в KZ
function toKZTime(iso) {
  const d = new Date(iso);
  const shifted = new Date(d.getTime() + TIME_OFFSET * 3600000);
  return shifted.toISOString().replace("T", " ").replace("Z", "");
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

  events.forEach(e => {
    html += `
      <tr>
        <td>${toKZTime(e.time)}</td>
        <td>${e.mag?.toFixed(1) || ""}</td>
        <td>${e.depth?.toFixed(1) || ""}</td>
        <td>${e.lat?.toFixed(3) || ""}</td>
        <td>${e.lon?.toFixed(3) || ""}</td>
        <td>${e.place || ""}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  document.getElementById(containerId).innerHTML = html;
}

// Карта
function renderMap(containerId, events) {
  const map = L.map(containerId).setView([48, 68], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  const layer = L.layerGroup().addTo(map);
  const bounds = [];

  events.forEach(e => {
    const marker = L.circleMarker([e.lat, e.lon], {
      radius: Math.max(4, e.mag * 1.5),
      color: "#d9534f",
      fillColor: "#d9534f",
      fillOpacity: 0.7
    });

    marker.bindPopup(`
      <b>Магнитуда:</b> ${e.mag}<br>
      <b>Дата (KZ):</b> ${toKZTime(e.time)}<br>
      <b>Глубина:</b> ${e.depth} км<br>
      <b>Координаты:</b> ${e.lat}, ${e.lon}<br>
      <b>Место:</b> ${e.place}
    `);

    marker.addTo(layer);
    bounds.push([e.lat, e.lon]);
  });

  if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
}

// Обновление
async function updateAll() {
  const magMin = parseFloat(document.getElementById("mag-filter").value);

  const data24 = (await loadData(1, magMin)).filter(e => e.mag >= magMin);
  const data7  = (await loadData(7, magMin)).filter(e => e.mag >= magMin);
  const data30 = (await loadData(30, magMin)).filter(e => e.mag >= magMin);

  renderTable("table-24h", data24);
  renderTable("table-7d", data7);
  renderTable("table-30d", data30);

  renderMap("map-24h", data24);
  renderMap("map-7d", data7);
  renderMap("map-30d", data30);
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
