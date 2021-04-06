require("dotenv").config();

let fs = require("fs-extra");
let { twitterSearchResultPath } = require("../src/path.js");
let { dataRefreshPeriod } = require("../src/helpers.js");
let twitter = require('twitter-v2');

function getManipulatedQuery(query) {
    query = query.replaceAll("$", "");
    query = query.replaceAll("#", "");
    query = query.replaceAll("@", "");
    query = query.replaceAll(":", "");
    query = query.replaceAll("*", "");
    query = query.replaceAll("&", "");
    query = query.replaceAll(",", "");
    query = query.replaceAll("is", "");
    query = query.replaceAll("has", "");
    query = query.replaceAll("from", "");
    query = query.replaceAll("to", "");
    query = query.replaceAll("url", "");
    query = query.replaceAll("place", "");
    return query;
}

// naming: download or get(duplicated)?
async function getTwitterSearchResult(date, query) {
    let client = new twitter({
        bearer_token: process.env.TWITTER_BEARER_TOKEN
    });

    date.setMinutes(Math.floor(date.getMinutes() / dataRefreshPeriod) * dataRefreshPeriod);
    let pastDate = new Date(date.getTime() - dataRefreshPeriod * 60 * 1000);
    let nextToken;
    let tweets = [];

    console.log(`Downloading Twitter search results for query ${query}.`);
    do {
        let manipulatedQuery = getManipulatedQuery(query);
        try {
            let { data: twitterSearchResult, meta, errors } = await client.get('tweets/search/recent', {
                query: manipulatedQuery,
                max_results: 100,
                start_time: pastDate.toISOString(),
                end_time: date.toISOString(),
                ...(nextToken == undefined ? {} : { next_token: nextToken }),
                tweet: {
                    fields: ['created_at', 'public_metrics', 'lang'],
                }
            });
            if (errors) {
                console.log(errors);
                return;
            }

            if (twitterSearchResult == undefined) {
                console.log("query: ", query);
                break;
            }
            for (let tweet of twitterSearchResult) {
                tweets.push(tweet);
            }
            nextToken = meta.next_token;
            console.log("nextToken: ", nextToken);
        } catch (error) {
            console.log("Invalid query: ", query);
            throw error;
        }
    } while (nextToken);

    console.log("Saving Twitter search results.");
    await fs.outputJSON(twitterSearchResultPath(date, query), { items: tweets });
}

module.exports = { getTwitterSearchResult };
