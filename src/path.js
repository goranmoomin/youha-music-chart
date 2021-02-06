let { utcToZonedTime, format } = require("date-fns-tz");

function melonDataPath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(0);
    let path = `charts/chart-${format(date, "yyyy.MM.dd.HH:mm")}.json`;
    return path;
}

function youtubeVideoDataPath(date, query) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(Math.floor(date.getMinutes() / 15) * 15);
    query = query.replace(/\//g, "");
    let path = `charts/youtube-data-${format(date, "yyyy.MM.dd.HH:mm")}/video-list-response-${query}.json`;
    return path;
}

function youtubeSearchDataPath(date, query) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(Math.floor(date.getMinutes() / 15) * 15);
    query = query.replace(/\//g, "");
    let path = `charts/youtube-data-${format(date, "yyyy.MM.dd.HH:mm")}/search-list-response-${query}.json`;
    return path;
}

module.exports = {
    melonDataPath,
    youtubeVideoDataPath,
    youtubeSearchDataPath
};
