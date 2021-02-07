let { utcToZonedTime, format } = require("date-fns-tz");

function melonDataPath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(0);
    let path = `charts/chart-${format(date, "yyyy.MM.dd.HH:mm")}.json`;
    return path;
}

function youtubeDataPath(date) {
    date = utcToZonedTime(date, "Asia/Seoul");
    date.setMinutes(Math.floor(date.getMinutes() / 15) * 15);
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

module.exports = {
    melonDataPath,
    youtubeDataPath,
    youtubeVideoDataPath,
    youtubeSearchDataPath
};
