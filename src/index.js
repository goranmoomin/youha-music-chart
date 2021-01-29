require("dotenv").config();

let bent = require("bent");
let { google } = require("googleapis");
let youtube = google.youtube("v3");

let getJSON = bent("json");

(async () => {
    let { response: { HITSSONGLIST: melonChartList } } = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    for (let song of melonChartList.slice(0, 10)) {
        let name = song.SONGNAME;
        let query = `${song.SONGNAME} ${song.ARTISTLIST.map(artist => artist.ARTISTNAME).join(" ")}`;
        let { data: { items: searchedVideos } } = await youtube.search.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: "id",
            q: query,
            maxResults: 5
        });

        let videosStatistics = await youtube.videos.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: "statistics",
            id: searchedVideos.map(video => video.id.videoId)
        });
        let videosViewCount = videosStatistics.data.items.reduce((viewCount, video) => viewCount + Number.parseInt(video.statistics.viewCount), 0);
        console.log(name, videosViewCount);
    }
})();
