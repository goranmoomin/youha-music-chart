let Koa = require("koa");
let Router = require("@koa/router");

let { getMelonChart, getSortedChart } = require("./chart.js");

let app = new Koa();
let router = new Router();
router.get("/", async (ctx, next) => {
    let html = `<html><head><meta charset="utf-8"><link rel="stylesheet" href="https://unpkg.com/mvp.css"></head><body><section><table><thead><tr><th>순위</th><th>앨범 표지</th><th>곡 이름</th><th>점수</th><th>앨범 표지</th><th>곡 이름</th></tr></thead><tbody>`;
    let date = new Date();
    let chart = await getSortedChart(date);
    let melonChart = await getMelonChart(date);
    for (let i = 0; i < chart.length; i++) {
        let music = chart[i];
        let melonMusic = melonChart[i];
        html += `<tr><td>${i + 1}</td><td><img src="${music.melonData.ALBUMIMGSMALL}"></td><td>${music.name}</td><td>${music.score.toFixed(2)}</td><td><img src="${melonMusic.ALBUMIMGSMALL}"></td><td>${melonMusic.SONGNAME}</td></tr>`;
    }
    html += "</tbody></table></section></body></html>";
    ctx.body = html;
});

router.get("/chart", async (ctx, next) => {
    let date = new Date();
    let chart = await getSortedChart(date);
    ctx.body = chart;
});

router.get("/chart/:date", async (ctx, next) => {
    let date = new Date(ctx.params.date);
    let chart = await getSortedChart(date);
    ctx.body = chart;
});

app.use(router.routes());

app.listen(8080);
