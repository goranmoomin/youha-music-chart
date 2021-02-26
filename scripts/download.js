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
    youtubePath,
    youtubeSearchResultPath,
    youtubeCommentsDataPath,
    youtubeCommentsCacheDataPath,
    chartCachePath
} = require("../src/path.js");
let { readJSONFile, hasKoreanLetter } = require("../src/helpers.js");
let { videoAnalysisDuration } = require("../src/video.js");
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

function formatYoutubeVideo({ id, snippet, statistics }) {
    let { viewCount, likeCount, dislikeCount, favoriteCount, commentCount } = statistics;
    let { publishedAt } = snippet;
    return {
        id, publishedAt, viewCount, likeCount, dislikeCount, favoriteCount, commentCount
    };
}

function formatYoutubeComment({ id, snippet }) {
    try {
        let commentInfo = snippet.topLevelComment.snippet;
        let text = commentInfo.textOriginal;
        let date = commentInfo.publishedAt;
        let likeCount = commentInfo.likeCount;
        let authorId = (commentInfo.authorChannelId == undefined) ? undefined : commentInfo.authorChannelId.value;
        return {
            id, text, date, likeCount, authorId
        };
    } catch (e) {
        throw e;
    }
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

function blockIndexOf(date) {
    return Math.floor(date.getTime() / (30 * 60 * 1000));
}

(async () => {
    let chartCache = {};
    let melonChartResponse = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    let melonChart = formatMelonChart(melonChartResponse);
    let date = new Date();
    await fs.outputJSON(melonChartPath(date), melonChart);
    console.log(`Downloaded Melon chart to ${melonChartPath(date)}.`);
    await Promise.all(melonChart.items.map(async song => {
        let name = song.name;
        let query = `${song.name} ${song.artistNames.join(" ")}`;
        let youtubeSearchResponse = await youtube.search.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: "id",
            q: query,
            maxResults: 50
        });
        let youtubeVideosResponse = await youtube.videos.list({
            auth: process.env.YOUTUBE_API_KEY,
            part: ["contentDetails", "id", "snippet", "statistics"],
            id: youtubeSearchResponse.data.items.map(video => video.id.videoId)
        });

        let youtubeSearchResult = { items: youtubeVideosResponse.data.items.map(formatYoutubeVideo) };
        await fs.outputJSON(youtubeSearchResultPath(date, query), youtubeSearchResult);
        let youtubeVideos = youtubeSearchResult.items;

        await Promise.all(youtubeVideos.slice(0, 5).map(async video => {
            let videoId = video.id;
            console.log(`Downloading YouTube comments for video ${videoId}.`);
            console.log(videoAnalysisDuration(date, video));
            let oldestUntrackedDate = new Date(date.getTime() - videoAnalysisDuration(date, video));
            let curDate = oldestUntrackedDate;
            for (let curDate = oldestUntrackedDate; curDate.getTime() <= date.getTime(); curDate = new Date(curDate.getTime() + 30 * 60 * 1000)) {
                try {
                    await fs.readFile(youtubeCommentsDataPath(curDate, videoId));
                } catch (error) {
                    if (error.code == "ENOENT") {
                        break;
                    } else {
                        throw error;
                    }
                }
            }

            let pageToken;
            let lastDate = date;
            let comments = [];
            do {
                console.log(`Downloading YouTube comment thread from ${formatDate(lastDate)} for video ${videoId}.`);
                try {
                    let rawYoutubeCommentThreadData = await youtube.commentThreads.list({
                        auth: process.env.YOUTUBE_API_KEY,
                        part: ["id", "replies", "snippet"],
                        videoId,
                        order: "time",
                        pageToken,
                        maxResults: 100
                    });
                    // optimizeYoutubeCommentThreadData(rawYoutubeCommentThreadData);
                    // await fs.outputJSON(youtubeCommentsDataPath(date, videoId, index), rawYoutubeCommentThreadData);
                    let commentThreads = rawYoutubeCommentThreadData.data.items;
                    let curPageComments = commentThreads.map(formatYoutubeComment);
                    // console.log(curPageComments);
                    for (let comment of curPageComments) {
                        let commentWrittenDate = new Date(comment.date);
                        // console.log('current: ', blockIndexOf(date));
                        // console.log('publishedAt: ', blockIndexOf(commentWrittenDate));
                        // console.log('oldestuntrackeddate: ', blockIndexOf(oldestUntrackedDate));
                        if (blockIndexOf(date) > blockIndexOf(commentWrittenDate)
                            && blockIndexOf(commentWrittenDate) >= blockIndexOf(oldestUntrackedDate)) {
                            comments.push(comment);
                        }
                    }
                    if (!commentThreads.length) { break; }
                    let lastCommentThread = commentThreads[commentThreads.length - 1];
                    lastDate = new Date(lastCommentThread.snippet.topLevelComment.snippet.publishedAt);
                    pageToken = rawYoutubeCommentThreadData.data.nextPageToken;
                } catch(e) {
                    if (e.message === `The video identified by the <code><a href="/youtube/v3/docs/commentThreads/list#videoId">videoId</a></code> parameter has disabled comments.`) {
                        console.log(`Not downloading YouTube comment thread for video ${videoId} as it has disabled comments.`);
                        break;
                    }
                    throw e;
                }
            } while (pageToken && blockIndexOf(lastDate) >= blockIndexOf(oldestUntrackedDate))

            // console.log(comments);

            let curBlockStartIndex = 0, curCommentIndex = 0;
            for (let curBlockIndex = blockIndexOf(date) - 1; curBlockIndex >= blockIndexOf(oldestUntrackedDate); --curBlockIndex) {
                while (curCommentIndex < comments.length
                       && blockIndexOf(new Date(comments[curCommentIndex].date)) == curBlockIndex) { ++curCommentIndex; }
                await fs.outputJSON(youtubeCommentsDataPath(new Date(curBlockIndex * 30 * 60 * 1000), videoId),
                                    { items: comments.slice(curBlockStartIndex, curCommentIndex) });
                curBlockStartIndex = curCommentIndex + 1;
                curCommentIndex = curBlockStartIndex;
            }

            await Promise.all([...Array(blockIndexOf(date) - blockIndexOf(oldestUntrackedDate)).keys()].map(async index => {
                let curDate = new Date((blockIndexOf(oldestUntrackedDate) + index) * 30 * 60 * 1000); 
                try {
                    let { items: curComments } = await readJSONFile(youtubeCommentsDataPath(curDate, videoId));
                    let curBlockCommentCount = curComments.length;
                    let curBlockKoreanCommentCount = 0;
                    for (let comment of curComments) {
                        if (hasKoreanLetter(comment.text)) {
                            ++curBlockKoreanCommentCount;
                        }
                    }
                    let curBlockCommentInfo = { total: curBlockCommentCount, korean: curBlockKoreanCommentCount }; 
                    await fs.outputJSON(youtubeCommentsCacheDataPath(curDate, videoId), curBlockCommentInfo);
                } catch (error) {
                    throw error;
                }
            }));
        }));
    }));
    console.log(`Downloaded YouTube data to ${youtubePath(date)}.`);
})();
