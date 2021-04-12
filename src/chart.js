let fs = require("fs-extra");

let knex = require("knex")({
    client: "sqlite3",
    connection: {
        filename: "charts.db"
    },
    useNullAsDefault: true
});

let { hasKoreanLetter } = require("./helpers.js");
let { videoAnalysisDuration } = require("./video.js");
let { dataRefreshPeriod } = require("./helpers.js");

function blockIndex(date) {
    return Math.floor(date.getTime() / (dataRefreshPeriod * 60 * 1000));
}

async function getYouhaChartItems(date) {
    let prevDate = new Date(date.getTime() - dataRefreshPeriod * 60 * 1000);
    let youhaChart = await knex("song_chart")
        .join("chart", "song_chart.chart_id", "=", "chart.id")
        .join("song", "song_chart.song_id", "=", "song.id")
        .where({ "chart.type": 0 })
        .andWhereRaw("chart.datetime > ?", prevDate.toISOString())
        .andWhereRaw("chart.datetime <= ?", date.toISOString())
        .orderBy("song_chart.song_rank");
    return youhaChart;
}

async function getMelonChartItems(date) {
    let prevDate = new Date(date.getTime() - 60 * 60 * 1000);
    let melonChart = await knex("song_chart")
        .join("chart", "song_chart.chart_id", "=", "chart.id")
        .join("song", "song_chart.song_id", "=", "song.id")
        .where({ "chart.type": 1 })
        .andWhereRaw("chart.datetime > ?", prevDate.toISOString())
        .andWhereRaw("chart.datetime <= ?", date.toISOString())
        .orderBy("song_chart.song_rank");
    return melonChart;
}

async function getYoutubeVideos(date, songId) {
    date = new Date(Math.floor(date.getTime() / (dataRefreshPeriod * 60 * 1000)) * (dataRefreshPeriod * 60 * 1000));
    let videostatistics = await knex("videostatistics")
        .whereIn("video_id", knex("song_video")
                 .select("video_id")
                 .where({ song_id: songId }))
        .andWhere({ datetime: date.toISOString() });

    return Promise.all(videostatistics.map(async videoInfo => ({
        id: videoInfo.video_id,
        commentCount: videoInfo.comment_count,
        viewCount: videoInfo.view_count,
        publishedAt: (await knex("video")
                      .where({ id: videoInfo.video_id }))[0].published_at
    })));
}

async function getKoreanCommentRate(date, video) {
    let videoId = video.id;
    let totalCommentCount = 0, totalKoreanCommentCount = 0;

    let startDate = new Date(date.getTime() - videoAnalysisDuration(date, video));
    (await knex("comment").select("text")
     .where({ video_id: videoId })
     .andWhereRaw("published_at >= ?", startDate.toISOString())
     .andWhereRaw("published_at < ?", date.toISOString()))
        .forEach(comment => {
            ++totalCommentCount;
            if (hasKoreanLetter(comment.text)) { ++totalKoreanCommentCount; }
        });
    if (totalCommentCount == 0) { return undefined; }
    return totalKoreanCommentCount / totalCommentCount;
}

async function getSortedChartItems(date) {
    let pastDate = new Date(date.getTime() - dataRefreshPeriod * 60 * 1000);
    let melonChartItems = await getMelonChartItems(date);
    let chartItems = melonChartItems;

    let musicScores = new Map();
    for (let song of chartItems) {
        let name = song.name;
        let currentVideos = await getYoutubeVideos(date, song.song_id);
        let pastVideos;
        try {
            pastVideos = await getYoutubeVideos(pastDate, song.song_id);
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

    await knex.destroy();

    let chart = [...musicScores].sort((a, b) => -(a[1] - b[1])).map(([name, score]) => ({
        score,
        ...chartItems.find(song => song.name == name)
    }));
    return chart;
}

module.exports = {
    getMelonChartItems,
    getYouhaChartItems,
    getSortedChartItems
};
