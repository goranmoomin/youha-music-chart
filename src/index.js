let Koa = require("koa");
let Router = require("@koa/router");

let { getMelonChartItems, getSortedChartItems } = require("./chart.js");

let app = new Koa();
let router = new Router();
router.get("/", async (ctx, next) => {
    let html = `
<html>
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="https://unpkg.com/mvp.css">
  <script src="https://unpkg.com/date-input-polyfill" async></script>
  <script src="https://cdn.jsdelivr.net/npm/time-input-polyfill"></script>
  <script>
  window.addEventListener("load", function () {
    let abortController = new AbortController();
    let dateInputEl = document.querySelector("input[type=date]");
    let timeInputEl = document.querySelector("input[type=time]");
    async function updateChartHTML() {
      let [year, month, day] = dateInputEl.value.split("-").map(str => parseInt(str));
      month -= 1;
      let date = new Date(year, month, day, ...(timeInputEl.dataset.value || timeInputEl.value).split(":").map(str => parseInt(str)));
      if (isNaN(date)) { return; }
      abortController.abort();
      abortController = new AbortController();
      let signal = abortController.signal;
      let tbodyEl = document.querySelector("tbody");
      tbodyEl.innerHTML = \`<tr><td colspan="6" style="text-align: center;">Loading...</td></tr>\`
      let chartItems;
      let melonChartItems;
      try {
        [chartItems, melonChartItems] = await Promise.all([
          fetch(\`/chart/$\{date.toISOString()}\`, { signal }).then(res => res.json()),
          fetch(\`/melonchart/$\{date.toISOString()}\`, { signal }).then(res => res.json())
        ]);
      } catch (e) {
        if (e.name == "AbortError") { return; }
        else if (e.name == "SyntaxError") {
          tbodyEl.innerHTML = \`<tr><td colspan="6" style="text-align: center;">Chart doesn't exist.</td></tr>\`;
          return;
        } else { throw e; }
      }
      let tableBodyHTML = "";
      for (let i = 0; i < chartItems.length; i++) {
        let music = chartItems[i];
        let melonMusic = melonChartItems[i];
        tableBodyHTML += \`<tr><td>$\{i + 1}</td><td><img src="$\{music.albumImgUrl}"></td><td>$\{music.name}</td><td>$\{music.score.toFixed(2)}</td><td><img src="$\{melonMusic.albumImgUrl}"></td><td>$\{melonMusic.name}</td></tr>\`;
      }
      tbodyEl.innerHTML = tableBodyHTML;
    }
    dateInputEl.addEventListener("change", updateChartHTML);
    timeInputEl.addEventListener("change", updateChartHTML);
  });
  </script>
</head>
<body>
  <section>
    <input type="date">
    <input type="time" title="chart time">
  </section>
  <section>
    <table>
      <thead>
        <tr><th>순위</th><th>앨범 표지</th><th>곡 이름</th><th>점수</th><th>앨범 표지</th><th>곡 이름</th></tr>
      </thead>
      <tbody>`;
    let date = new Date();
    let chartItems = await getSortedChartItems(date);
    let melonChartItems = await getMelonChartItems(date);
    for (let i = 0; i < chartItems.length; i++) {
        let music = chartItems[i];
        let melonMusic = melonChartItems[i];
        html += `<tr><td>${i + 1}</td><td><img src="${music.albumImgUrl}"></td><td>${music.name}</td><td>${music.score.toFixed(2)}</td><td><img src="${melonMusic.albumImgUrl}"></td><td>${melonMusic.name}</td></tr>`;
    }
    html += `</tbody></table></section></body></html>`;
    ctx.body = html;
});

router.get("/chart", async (ctx, next) => {
    let date = new Date();
    let chart = await getSortedChartItems(date);
    ctx.body = chart;
});

router.get("/chart/:date", async (ctx, next) => {
    let date = new Date(ctx.params.date);
    let chart = await getSortedChartItems(date);
    ctx.body = chart;
});

router.get("/melonchart", async (ctx, next) => {
    let date = new Date();
    let chart = await getMelonChartItems(date);
    ctx.body = chart;
});

router.get("/melonchart/:date", async (ctx, next) => {
    let date = new Date(ctx.params.date);
    let chart = await getMelonChartItems(date);
    ctx.body = chart;
});

app.use(router.routes());

app.listen(8080);
