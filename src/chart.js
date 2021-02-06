let fs = require("fs").promises;

async function readJSONFile(path) {
    let data = await fs.readFile(path);
    let json = JSON.parse(data);
    return json;
}

async function getMelonChart(date) {
    let year = `${date.getFullYear()}`;
    let month = `${date.getMonth() + 1}`.padStart(2, "0");
    let day = `${date.getDate()}`.padStart(2, "0");
    let hours = `${date.getHours()}`.padStart(2, "0");
    let path = `charts/chart-${year}.${month}.${day}.${hours}:00.json`;

    let { response: { HITSSONGLIST: melonChartList } } = await readJSONFile(path);
    return melonChartList;
}

async function getYoutubeStatistics(date, query) {
    let year = `${date.getFullYear()}`;
    let month = `${date.getMonth() + 1}`.padStart(2, "0");
    let day = `${date.getDate()}`.padStart(2, "0");
    let hours = `${date.getHours()}`.padStart(2, "0");
    let minutes = `${Math.floor(date.getMinutes() / 15) * 15}`.padStart(2, "0");
    let path = `charts/youtube-data-${year}.${month}.${day}.${hours}:${minutes}/` +
        `video-list-response-${query.replace(/\//g, "")}.json`;
    return await readJSONFile(path);
}

async function getSortedChart(date) {
    let pastDate = new Date(date.getTime() - 900000);
    let melonChartList = await getMelonChart(date);
    let musicScores = new Map();

    for (let song of melonChartList) {
        let videoCounts = new Map();
        let name = song.SONGNAME;
        let query = `${song.SONGNAME} ${song.ARTISTLIST.map(artist => artist.ARTISTNAME).join(" ")}`;

        let currentStatistics = await getYoutubeStatistics(date, query);
        let pastStatistics = await getYoutubeStatistics(pastDate, query);

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

module.exports = {
    getMelonChart,
    getSortedChart
};
