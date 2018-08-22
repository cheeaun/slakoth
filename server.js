require('dotenv').config();
const got = require('got');
const spacetime = require('spacetime')
const CronJob = require('cron').CronJob;
const { WebClient } = require('@slack/client');
const web = new WebClient(process.env.SLACK_TOKEN);

var cycleIndex = 0;
var cycle = function(list){
  if (cycleIndex < list.length) cycleIndex++;
  else cycleIndex = 1
  return list[cycleIndex -1];
};
var webuildColors = ['#c11a18', '#e06149', '#228dB7', '#f1e9b4'];

const generateMessage = async () => {
  const nowDate = spacetime.now('Asia/Singapore');
  const newEventsResponse = await got('https://engineers.sg/api/events', {
    json: true,
  });
  // const oldEventsResponse = await got('https://webuild.sg/api/v1/events', {
  //   json: true,
  // });
  const events = [
    ...newEventsResponse.body.events,
    // ...oldEventsResponse.body.events
  ].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .filter((ev, i) => {
      const eventDate = spacetime(ev.start_time);
      eventDate.goto('Asia/Singapore');
      if (i == 0) console.log(nowDate.format('iso-short'), '↔️ ', eventDate.format('iso-short'));
      return nowDate.format('iso-short') == eventDate.format('iso-short');
    })
    .slice(0, 15);

  const attachments = events.map((event) => {
    const dt = spacetime(event.start_time);
    dt.goto('Asia/Singapore');
    const datetime = dt.format('nice-day');
    const groupName = event.group_name.trim().replace(/\*/g, '٭­');
    const location = event.location.trim().replace(/\*/g, '٭');
    return {
      title: event.name,
      title_link: event.url,
      color: cycle(webuildColors),
      text: `by *${groupName}* on *${datetime}*\n${location}`
    };
  });

  const msg = events.length ? {
    text: `📢 *${events.length}* tech event${events.length == 1 ? '' : 's'} today`,
    attachments,
  } : {
    text: '😭 No tech events today',
  };

  return msg;
}

const postEvents = async () => {
  const msg = await generateMessage();
  web.chat.postMessage({
    channel: process.env.SLACK_CHANNEL,
    ...msg,
  })
    .then((res) => {
      console.log('Message sent: ', res.ok, res.ts);
    })
    .catch(console.error);
};

new CronJob('0 0 11 * * 1-6', postEvents, null, true, 'Asia/Singapore');

const http = require('http');
http.createServer(async (req, res) => {
  if (req.url == '/'){
    const msg = await generateMessage();
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(msg, null, '\t'));
  } else if (req.url == '/post'){
    await postEvents();
    res.setHeader('content-type', 'text/plain');
    res.statusCode = 200;
    res.end('Posted message to channel');
  } else {
    res.setHeader('content-type', 'text/plain');
    res.statusCode = 404;
    res.end('404');
  }
}).listen(process.env.PORT || 1337);