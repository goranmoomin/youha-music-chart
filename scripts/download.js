require("dotenv").config();

let fs = require("fs-extra");
let bent = require("bent");
let { google } = require("googleapis");
let youtube = google.youtube("v3");
let {
    zonedTimeToUtc,
    differenceInMinutes
} = require("date-fns-tz");

let {
    formatDate,
    melonChartPath,
    youtubeDataPath,
    youtubeVideoDataPath,
    youtubeSearchDataPath,
    youtubeCommentThreadDataPath,
    youtubeCommentThreadCacheDataPath
} = require("../src/path.js");
let { readJSONFile, hasKoreanLetter } = require("../src/helpers.js");

let getJSON = bent("json");

function formatMelonChart(melonChartResponse) {
    let day = melonChartResponse.response.RANKDAY.split(".").map(s => Number.parseInt(s));
    let hour = melonChartResponse.response.RANKHOUR.split(":").map(s => Number.parseInt(s));
    let date = zonedTimeToUtc(Date(...day, ...hour), "Asia/Seoul");
    let items = melonChartResponse.response.HITSSONGLIST.map(song => ({
        id: song.SONGID,
        name: song.SONGNAME,
        artistNames: song.ARTISTLIST.map(artist => artist.ARTISTNAME),
        albumImgUrl: song.ALBUMIMG
    }));
    return { date, items };
}

function optimizeYoutubeCommentThreadData(rawYoutubeCommentThreadData) {
    for (let commentThread of rawYoutubeCommentThreadData.data.items[0]) {
        let commentThreadSnippet = commentThread.snippet;
        delete commentThreadSnippet.videoId;
        delete commentThreadSnippet.canReply;
        delete commentThreadSnippet.isPublic;
        let commentSnippet = commentThreadSnippet.topLevelComment.snippet;
        delete commentSnippet.videoId;
        delete commentSnippet.textDisplay;
        delete commentSnippet.authorDisplayName;
        delete commentSnippet.authorProfileImageUrl;
        delete commentSnippet.authorChannelUrl;
        delete commentSnippet.canRate;
        delete commentSnippet.viewerRating;
    }
}

(async () => {
    let melonChartResponse = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    let melonChart = formatMelonChart(melonChartResponse);
    let date = new Date();
    await fs.outputJSON(melonChartPath(date), melonChart);
    console.log(`Downloaded Melon chart to ${melonChartPath(date)}.`);
    await Promise.all(melonChart.items.map(async song => {
        let name = song.name;
        let query = `${song.name} ${song.artistNames.join(" ")}`;
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
            part: ["contentDetails", "id", "statistics"],
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
                    optimizeYoutubeCommentThreadData(rawYoutubeCommentThreadData);
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
