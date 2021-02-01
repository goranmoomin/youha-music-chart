let http = require("http");
let sortedChart = require("./chart.js");

http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.writeHead(200);
    let html = `<html><head><meta charset="utf-8"><link rel="stylesheet" href="https://unpkg.com/mvp.css"></head><body><section><table><thead><tr><th>순위</th><th>앨범 표지</th><th>곡 이름</th><th>점수</th></tr></thead><tbody>`;
    let date = new Date();
    let musicRank = await sortedChart(date);
    let index = 0;
    for (let { name, score, melonData } of musicRank) {
        index++;
        html += `<tr><td>${index}</td><td><img src="${melonData.ALBUMIMGSMALL}"></td><td>${name}</td><td>${score.toFixed(2)}</td></tr>`;
    }
    html += "</tbody></section></body></html>";
    res.end(html);
}).listen(8080);
