require("dotenv").config();

let fs = require("fs-extra");

async function readJSONFile(path) {
    let data = await fs.readFile(path);
    let json = JSON.parse(data);
    return json;
}

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

let dataRefreshPeriod = (process.env.DATA_REFRESH_PERIOD || 30);

module.exports = {
    readJSONFile,
    hasKoreanLetter,
    dataRefreshPeriod
};
