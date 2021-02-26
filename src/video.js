function videoAnalysisDuration(date, video) {
    let properDuration;
    
    let uploadedDate = new Date(video.publishedAt);
    let uploadedDuration = date.getTime() - uploadedDate.getTime();
    let fourDaysDuration = 4 * 24 * 60 * 60 * 1000;
    properDuration = Math.min(uploadedDuration, fourDaysDuration);

    let targetCommentCount = 10000;
    let commentCount = video.commentCount;
    if (commentCount == undefined || commentCount == 0) {
        return properDuration;
    }

    let targetCommentDuration = uploadedDuration * (targetCommentCount / commentCount);
    properDuration = Math.min(properDuration, targetCommentDuration);
    return Math.floor(properDuration);
}

module.exports = { videoAnalysisDuration };
