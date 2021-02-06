let http = require("http");
let { getMelonChart, getSortedChart } = require("./chart.js");

http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.writeHead(200);
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
    res.end(html);
}).listen(8080);
