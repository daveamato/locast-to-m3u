const fs = require('fs')
const fetch = require('node-fetch')
const FormData = require('form-data')
const { URLSearchParams } = require('url')


const lat = process.env.LAT || "40.768437"
const lon = process.env.LON || "-73.0107316"
const username = process.env.USERNAME
const password = process.env.PASSWORD
const targetPath = process.env.TARGET_PATH ||"./tv-source.m3u"
const updateFreq = process.env.UPDATE_FREQ || 86400 // 24 hrs
const adminUrl = "https://www.locast.org/wp/wp-admin/admin-ajax.php"
const channelConfig = {
  WCBS: { zapId: "I2.11331.zap2it.com", channelNumber: 2 },
  WNBC: { zapId: "I4.11705.zap2it.com", channelNumber: 4 },
  WNYW: { zapId: "I5.11746.zap2it.com", channelNumber: 5 },
  WABC: { zapId: "I7.11259.zap2it.com", channelNumber: 7 },
  WWOR: { zapId: "I9.11760.zap2it.com", channelNumber: 9 },
  WPIX: { zapId: "I11.11779.zap2it.com", channelNumber: 11 },
  WNET: { zapId: "I13.11715.zap2it.com", channelNumber: 13 },
  WLIW: { zapId: "I21.11643.zap2it.com", channelNumber: 21 },
  WPXN: { zapId: "I3.11743.zap2it.com", channelNumber: 21 },
  WNJU: { zapId: "I16.11726.zap2it.com", channelNumber: 31 },
  WLNY: { zapId: "I710.31225.zap2it.com", channelNumber: 55 },
  WFUT: { zapId: "I1005.35364.zap2it.com", channelNumber: 68 },
  NYLIFE: { zapId: "I22.11744.zap2it.com", channelNumber: 27 }
}

function mapObj(obj, func){
  return Object.keys(obj).map((key) => func([key, obj[key]]))
}
function getHeaders(result) {
  let headers = {'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36'}
  if (result && result.cookie) {
    headers = {...headers, cookie: `${result.cookie}; _member_location=${lat}%2C${lon}`}
  }
  return headers
}

async function fetchLocastAuthCookie (result) {
  const form = new FormData();
  form.append('username', username);
  form.append('password', password);
  form.append('action', "member_login");

  const res = await fetch(adminUrl, {
    method: "POST", 
    headers: {... getHeaders(result), ...form.getHeaders()},
    body: form
  })
  const body = await res.json()
  return { cookie: `_member_token=${body.token}; _member_role=1; _member_username=${username}`}
}

function fetchChannelData(result) {
  return async function (targetChannel){
    const params = new URLSearchParams({
      action: "get_station",
      station_id: targetChannel.id,
      lon,
      lat
    });
    const res = await fetch(`${adminUrl}?${params}`, {headers: getHeaders(result)})
    const body = await res.json()
    const streamReq = await fetch(body.streamUrl, {headers: getHeaders(result)})
    const targetSourcesText = await streamReq.text()
    const targetSources = targetSourcesText.split("\n")
    
    const targetSource = targetSources[targetSources.length - 2]
    return { ...targetChannel, streamUrl: body.streamUrl, targetSource }
  }
}

function m3u_channelLine (chan) {
  console.log(chan)
  const props = mapObj({
    "channel-id": channelConfig[chan.callSign].channelNumber,
    "channel-name": chan.callSign,
    "tvg-name": chan.callSign,
    "tvg-id": channelConfig[chan.callSign].zapId,
    "tvg-logo": chan.logoUrl
  }, ([prop, value])=> `${prop}="${value}"`).join(' ')
  return [`#EXTINF:-1 ${props}`, chan.targetSource].join('\n')
}
function buildM3U(channelList) {
  const channelLineup = channelList
                        .filter((chan) => channelConfig[chan.callSign])
                        .map(m3u_channelLine)
  return ['#EXTM3U',...channelLineup].join('\n')
}
async function getDMA(result) {
  const params = new URLSearchParams({
    action: "get_dma",
    lon,
    lat
  });
  const res = await fetch(`${adminUrl}?${params}`, {
    headers: getHeaders(result)})
  const body = await res.json()
  return {...result, dma: body.DMA}
}
async function getChannelList(result) {
  const params = new URLSearchParams({
    action: "get_epgs",
    dma: result.dma,
    start: Date(),
    lon,
    lat
  });
  const res = await fetch(`${adminUrl}?${params}`, {headers: getHeaders(result)})
  const body = await res.json()
  const channelList = await Promise.all(body.map(fetchChannelData(result)))
  return { ...result, channelList, m3u: buildM3U(channelList) }
}
async function updateOTAFile () {
  try {
    let result = await fetchLocastAuthCookie()
    result = await getDMA(result)
    result = await getChannelList(result)
    fs.writeFileSync(targetPath, result.m3u)
    return result
  } catch (e) {
    console.error(e, "Failure to update OTA File")
  }
}

module.exports.init = () => { updateOTAFile(); setInterval(updateOTAFile, updateFreq) }