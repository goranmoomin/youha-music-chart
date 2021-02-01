let fs = require("fs/promises");

async function readJSONFile(path) {
    let data = await fs.readFile(path);
    let json = JSON.parse(data);
    return json;
}

async function sortedChart(date) {
    let pastDate = new Date(date.getTime() - 900000);

    function melonChartFilePath(date) {
        let year = `${date.getFullYear()}`;
        let month = `${date.getMonth() + 1}`.padStart(2, "0");
        let day = `${date.getDate()}`.padStart(2, "0");
        let hours = `${date.getHours()}`.padStart(2, "0");
        return `charts/chart-${year}.${month}.${day}.${hours}:00.json`;
    }
    let { response: { HITSSONGLIST: melonChartList } } = await readJSONFile(melonChartFilePath(date));

    let musicScores = new Map();

    function youtubeDataFilePath(date, query) {
        let year = `${date.getFullYear()}`;
        let month = `${date.getMonth() + 1}`.padStart(2, "0");
        let day = `${date.getDate()}`.padStart(2, "0");
        let hours = `${date.getHours()}`.padStart(2, "0");
        let minutes = `${Math.floor(date.getMinutes() / 15) * 15}`.padStart(2, "0");
        return `charts/youtube-data-${year}.${month}.${day}.${hours}:${minutes}/` +
            `video-list-response-${query}.json`;
    }

    for (let song of melonChartList) {
        let videoCounts = new Map();
        let name = song.SONGNAME;
        let query = `${song.SONGNAME} ${song.ARTISTLIST.map(artist => artist.ARTISTNAME).join(" ")}`;
        query.replace("/", "");

        let currentStatistics = await readJSONFile(youtubeDataFilePath(date, query));
        let pastStatistics = await readJSONFile(youtubeDataFilePath(pastDate, query));

        let commonIds = currentStatistics.items.slice(0, 5).map(item => item.id)
            .filter(id => pastStatistics.items.slice(0, 5).some(item => item.id == id));

        let score = 0;
        for (let id of commonIds) {
            let currentViewCount = currentStatistics.items.find(item => item.id == id).statistics.viewCount;
            let pastViewCount = pastStatistics.items.find(item => item.id == id).statistics.viewCount;
            score += currentViewCount - pastViewCount;
        }
        score /= commonIds.length;

        musicScores.set(name, score);
    }

    let chart = [...musicScores].sort((a, b) => -(a[1] - b[1])).map(([name, score]) => ({
        name,
        score,
        melonData: melonChartList.find(song => song.SONGNAME == name),
    }));
    return chart;
}

module.exports = sortedChart;
