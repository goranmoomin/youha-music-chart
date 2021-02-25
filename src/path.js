let { utcToZonedTime, format } = require("date-fns-tz");

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

function youtubeDataPath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(Math.floor(date.getMinutes() / 30) * 30);
    let path = `charts/youtube-data-${format(date, "yyyy.MM.dd.HH:mm")}`;
    return path;
}

function youtubeVideoDataPath(date, query) {
    let path = `${youtubeDataPath(date)}/video-list-response-${query}.json`;
    return path;
}

function youtubeSearchDataPath(date, query) {
    let path = `${youtubeDataPath(date)}/search-list-response-${query}.json`;
    return path;
}

function youtubeCommentThreadDataPath(date, videoId, index) {
    let path = `${youtubeDataPath(date)}/comment-thread-list-response-${videoId}-${index}.json`;
    return path;
}

function youtubeCommentThreadCacheDataPath(date, videoId) {
    let path = `${youtubeDataPath(date)}/comment-thread-cache-${videoId}.json`;
    return path;
}

module.exports = {
    formatDate,
    melonChartPath,
    youtubeDataPath,
    youtubeVideoDataPath,
    youtubeSearchDataPath,
    youtubeCommentThreadDataPath,
    youtubeCommentThreadCacheDataPath
};
