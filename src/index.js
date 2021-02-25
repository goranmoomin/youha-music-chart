let Koa = require("koa");
let Router = require("@koa/router");

let { getMelonChartItems, getSortedChartItems } = require("./chart.js");

let app = new Koa();
let router = new Router();
router.get("/", async (ctx, next) => {
    let html = `<html><head><meta charset="utf-8"><link rel="stylesheet" href="https://unpkg.com/mvp.css"></head><body><section><table><thead><tr><th>순위</th><th>앨범 표지</th><th>곡 이름</th><th>점수</th><th>앨범 표지</th><th>곡 이름</th></tr></thead><tbody>`;
    let date = new Date();
    let chartItems = await getSortedChartItems(date);
    let melonChartItems = await getMelonChartItems(date);
    for (let i = 0; i < chartItems.length; i++) {
        let music = chartItems[i];
        let melonMusic = melonChartItems[i];
        html += `<tr><td>${i + 1}</td><td><img src="${music.albumImgUrl}"></td><td>${music.name}</td><td>${music.score.toFixed(2)}</td><td><img src="${melonMusic.albumImgUrl}"></td><td>${melonMusic.name}</td></tr>`;
    }
    html += "</tbody></table></section></body></html>";
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

app.use(router.routes());

app.listen(8080);
