let fs = require("fs").promises;
let { youtubeCommentThreadCacheDataPath } = require("./path.js");

async function getKoreanCommentRate(videoId) {
    let commentCount = 0, koreanCommentCount = 0;
    let date = new Date();
    let prevDate = new Date(date.getTime() - 2 * 1000 * 3600 * 24);
    
    while (date.getTime() >= prevDate.getTime()) {
        let index = 0;
        while (true) {
            let path = youtubeCommentThreadCacheDataPath(date, videoId, index);
            try {
                let data = await fs.readFile(path);
                data = JSON.parse(data);
                if (data.hasOwnProperty(videoId)) {
                    commentCount += data[videoId]["total"];
                    koreanCommentCount += data[videoId]["korean"];
                }
            } catch (error) {
                if (error.code == "ENOENT") { break; }
                else { throw error; }
            }
            if (++index > 100) { throw new Error("Too much Comments... Is it okay?"); }
        }
        date = new Date(date.getTime() - 1000 * 60 * 15);
    }

    return koreanComments / comments;
}
