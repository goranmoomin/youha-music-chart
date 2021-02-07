require("dotenv").config();

let fs = require("fs-extra");
let bent = require("bent");
let { google } = require("googleapis");
let youtube = google.youtube("v3");

let { melonDataPath, youtubeDataPath, youtubeVideoDataPath, youtubeSearchDataPath } = require("../src/path.js");

let getJSON = bent("json");

(async () => {
    let rawMelonData = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    let date = new Date();
    await fs.outputJSON(melonDataPath(date), rawMelonData);
    console.log(`Downloaded Melon chart to ${melonDataPath(date)}.`);
    let melonChartList = rawMelonData.response.HITSSONGLIST;
    await Promise.all(melonChartList.map(async song => {
        let name = song.SONGNAME;
        let query = `${song.SONGNAME} ${song.ARTISTLIST.map(artist => artist.ARTISTNAME).join(" ")}`;
        let rawYoutubeSearchData = await youtube.search.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: "id",
            q: query,
            maxResults: 50
        });
        await fs.outputJSON(youtubeSearchDataPath(date, query), rawYoutubeSearchData);
        let searchedVideos = rawYoutubeSearchData.data.items;
        let rawYoutubeVideoData = await youtube.videos.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: ["contentDetails", "id", "liveStreamingDetails", "localizations", "player", "recordingDetails", "snippet", "statistics", "status", "topicDetails"],
            id: searchedVideos.map(video => video.id.videoId)
        });
        await fs.outputJSON(youtubeVideoDataPath(date, query), rawYoutubeVideoData);
    }));
    console.log(`Downloaded YouTube data to ${youtubeDataPath(date)}.`);
})();
