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
let { dataRefreshPeriod } = require("../src/helpers.js");
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

function formatYoutubeCommentThread({ id, snippet }) {
    try {
        let commentSnippet = snippet.topLevelComment.snippet;
        let text = commentSnippet.textOriginal;
        let date = commentSnippet.publishedAt;
        let likeCount = commentSnippet.likeCount;
        let authorId = commentSnippet.authorChannelId && commentSnippet.authorChannelId.value;
        return {
            id, text, date, likeCount, authorId
        };
    } catch (e) {
        throw e;
    }
}

function blockIndex(date) {
    return Math.floor(date.getTime() / (dataRefreshPeriod * 60 * 1000));
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
            let oldestUntrackedDate = new Date(date.getTime() - videoAnalysisDuration(date, video));
            let currentDate = oldestUntrackedDate;
            for (let currentDate = oldestUntrackedDate; currentDate.getTime() <= date.getTime(); currentDate = new Date(currentDate.getTime() + dataRefreshPeriod * 60 * 1000)) {
                try {
                    await fs.readFile(youtubeCommentsDataPath(currentDate, videoId));
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
                    let youtubeCommentThreadsResponse = await youtube.commentThreads.list({
                        auth: process.env.YOUTUBE_API_KEY,
                        part: ["id", "replies", "snippet"],
                        videoId,
                        order: "time",
                        pageToken,
                        maxResults: 100
                    });
                    let youtubeCommentThreads = youtubeCommentThreadsResponse.data.items;
                    let currentPageComments = youtubeCommentThreads.map(formatYoutubeCommentThread);

                    for (let comment of currentPageComments) {
                        let commentWrittenDate = new Date(comment.date);
                        if (blockIndex(date) > blockIndex(commentWrittenDate)
                            && blockIndex(commentWrittenDate) >= blockIndex(oldestUntrackedDate)) {
                            comments.push(comment);
                        }
                    }
                    if (!youtubeCommentThreads.length) { break; }
                    let lastYoutubeCommentThread = youtubeCommentThreads[youtubeCommentThreads.length - 1];
                    lastDate = new Date(lastYoutubeCommentThread.snippet.topLevelComment.snippet.publishedAt);
                    pageToken = youtubeCommentThreadsResponse.data.nextPageToken;
                } catch(e) {
                    if (e.message === `The video identified by the <code><a href="/youtube/v3/docs/commentThreads/list#videoId">videoId</a></code> parameter has disabled comments.`) {
                        console.log(`Not downloading YouTube comment thread for video ${videoId} as it has disabled comments.`);
                        break;
                    }
                    throw e;
                }
            } while (pageToken && blockIndex(lastDate) >= blockIndex(oldestUntrackedDate))

            let currentBlockStartIndex = 0, currentCommentIndex = 0;
            for (let currentBlockIndex = blockIndex(date) - 1; currentBlockIndex >= blockIndex(oldestUntrackedDate); --currentBlockIndex) {
                while (currentCommentIndex < comments.length
                       && blockIndex(new Date(comments[currentCommentIndex].date)) == currentBlockIndex) { ++currentCommentIndex; }
                await fs.outputJSON(youtubeCommentsDataPath(new Date(currentBlockIndex * dataRefreshPeriod * 60 * 1000), videoId),
                                    { items: comments.slice(currentBlockStartIndex, currentCommentIndex) });
                currentBlockStartIndex = currentCommentIndex + 1;
                currentCommentIndex = currentBlockStartIndex;
            }

            await Promise.all([...Array(blockIndex(date) - blockIndex(oldestUntrackedDate)).keys()].map(async index => {
                let currentDate = new Date((blockIndex(oldestUntrackedDate) + index) * dataRefreshPeriod * 60 * 1000);
                try {
                    let { items: currentComments } = await readJSONFile(youtubeCommentsDataPath(currentDate, videoId));
                    let currentBlockCommentCount = currentComments.length;
                    let currentBlockKoreanCommentCount = 0;
                    for (let comment of currentComments) {
                        if (hasKoreanLetter(comment.text)) {
                            ++currentBlockKoreanCommentCount;
                        }
                    }
                    let currentBlockCommentInfo = { total: currentBlockCommentCount, korean: currentBlockKoreanCommentCount };
                    await fs.outputJSON(youtubeCommentsCacheDataPath(currentDate, videoId), currentBlockCommentInfo);
                } catch (error) {
                    throw error;
                }
            }));
        }));
    }));
    console.log(`Downloaded YouTube data to ${youtubePath(date)}.`);
})();
