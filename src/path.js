let { utcToZonedTime, format } = require("date-fns-tz");
let { dataRefreshPeriod } = require("./helpers.js");

function formatDate(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    return format(date, "yyyy.MM.dd.HH:mm");
}

function melonChartPath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(0);
    let path = `charts/chart-${format(date, "yyyy.MM.dd.HH:mm")}.json`;
    return path;
}

function genieChartPath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(0);
    let path = `charts/genie-chart-${format(date, "yyyy.MM.dd.HH:mm")}.json`;
    return path;
}

function youtubePath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(Math.floor(date.getMinutes() / dataRefreshPeriod) * dataRefreshPeriod);
    let path = `charts/youtube-${format(date, "yyyy.MM.dd.HH:mm")}`;
    return path;
}

function youtubeSearchResultPath(date, query) {
    let path = `${youtubePath(date)}/videos-${query}.json`;
    return path;
}


function youtubeCommentsDataPath(date, videoId) {
    let path = `${youtubePath(date)}/comments-list-response-${videoId}.json`;
    return path;
}

function youtubeCommentsCacheDataPath(date, videoId) {
    let path = `${youtubePath(date)}/comments-cache-${videoId}.json`;
    return path;
}

function chartCachePath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(Math.floor(date.getMinutes() / dataRefreshPeriod) * dataRefreshPeriod);
    let path = `charts/chart-cache-${format(date, "yyyy.MM.dd.HH:mm")}.json`;
    return path;
}

module.exports = {
    formatDate,
    melonChartPath,
    genieChartPath,
    youtubePath,
    youtubeSearchResultPath,
    youtubeCommentsDataPath,
    youtubeCommentsCacheDataPath,
    chartCachePath
};
