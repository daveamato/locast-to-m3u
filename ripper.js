const fs = require('fs')

const lat = process.env.LAT || 40.768437
const lon = process.env.LON || -73.0107316
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
  NYLIFE: { zapId: "I22.11744.zap2it.com", channelNumber: 25 }
}


function request(result) {
  let headers = ['user-agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.94 Safari/537.36']
  if (result && result.cookie) {
    headers = [...headers, `cookie: ${result.cookie}; _member_location=${lat}%2C${lon}`]
  }
  return new (require('curl-request'))().setHeaders(headers)
}
async function fetchLocastAuthCookie (result) {
  try {
    let { statusCode, body, headers } = await request(result).setBody(
      {
        username,
        password,
        action: "member_login"
      }
    ).post(adminUrl)
    return { cookie: `_member_token=${body.token}; _member_role=1; _member_username=${username}`}
    } catch  {
      console.log("Couldn't fetch token");  
    }
}
function fetchChannelData(result) {
  return async function (targetChannel){
    
    const channelInfoUrl = `${adminUrl}?action=get_station&station_id=${targetChannel.id}&lat=${lat}&lon=${lon}`
    let { statusCode, body, headers } = await request(result).get(channelInfoUrl)
    let m3uSrc = await request(result).get(body.streamUrl)
    m3uSrc = m3uSrc.body.split("\n")
    hdSrc = m3uSrc[m3uSrc.length - 2]
    return { ...targetChannel, streamUrl: body.streamUrl, m3uSrc: hdSrc}
  }
}
function buildM3U(channelList) {
  return `#EXTM3U
   ${channelList.filter((chan)=>channelConfig[chan.callSign]).map((chan)=>
      `
#EXTINF:-1 channel-id="${channelConfig[chan.callSign].channelNumber}" channel-name="${chan.callSign}" tvg-name="${chan.callSign}" tvg-id="${channelConfig[chan.callSign].id}" tvg-logo="${chan.logoUrl}"
${chan.m3uSrc}`).join('\n')}
   `
}
async function getDMA(result) {
  let { statusCode, body, headers } = await request(result).get(`${adminUrl}?action=get_dma&lat=${lat}&lon=${lon}`)
  return {...result, dma: body.DMA}
}
async function getChannelList(result) {
  try {
    const channelListUrl = `${adminUrl}?action=get_epgs&dma=${result.dma}&start_time=2018-08-24T00%3A00%3A00.562-07%3A00`
    let { statusCode, body, headers } = await request(result).get(channelListUrl)
    const channelList = await Promise.all(body.map(fetchChannelData(result)))
    return { ...result, channelList, m3u: buildM3U(channelList) }
  } catch (e) {
    console.log(e, "Couldn't fetch channelList");
  }
}
async function updateOTAFile () {
  let result = await fetchLocastAuthCookie()
  result = await getDMA(result)
  result = await getChannelList(result)
  return result
}
function updateM3UFile () {
  updateOTAFile().then((result)=>fs.writeFileSync(targetPath, result.m3u))
}

module.exports.generate = updateM3UFile
