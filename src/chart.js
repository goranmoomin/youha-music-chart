let fs = require("fs-extra");
let {
    melonChartPath,
    genieChartPath,
    chartCachePath,
    youtubeSearchResultPath,
    youtubeCommentsCacheDataPath
} = require("./path.js");
let { readJSONFile } = require("./helpers.js");
let { videoAnalysisDuration } = require("./video.js");
let { dataRefreshPeriod } = require("./helpers.js");

function blockIndex(date) {
    return Math.floor(date.getTime() / (dataRefreshPeriod * 60 * 1000));
}

async function getMelonChart(date) {
    let path = melonChartPath(date);
    let chart = await readJSONFile(path);
    return chart;
}

async function getMelonChartItems(date) {
    return (await getMelonChart(date)).items;
}

async function getGenieChart(date) {
    let path = genieChartPath(date);
    let chart = await readJSONFile(path);
    return chart;
}

async function getGenieChartItems(date) {
    return (await getGenieChart(date)).items;
}

async function getYoutubeVideos(date, query) {
    let path = youtubeSearchResultPath(date, query);
    let { items } = await readJSONFile(path);
    return items;
}

async function getKoreanCommentRate(date, video) {
    let videoId = video.id;
    let totalCommentCount = 0, totalKoreanCommentCount = 0;
    let oldestUntrackedDate = new Date(date.getTime() - videoAnalysisDuration(date, video));
    await Promise.all([...Array(blockIndex(date) - blockIndex(oldestUntrackedDate)).keys()].map(async index => {
        let date = new Date((blockIndex(oldestUntrackedDate) + index) * dataRefreshPeriod * 60 * 1000);
        let path = youtubeCommentsCacheDataPath(date, videoId);
        try {
            let { total, korean } = await readJSONFile(path);
            totalCommentCount += total;
            totalKoreanCommentCount += korean;
        } catch (error) {
            if (error.code != "ENOENT") {
                throw error;
            }
        }
    }));

    if (totalCommentCount == 0) { return undefined; }
    return totalKoreanCommentCount / totalCommentCount;
}

async function getSortedChartItems(date) {
    let pastDate = new Date(date.getTime() - dataRefreshPeriod * 60 * 1000);
    let melonChartItems = await getMelonChartItems(date);
    let genieChartItems = await getGenieChartItems(date);
    let chartItems = [];
    for (let chartItem of [...melonChartItems, ...genieChartItems]) {
        if (!chartItems.some(item => item.name == chartItem.name)) {
            chartItems.push(chartItem);
        }
    }

    let musicScores = new Map();
    for (let song of chartItems) {
        let videoCounts = new Map();
        let name = song.name;
        let query = `${song.name} ${song.artistNames.join(" ")}`;
        let currentVideos = await getYoutubeVideos(date, query);
        let pastVideos;
        try {
            pastVideos = await getYoutubeVideos(pastDate, query);
        } catch (e) {
            if (e.code == "ENOENT") {
                continue;
            }
            throw e;
        }

        let commonIds = currentVideos.slice(0, 5).map(item => item.id)
            .filter(id => pastVideos.slice(0, 5).some(item => item.id == id));

        let score = 0, exceptionCount = 0;
        for (let id of commonIds) {
            let currentVideo = currentVideos.find(item => item.id == id);
            let currentViewCount = currentVideo.viewCount;
            let pastViewCount = pastVideos.find(item => item.id == id).viewCount;
            let koreanCommentRate = await getKoreanCommentRate(date, currentVideo);
            if (koreanCommentRate == undefined) {
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
        ...chartItems.find(song => song.name == name)
    }));
    return chart;
}

async function getSortedChart(date) {
    return { items: await getSortedChartItems(date) };
}

async function getCachedSortedChart(date) {
    try {
        return await readJSONFile(chartCachePath(date));
    } catch (e) {
        if (e.code == "ENOENT") {
            let chart = await getSortedChart(date);
            await fs.outputJSON(chartCachePath(date), chart);
            return chart;
        }
        throw e;
    }
}

async function getCachedSortedChartItems(date) {
    return (await getCachedSortedChart(date)).items;
}

module.exports = {
    getMelonChart,
    getMelonChartItems,
    getSortedChart,
    getSortedChartItems,
    getCachedSortedChart,
    getCachedSortedChartItems
};
