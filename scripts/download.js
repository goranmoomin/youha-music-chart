require("dotenv").config();

let process = require("process");
let bent = require("bent");
let { google } = require("googleapis");
let youtube = google.youtube("v3");
let {
    zonedTimeToUtc,
    differenceInMinutes
} = require("date-fns-tz");
let { toDate, startOfHour } = require("date-fns");
let { MongoClient } = require("mongodb");

let { formatDate } = require("../src/path.js");
let { readJSONFile, hasKoreanLetter } = require("../src/helpers.js");
let { videoAnalysisDuration } = require("../src/video.js");
let { dataRefreshPeriod } = require("../src/helpers.js");
let { getSortedChart } = require("../src/chart.js");
let getJSON = bent("json");

let uri = process.env.MONGODB_URI;
let client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

function startOfDataRefresh(date) {
    date = toDate(date);
    date.setMinutes(Math.floor(date.getMinutes() / dataRefreshPeriod) * dataRefreshPeriod, 0, 0);
    return date;
}

function formatMelonChart(date, melonChartResponse) {
    date = startOfHour(date);
    let items = melonChartResponse.response.HITSSONGLIST.map(song => ({
        id: song.SONGID,
        name: song.SONGNAME,
        artistNames: song.ARTISTLIST.map(artist => artist.ARTISTNAME),
        albumImgUrl: song.ALBUMIMG
    }));
    return { date, items };
}

function formatGenieChart(date, genieChartResponse) {
    date = startOfHour(date);
    let items = genieChartResponse.DataSet.DATA.map(song => ({
        id: song.SONG_ID,
        name: decodeURIComponent(song.SONG_NAME),
        artistNames: [decodeURIComponent(song.ARTIST_NAME)],
        albumImgUrl: decodeURIComponent(song.ALBUM_IMG_PATH)
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
        let videoId = snippet.videoId;
        let commentSnippet = snippet.topLevelComment.snippet;
        let text = commentSnippet.textOriginal;
        let date = commentSnippet.publishedAt;
        let likeCount = commentSnippet.likeCount;
        let authorId = commentSnippet.authorChannelId && commentSnippet.authorChannelId.value;
        return {
            id, videoId, text, date, likeCount, authorId
        };
    } catch (e) {
        throw e;
    }
}

function blockIndex(date) {
    return Math.floor(date.getTime() / (dataRefreshPeriod * 60 * 1000));
}

(async () => {
    await client.connect();
    console.log("DB connection established.");
    let db = client.db("mainDB");
    let melonChartCollection = db.collection("melonCharts");
    let genieChartCollection = db.collection("genieCharts");
    let youtubeSearchResultCollection = db.collection("youtubeSearchResults");
    let youtubeCommentCollection = db.collection("youtubeComments");
    let date = startOfDataRefresh(new Date());
    let melonChartResponse = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    let melonChart = formatMelonChart(date, melonChartResponse);
    await melonChartCollection.findOneAndUpdate({
        date: melonChart.date
    }, {
        $set: melonChart
    }, {
        upsert: true
    });
    console.log(`Updated Melon chart at ${formatDate(melonChart.date)} to collection melonCharts.`);
    let genieChartResponse = await getJSON("https://app.genie.co.kr/chart/j_RealTimeRankSongList.json");
    let genieChart = formatGenieChart(date, genieChartResponse);
    await genieChartCollection.findOneAndUpdate({
        date: genieChart.date
    }, {
        $set: genieChart
    }, {
        upsert: true
    });
    console.log(`Updated Genie chart at ${formatDate(genieChart.date)} to collection genieCharts.`);
    let chartItems = [];
    for (let chartItem of [...melonChart.items, ...genieChart.items]) {
        if (!chartItems.some(item => item.name == chartItem.name)) {
            chartItems.push(chartItem);
        }
    }

    let bulk = youtubeCommentCollection.initializeUnorderedBulkOp();
    let youtubeVideos = [];
    await Promise.all(chartItems.map(async song => {
        console.log(`Downloading song statistics for song ${song.name}.`);
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

        let youtubeSearchResult = {
            date,
            query,
            items: youtubeVideosResponse.data.items.map(formatYoutubeVideo)
        };
        await youtubeSearchResultCollection.findOneAndUpdate({
            date,
            query
        }, {
            $set: youtubeSearchResult
        }, {
            upsert: true
        });
        console.log(`Inserted song youtube search results for song ${song.name}.`);

        for (let i=0; i<5; ++i) {
            if (!youtubeVideos.find(video => video.id == youtubeSearchResult.items[i].id)) {
                youtubeVideos.push(youtubeSearchResult.items[i]);
            }
        }
    }));

    await Promise.all(youtubeVideos.map(async youtubeVideo => {
        let videoId = youtubeVideo.id;
        console.log(`Downloading YouTube comments for video ${videoId}.`);
        let oldestUntrackedDate = new Date(date.getTime() - videoAnalysisDuration(date, youtubeVideo));
        let currentDate = oldestUntrackedDate;
        for (let currentDate = oldestUntrackedDate; currentDate.getTime() <= date.getTime(); currentDate = new Date(currentDate.getTime() + dataRefreshPeriod * 60 * 1000)) {
            let doesCommentForCurrentDateExist = await youtubeCommentCollection.find({
                date: startOfDataRefresh(currentDate),
                videoId
            }).limit(1).count() == 1;
            if (!doesCommentForCurrentDateExist) { break; }
        }

        let pageToken;
        let comments = [];
        let lastDate = date;
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
        let slicedComments = {};
        for (let currentBlockIndex = blockIndex(date) - 1; currentBlockIndex >= blockIndex(oldestUntrackedDate); --currentBlockIndex) {
            while (currentCommentIndex < comments.length
                   && blockIndex(new Date(comments[currentCommentIndex].date)) == currentBlockIndex) { ++currentCommentIndex; }
            slicedComments[currentBlockIndex] = comments.slice(currentBlockStartIndex, currentCommentIndex);
            currentBlockStartIndex = currentCommentIndex + 1;
            currentCommentIndex = currentBlockStartIndex;
        }
        
        for (let [currentBlockIndex, items] of Object.entries(slicedComments)) {
            bulk.find({
                date: new Date(currentBlockIndex * dataRefreshPeriod * 60 * 1000),
                videoId
            }).upsert().updateOne({
                $set: {
                    items
                }
            });
        };
    }));

    console.log(`Starting bulk DB insert operation at ${formatDate(new Date())}.`);
    await bulk.execute();
    console.log(`Finished bulk DB insert operation at ${formatDate(new Date())}.`);
    await client.close();
})();
