let fs = require("fs").promises;
let { melonDataPath, youtubeVideoDataPath } = require("./path.js");

async function readJSONFile(path) {
    let data = await fs.readFile(path);
    let json = JSON.parse(data);
    return json;
}

async function getMelonChart(date) {
    let path = melonDataPath(date);
    let { response: { HITSSONGLIST: melonChartList } } = await readJSONFile(path);
    return melonChartList;
}

async function getYoutubeStatistics(date, query) {
    let path = youtubeVideoDataPath(date, query);
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
        let pastStatistics;
        try {
            pastStatistics = await getYoutubeStatistics(pastDate, query);
        } catch (e) {
            continue;
        }

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
