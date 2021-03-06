require("dotenv").config();

let Koa = require("koa");
let Router = require("@koa/router");

let { getMelonChartItems, getYouhaChartItems } = require("./chart.js");

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
    let shownItems = "all";
    document.querySelector(".chart-table th:nth-child(5)").addEventListener("click", e => {
      let showRegex;
      if (shownItems == "positive") {
        shownItems = "negative";
        showRegex = /\\-\\d+/;
      } else if (shownItems == "all") {
        shownItems = "positive";
        showRegex = /\\+\\d+/;
      } else if (shownItems == "negative") {
        shownItems = "all";
        showRegex = /.+/;
      }
      for (let element of document.querySelectorAll(".chart-table td:nth-child(5)")) {
        if (element.innerText.match(showRegex)) {
          element.parentElement.style.display = "";
        } else {
          element.parentElement.style.display = "none";
        }
      }
    });
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
        let musicMelonChartIndex = melonChartItems.findIndex(melonMusic => music.id == melonMusic.id);
        function formatDelta(delta) {
          if (delta > 0) { return \`<span style="color:red">+$\{delta}</span>\`; }
          else if (delta == 0) { return "-"; }
          else { return \`<span style="color:blue">$\{delta}</span>\`; }
        }
        tableBodyHTML += \`<tr><td>$\{i + 1}</td><td><img src="$\{music.albumimgurl}" style="height: 72px;"></td><td>$\{music.name}</td><td>$\{music.song_score.toFixed(2)}</td><td>$\{musicMelonChartIndex == -1 ? "" : formatDelta(musicMelonChartIndex - i)}</td><td>$\{i + 1}</td><td><img src="$\{melonMusic.albumimgurl}" style="height: 72px;"></td><td>$\{melonMusic.name}</td></tr>\`;
      }
      tbodyEl.innerHTML = tableBodyHTML;
      shownItems = "all";
    }
    dateInputEl.addEventListener("change", updateChartHTML);
    timeInputEl.addEventListener("change", updateChartHTML);
  });
  </script>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-MSG83P7S3F"></script>
  <script>
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());

    gtag('config', 'G-MSG83P7S3F');
  </script>
</head>
<body>
  <section>
    <input type="date">
    <input type="time" title="chart time">
  </section>
  <section>
    <table class="chart-table">
      <thead>
        <tr><th>순위</th><th>앨범 표지</th><th>곡 이름</th><th>점수</th><th>변동 순위</th><th>순위</th><th>앨범 표지</th><th>곡 이름</th></tr>
      </thead>
      <tbody>`;
    try {
        let date = new Date();
        let chartItems = await getYouhaChartItems(date);
        let melonChartItems = await getMelonChartItems(date);
        for (let i = 0; i < chartItems.length; i++) {
            let music = chartItems[i];
            let melonMusic = melonChartItems[i];
            let musicMelonChartIndex = melonChartItems.findIndex(melonMusic => music.id == melonMusic.id);
            function formatDelta(delta) {
                if (delta > 0) { return `<span style="color:red">+${delta}</span>`; }
                else if (delta == 0) { return "-"; }
                else { return `<span style="color:blue">${delta}</span>`; }
            }
            html += `<tr><td>${i + 1}</td><td><img src="${music.albumimgurl}" style="height: 72px;"></td><td>${music.name}</td><td>${music.song_score.toFixed(2)}</td><td>${musicMelonChartIndex == -1 ? "" : formatDelta(musicMelonChartIndex - i)}</td><td>${i + 1}</td><td><img src="${melonMusic.albumimgurl}" style="height: 72px;"></td><td>${melonMusic.name}</td></tr>`;
        }
    } catch (e) {
        if (e.code != "ENOENT") {
            throw e;
        }
        html += `<tr><td colspan="6" style="text-align: center;">Chart doesn't exist.</td></tr>`;
    }
    html += `</tbody></table></section></body></html>`;
    ctx.body = html;
});

router.get("/chart", async (ctx, next) => {
    let date = new Date();
    let chart = await getYouhaChartItems(date);
    ctx.body = chart;
});

router.get("/chart/:date", async (ctx, next) => {
    let date = new Date(ctx.params.date);
    let chart = await getYouhaChartItems(date);
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
