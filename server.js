require('dotenv').config();
const got = require('got');
const CronJob = require('cron').CronJob;

const { WebClient } = require('@slack/client');
const web = new WebClient(process.env.SLACK_TOKEN);

// Inspired by https://github.com/samverschueren/tz-format
// date object, timezone offset from UTC in hours
function tzDate(d, offset) {
  offset = offset && offset * 60;
  d.setMinutes(d.getMinutes() + d.getTimezoneOffset() + offset);
  return d;
};

var cycleIndex = 0;
var cycle = function(list){
  if (cycleIndex < list.length) cycleIndex++;
  else cycleIndex = 1
  return list[cycleIndex -1];
};
var webuildColors = ['#c11a18', '#e06149', '#228dB7', '#f1e9b4'];

const nowDate = tzDate(new Date(), 8);
const postEvents = async () => {
  const newEventsResponse = await got('http://api-webuild.7e14.starter-us-west-2.openshiftapps.com/events', {
    json: true,
  });
  const oldEventsResponse = await got('https://webuild.sg/api/v1/events', {
    json: true,
  });
  const events = [
    ...newEventsResponse.body.events,
    ...oldEventsResponse.body.events
  ].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .filter(ev => {
      const eventDate = tzDate(new Date(ev.start_time), 8);
      return nowDate.toDateString() == eventDate.toDateString();
    })
    .slice(0, 15);

  const attachments = events.map((event) => {
    const [date, day, time] = event.formatted_time.split(',');
    const groupName = event.group_name.trim().replace(/\*/g, '٭­');
    const formattedDate = date.trim().replace(/-/g, ' ').replace(/\s+\d{4}/, '');
    const formattedTime = time.trim().replace(/^0/, '').toLowerCase();
    const location = event.location.trim().replace(/\*/g, '٭');
    return {
      title: event.name,
      title_link: event.url,
      color: cycle(webuildColors),
      text: `by *${groupName}* on *${formattedDate}*, ${formattedTime}\n${location}`
    };
  });

  const msg = events.length ? {
    text: `📢 ${events.length} event${events.length == 1 ? '' : 's'} today from We Build SG https://webuild.sg/`,
    attachments,
  } : {
    text: '😭 No events today from We Build SG https://webuild.sg/',
  };

  web.chat.postMessage({
    channel: process.env.SLACK_CHANNEL,
    ...msg,
  })
    .then((res) => {
      console.log('Message sent: ', res.ok, res.ts);
    })
    .catch(console.error);
};

// postEvents();

new CronJob('0 0 11 * * 1-6', postEvents, null, true, 'Asia/Singapore');

const http = require('http');
http.createServer((req, res) => {
  res.setHeader('content-type', 'text/plain');
  res.statusCode = 200;
  res.end('https://github.com/cheeaun/slakoth');
}).listen(process.env.PORT || 1337);