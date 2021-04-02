let bent = require("bent");
let getJSON = bent("json");

let knex = require("knex")({
    client: "sqlite3",
    connection: {
        filename: "charts.db"
    },
    useNullAsDefault: true
});

let { zonedTimeToUtc } = require("date-fns-tz");

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
            table.integer("song_id");
            table.foreign("song_id").references("song.id");
            table.integer("song_rank");
            table.unique(["chart_id", "song_id"]);
        });
    }

    let melonChartResponse = await getJSON("https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0");
    let melonChart = formatMelonChart(melonChartResponse);
    await knex("song").insert(melonChart.items).onConflict(["id"]).ignore();
    let [chartId] = await knex("chart").insert({
        datetime: melonChart.date.toISOString(),
        type: 0
    }).onConflict(["datetime", "type"]).ignore();
    if (chartId != 0) { // TODO: Check whether the chart has been created or not
        await knex("song_chart").insert(melonChart.items.map(({ id: songId }) => ({
            song_id: songId,
            chart_id: chartId
        }))).onConflict(["chart_id", "song_id"]).ignore();
    }
    await knex.destroy();
})();
