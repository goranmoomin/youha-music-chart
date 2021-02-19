require("dotenv").config();

let fs = require("fs-extra");
let bent = require("bent");
let { google } = require("googleapis");
let youtube = google.youtube("v3");
let { differenceInMinutes } = require("date-fns");

let {
    formatDate,
    melonDataPath,
    youtubeDataPath,
    youtubeVideoDataPath,
    youtubeSearchDataPath,
    youtubeCommentThreadDataPath,
    youtubeCommentThreadCacheDataPath
} = require("../src/path.js");
let { readJSONFile, hasKoreanLetter } = require("../src/helpers.js");

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

        await Promise.all(searchedVideos.slice(0, 5).map(video => video.id.videoId).map(async videoId => {
            console.log(`Downloading YouTube comments for video ${videoId}.`);
            let pageToken;
            let lastDate = date;
            let index = 0;
            let recentCommentCount = 0;
            let recentKoreanCommentCount = 0;

            do {
                console.log(`Downloading YouTube comment thread ${index + 1} from ${formatDate(lastDate)} for video ${videoId}.`);
                try {
                    let rawYoutubeCommentThreadData = await youtube.commentThreads.list({
                        auth: process.env.YOUTUBE_API_KEY,
                        part: ["id", "replies", "snippet"],
                        videoId,
                        order: "time",
                        pageToken,
                        maxResults: 100
                    });
                    await fs.outputJSON(youtubeCommentThreadDataPath(date, videoId, index), rawYoutubeCommentThreadData);
                    let commentThreads = rawYoutubeCommentThreadData.data.items;
                    for (let commentThread of commentThreads) {
                        let comment = commentThread.snippet.topLevelComment;
                        if (differenceInMinutes(date, new Date(comment.publishedAt)) < 30) {
                            recentCommentCount += 1;
                            if (hasKoreanLetter(comment.textOriginal)) {
                                recentKoreanCommentCount += 1;
                            }
                        }
                    }
                    if (!commentThreads.length) { break; }
                    let lastCommentThread = commentThreads[commentThreads.length - 1];
                    lastDate = new Date(lastCommentThread.snippet.topLevelComment.snippet.publishedAt);
                    pageToken = rawYoutubeCommentThreadData.data.nextPageToken;
                    index += 1;
                } catch(e) {
                    if (e.message === `The video identified by the <code><a href="/youtube/v3/docs/commentThreads/list#videoId">videoId</a></code> parameter has disabled comments.`) {
                        console.log(`Not downloading YouTube comment thread for video ${videoId} as it has disabled comments.`);
                        break;
                    }
                    throw e;
                }
            } while (pageToken && differenceInMinutes(date, lastDate) < 30)

            let totalCommentCount = 0;
            let totalKoreanCommentCount = 0;
            await Promise.all([...Array(2 * (60 / 30) * 24).keys()].map(async prev => {
                let prevDate = new Date(date.getTime() - prev * 1000 * 60 * 30);
                try {
                    let { recentCommentInfo } = await readJSONFile(youtubeCommentThreadCacheDataPath(prevDate, videoId));
                    totalCommentCount += recentCommentInfo.total;
                    totalKoreanCommentCount += recentCommentInfo.korean;
                } catch (error) {
                    if (error.code != "ENOENT") {
                        throw error;
                    }
                }
            }));
            totalCommentCount += recentCommentCount;
            totalKoreanCommentCount += recentKoreanCommentCount;

            let youtubeCommentThreadCache = {
                totalCommentInfo: { total: totalCommentCount, korean: totalKoreanCommentCount },
                recentCommentInfo: { total: recentCommentCount, korean: recentKoreanCommentCount }
            };
            await fs.outputJSON(youtubeCommentThreadCacheDataPath(date, videoId), youtubeCommentThreadCache);
        }));
    }));
    console.log(`Downloaded YouTube data to ${youtubeDataPath(date)}.`);
})();
