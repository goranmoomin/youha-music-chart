#!/usr/bin/env bash

set -Eeuo pipefail
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" &>/dev/null && pwd -P)

msg() {
  echo >&2 -e "${1-}"
}

die() {
    local msg=$1
    local code=${2-1} # default exit status 1
    msg "$msg"
    exit "$code"
}

# export environment variables
dotenv_file="$script_dir/../.env"
if [[ -f $dotenv_file ]]; then export $(xargs < "$dotenv_file"); fi

# download melon chart
chart_dir="$script_dir/../charts"
mkdir -p "$chart_dir"
json_chart="$(curl -sS 'https://m2.melon.com/m5/chart/hits/songChartList.json?v=5.0')"
chart_name="$(echo "$json_chart" | jq -r '.response | "chart-" + .RANKDAY + "." + .RANKHOUR')"
echo "$json_chart" > "$chart_dir/$chart_name.json"

msg "Downloaded Melon chart to $chart_name.json."

# download youtube data
urlencode() {
    local string=$1
    python -c 'import urllib; print urllib.quote(raw_input())' <<< "$string"
}

if [[ ! -v YOUTUBE_API_KEY ]]; then die 'Youtube API key not set.'; fi
timestamp="$(date +'%Y-%m-%dT%H:%M:%S%z')"
youtube_dir="$chart_dir/youtube-data-$timestamp"
mkdir -p "$youtube_dir"
jq -r '.response.HITSSONGLIST[:3][] | .SONGNAME + " " + (.ARTISTLIST | map(.ARTISTNAME) | join(" "))' "$chart_dir/$chart_name.json" | while IFS= read -r query; do
    encoded_query="$(urlencode "$query")"
    search_list_file="$youtube_dir/search-list-response-$encoded_query.json"
    curl -sS "https://www.googleapis.com/youtube/v3/search?key=$YOUTUBE_API_KEY&part=id&q=$encoded_query&maxResults=10" -o "$search_list_file"
    ids="$(jq -r '[.items[].id.videoId] | join(",")' "$search_list_file")"
    curl -sS "https://www.googleapis.com/youtube/v3/videos?key=$YOUTUBE_API_KEY&part=statistics&id=$ids" > "$youtube_dir/video-list-response-$encoded_query.json"
done
