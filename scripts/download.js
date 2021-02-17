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

let getJSON = bent("json");

function hasKoreanLetter(comment) {
    for (let index = 0; index < comment.length; ++index) {
        let unicode = comment.charCodeAt(index);
        if ((0xAC00 <= unicode && unicode <= 0xD7A3)
            || (0x1100 <= unicode && unicode <= 0x11FF)
            || (0x3130 <= unicode && unicode <= 0x318F)
            || (0xA960 <= unicode && unicode <= 0xA97F)
            || (0xD7B0 <= unicode && unicode <= 0xD7FF)) {
            return true;
        }
    }
    return false;
}

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
            let videoCommentsCache = {};

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

                    let recentCommentCount = 0, recentKoreanCommentCount = 0;
                    commentThreads.map(comment => {
                        let commentSnippet = comment.snippet.topLevelComment.snippet;
                        if (differenceInMinutes(date, new Date(commentSnippet.publishedAt)) < 15) {
                            recentCommentCount += 1;
                            if (hasKoreanLetter(commentSnippet.textOriginal)) {
                                recentKoreanCommentCount += 1;
                            }
                        }
                    });
                    videoCommentsCache["recentCommentInfo"] = { "total": recentCommentCount, "korean": recentKoreanCommentCount };
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
                    console.log(pageToken);
                }
            } while (pageToken && differenceInMinutes(date, lastDate) < 15)

            let totalCommentCount = 0, totalKoreanCommentCount = 0;
            await Promise.all([...Array(2 * 4 * 24).keys()].map(async prev => {
                let prevDate = new Date(date.getTime() - prev * 1000 * 60 * 15);
                let path = youtubeCommentThreadCacheDataPath(prevDate, videoId);
                try {
                    let data = await fs.readFile(path);
                    data = JSON.parse(data);
                    if (data.hasOwnProperty("recentCommentInfo")) {
                        console.log("enter");
                        totalCommentCount += data["recentCommentInfo"]["total"];
                        totalKoreanCommentCount += data["recentCommentInfo"]["korean"];
                    }
                } catch (error) {
                    if (error.code != "ENOENT") {
                        console.log("path", path);
                        throw error;
                    }
                }
            }));
            videoCommentsCache["totalCommentInfo"] = { "total": totalCommentCount, "korean": totalKoreanCommentCount };
            console.log(videoCommentsCache);

            if (Object.keys(videoCommentsCache).length < 2) {
                console.log("date", date);
                console.log("videoId", videoId);
            } else {
                videoCommentsCache["totalCommentInfo"]["total"] += videoCommentsCache["recentCommentInfo"]["total"];
                videoCommentsCache["totalCommentInfo"]["korean"] += videoCommentsCache["recentCommentInfo"]["korean"];
                await fs.outputJSON(youtubeCommentThreadCacheDataPath(date, videoId), videoCommentsCache);
            }
        }));
    }));
    console.log(`Downloaded YouTube data to ${youtubeDataPath(date)}.`);
})();
