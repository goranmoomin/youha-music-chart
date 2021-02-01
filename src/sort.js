require("dotenv").config();

let fs = require("fs/promises");
let bent = require("bent");
let { google } = require("googleapis");
let youtube = google.youtube("v3");

let getJSON = bent("json");

(async () => {
    let musicScores = new Map();
    function timeStamp(date) {
        return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}.${String(date.getHours()).padStart(2, '0')}:00`;
    }
    let date = new Date();
    let { response: { HITSSONGLIST: melonChartList } } = JSON.parse(await fs.readFile(`charts/chart-${timeStamp(date)}.json`));
    
    for (let song of melonChartList.slice(0, 100)) {
        let videoCounts = new Map();
        let name = song.SONGNAME;
        let query = `${song.SONGNAME} ${song.ARTISTLIST.map(artist => artist.ARTISTNAME).join(" ")}`;
        query.replace("/", "");

        let viewCounts = []; // view counts over time
        for (let iter of Array(2).keys()) {
            let statistics = JSON.parse(await fs.readFile(`charts/youtube-data-${timeStamp(new Date(date.getTime() - 900000 * (1 - iter)))}/video-list-response-${query}.json`));
            statistics.items.map(video => {
                if (!videoCounts.has(video.id)) { videoCounts.set(video.id, 0); }
                videoCounts.set(video.id, videoCounts.get(video.id) + 1);
            });
        }
        
        for (let iter of Array(2).keys()) {
            let statistics = JSON.parse(await fs.readFile(`charts/youtube-data-${timeStamp(new Date(date.getTime() - 900000 * (1 - iter)))}/video-list-response-${query}.json`));
            let validVideos = 0;
            let viewCount = statistics.items.reduce((viewCount, video) => {
                if (videoCounts.get(video.id) < 2) { return viewCount; }
                validVideos += 1;
                return viewCount + Number.parseInt(video.statistics.viewCount);
            }, 0);
            viewCounts[iter] = viewCount / validVideos;
        }
        
        if (viewCounts.includes(undefined)) { continue; }
        function calculateScore(viewCount) {
            return viewCount[1] - viewCount[0];
        }
        musicScores.set(name, calculateScore(viewCounts));
    }
    
    musicScores = new Map([...musicScores].sort((a, b) => -(a[1] - b[1])));
    for (let [name, score] of musicScores) {
        console.log(name, score);
    }
})();
