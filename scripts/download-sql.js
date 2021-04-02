let bent = require("bent");
let getJSON = bent("json");
let { google } = require("googleapis");
let youtube = google.youtube("v3");

let knex = require("knex")({
    client: "sqlite3",
    connection: {
        filename: "charts.db"
    },
    useNullAsDefault: true
});

let { zonedTimeToUtc } = require("date-fns-tz");

let { formatDate } = require("../src/path.js");
let { videoAnalysisDuration } = require("../src/video.js");
let { dataRefreshPeriod } = require("../src/helpers.js");

function formatMelonChart(melonChartResponse) {
    let [year, month, day] = melonChartResponse.response.RANKDAY.split(".").map(s => Number.parseInt(s));
    month--;
    let [hour, minute] = melonChartResponse.response.RANKHOUR.split(":").map(s => Number.parseInt(s));
    let date = zonedTimeToUtc(new Date(year, month, day, hour, minute), "Asia/Seoul");
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
        let publishedAt = commentSnippet.publishedAt;
        let likeCount = commentSnippet.likeCount;
        let authorId = commentSnippet.authorChannelId && commentSnippet.authorChannelId.value;
        return {
            id, text, publishedAt, likeCount, authorId
        };
    } catch (e) {
        throw e;
    }
}

function blockIndex(date) {
    return Math.floor(date.getTime() / (dataRefreshPeriod * 60 * 1000));
}

(async () => {
    if (!await knex.schema.hasTable("song")) {
        await knex.schema.createTable("song", table => {
            table.string("id").unique();
            table.string("name");
            table.string("artistnames");
            table.string("albumimgurl");
        });
    }
    if (!await knex.schema.hasTable("chart")) {
        await knex.schema.createTable("chart", table => {
            table.increments("id");
            table.string("datetime");
            table.integer("type");
            table.unique(["datetime", "type"]);
        });
    }
    if (!await knex.schema.hasTable("song_chart")) {
        await knex.schema.createTable("song_chart", table => {
            table.integer("chart_id");
            table.foreign("chart_id").references("chart.id");
            table.string("song_id");
            table.foreign("song_id").references("song.id");
            table.integer("song_rank");
            table.unique(["chart_id", "song_id"]);
        });
    }

    if (!await knex.schema.hasTable("video")) {
        await knex.schema.createTable("video", table => {
            table.string("id").unique();
            table.string("published_at");
        });
    }
    if (!await knex.schema.hasTable("videostatistics")) {
        await knex.schema.createTable("videostatistics", table => {
            table.string("video_id");
            table.foreign("video_id").references("video.id");
            table.string("datetime");
            table.integer("view_count");
            table.integer("like_count");
            table.integer("dislike_count");
            table.integer("favorite_count");
            table.integer("comment_count");
            table.unique(["video_id", "datetime"]);
        });
    }

    if (!await knex.schema.hasTable("song_video")) {
        await knex.schema.createTable("song_video", table => {
            table.string("song_id");
            table.foreign("song_id").references("song.id");
            table.string("video_id");
            table.foreign("video_id").references("video.id");
            table.string("datetime");
            table.unique(["song_id", "video_id", "datetime"]);
        });
    }

    if (!await knex.schema.hasTable("comment")) {
        await knex.schema.createTable("comment", table => {
            table.string("id").unique();
            table.string("text");
            table.string("video_id");
            table.foreign("video_id").references("video.id");
            table.string("published_at");
            table.integer("like_count");
            table.string("author_id");
        });
    }

    let date = new Date();
    date.setMinutes(Math.floor(date.getMinutes() / dataRefreshPeriod) * dataRefreshPeriod);
    date.setSeconds(0);
    date.setMilliseconds(0);

    console.log("Downloading Melon chart.");
    let melonChartResponse = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    let melonChart = formatMelonChart(melonChartResponse);
    await knex("song").insert(melonChart.items).onConflict(["id"]).merge();
    let [chartId] = await knex("chart").insert({
        datetime: melonChart.date.toISOString(),
        type: 0
    }).onConflict(["datetime", "type"]).merge();
    if (chartId != 0) { // TODO: Check whether the chart has been created or not
        await knex("song_chart").insert(melonChart.items.map(({ id: songId }, songRank) => ({
            song_id: songId,
            chart_id: chartId,
            song_rank: songRank
        }))).onConflict(["chart_id", "song_id"]).merge();
    }

    await Promise.all(melonChart.items.map(async song => {
        console.log(`Downloading song statistics for song ${song.name}.`);
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
        let youtubeVideos = youtubeVideosResponse.data.items.map(formatYoutubeVideo);
        await knex("video").insert(youtubeVideos.map(video => ({
            id: video.id,
            published_at: video.publishedAt
        }))).onConflict("id").merge();
        await knex("videostatistics").insert(youtubeVideos.map(video => ({
            video_id: video.id,
            datetime: date.toISOString(),
            view_count: video.viewCount,
            like_count: video.likeCount,
            dislike_count: video.dislikeCount,
            favorite_count: video.favoriteCount,
            comment_count: video.commentCount
        }))).onConflict(["video_id", "datetime"]).merge();
        await knex("song_video").insert(youtubeVideos.map(video => ({
            song_id: song.id,
            video_id: video.id,
            datetime: date.toISOString()
        }))).onConflict(["song_id", "video_id", "datetime"]).merge();
        await Promise.all(youtubeVideos.slice(0, 5).map(async video => {
            let videoId = video.id;
            console.log(`Downloading YouTube comments for video ${videoId}.`);
            let currentDate = new Date(date.getTime() - videoAnalysisDuration(date, video));
            while (currentDate.getTime() <= date.getTime()) {
                let nextDate = new Date(currentDate.getTime() + dataRefreshPeriod * 60 * 1000);
                let comments = await knex("comment").select("id")
                    .whereRaw("published_at >= ?", currentDate.toISOString())
                    .andWhereRaw("published_at < ?", nextDate.toISOString())
                    .andWhere("video_id", videoId);
                if (comments.length == 0) { break; }
                currentDate = nextDate;
            }
            let oldestUntrackedDate = currentDate;
            console.log(`Oldest undtracked date for video ${videoId} is ${formatDate(oldestUntrackedDate)}.`);

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
                        comments.push(comment);
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
            } while (pageToken && lastDate.getTime() >= oldestUntrackedDate.getTime())
            if (comments.length > 0) {
                for (let i = 0; i < Math.ceil(comments.length / 100); i++) {
                    await knex("comment").insert(comments.slice(100 * i, Math.min(100 * (i + 1), comments.length)).map(comment => ({
                        id: comment.id,
                        video_id: videoId,
                        text: comment.text,
                        published_at: comment.publishedAt,
                        like_count: comment.likeCount,
                        author_id: comment.authorId
                    }))).onConflict("id").merge();
                }
            }
        }));
    }));

    await knex.destroy();
})();
