let fs = require("fs").promises;
let {
    melonChartPath,
    youtubeVideoDataPath,
    youtubeCommentThreadCacheDataPath
} = require("./path.js");
let { readJSONFile } = require("./helpers.js");


async function getMelonChartItems(date) {
    let path = melonChartPath(date);
    let { items } = await readJSONFile(path);
    return items;
}

async function getYoutubeStatistics(date, query) {
    let path = youtubeVideoDataPath(date, query);
    let { data: youtubeData } = await readJSONFile(path);
    return youtubeData;
}

async function getKoreanCommentRate(date, videoId) {
    let path = youtubeCommentThreadCacheDataPath(date, videoId);
    try {
        let { totalCommentInfo: { total, korean } } = await readJSONFile(path);
        if (total == 0) { return null; }
        return korean / total;
    } catch (error) {
        if (error.code != "ENOENT") {
            throw error;
        }
        return null;
    }
}

async function getSortedChartItems(date) {
    let pastDate = new Date(date.getTime() - 900000);
    let melonChart = await getMelonChartItems(date);
    let musicScores = new Map();

    for (let song of melonChart) {
        let videoCounts = new Map();
        let name = song.name;
        let query = `${song.name} ${song.artistNames.join(" ")}`;
        let currentStatistics = await getYoutubeStatistics(date, query);
        let pastStatistics;
        try {
            pastStatistics = await getYoutubeStatistics(pastDate, query);
        } catch (e) {
            if (e.code == "ENOENT") {
                continue;
            }
            throw e;
        }

        let commonIds = currentStatistics.items.slice(0, 5).map(item => item.id)
            .filter(id => pastStatistics.items.slice(0, 5).some(item => item.id == id));

        let score = 0, exceptionCount = 0;
        for (let id of commonIds) {
            let currentViewCount = currentStatistics.items.find(item => item.id == id).statistics.viewCount;
            let pastViewCount = pastStatistics.items.find(item => item.id == id).statistics.viewCount;
            let koreanCommentRate = await getKoreanCommentRate(date, id);
            if (koreanCommentRate == null) {
                exceptionCount += 1;
            } else {
                score += (currentViewCount - pastViewCount) * koreanCommentRate;
            }
        }
        if (commonIds.length > exceptionCount) {
            score /= (commonIds.length - exceptionCount);
            musicScores.set(name, score);
        }
    }

    let chart = [...musicScores].sort((a, b) => -(a[1] - b[1])).map(([name, score]) => ({
        score,
        ...melonChart.find(song => song.name == name)
    }));
    return chart;
}

module.exports = {
    getMelonChartItems,
    getSortedChartItems
};
