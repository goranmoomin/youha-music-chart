require("dotenv").config();

let fs = require("fs-extra");
let bent = require("bent");
let { google } = require("googleapis");
let youtube = google.youtube("v3");

let getJSON = bent("json");

(async () => {
    let rawMelonData = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    let date = new Date();
    let year = `${date.getFullYear()}`;
    let month = `${date.getMonth() + 1}`.padStart(2, "0");
    let day = `${date.getDate()}`.padStart(2, "0");
    let hours = `${date.getHours()}`.padStart(2, "0");
    let minutes = `${Math.floor(date.getMinutes() / 15) * 15}`.padStart(2, "0");
    let melonDataPath = `charts/chart-${year}.${month}.${day}.${hours}:00.json`;
    await fs.outputJSON(melonDataPath, rawMelonData);
    let melonChartList = rawMelonData.response.HITSSONGLIST;
    Promise.all(melonChartList.map(async song => {
        let name = song.SONGNAME;
        let query = `${song.SONGNAME} ${song.ARTISTLIST.map(artist => artist.ARTISTNAME).join(" ")}`;
        let youtubeSearchDataPath = `charts/youtube-data-${year}.${month}.${day}.${hours}:${minutes}/search-list-response-${query.replaceAll("/", "")}.json`;
        let rawYoutubeSearchData = await youtube.search.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: "id",
            q: query,
            maxResults: 50
        });
        await fs.outputJSON(youtubeSearchDataPath, rawYoutubeSearchData);
        let youtubeVideoDataPath = `charts/youtube-data-${year}.${month}.${day}.${hours}:${minutes}/video-list-response-${query.replaceAll("/", "")}.json`;
        let searchedVideos = rawYoutubeSearchData.data.items;
        let rawYoutubeVideoData = await youtube.videos.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: ["contentDetails", "id", "liveStreamingDetails", "localizations", "player", "recordingDetails", "snippet", "statistics", "status", "topicDetails"],
            id: searchedVideos.map(video => video.id.videoId)
        });
        await fs.outputJSON(youtubeVideoDataPath, rawYoutubeVideoData);
    }));
})();
