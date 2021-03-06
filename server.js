require('dotenv').config();
const fs = require('fs');
const got = require('got');
const HttpAgent = require('agentkeepalive');
const { HttpsAgent } = HttpAgent;
const spacetime = require('spacetime');
const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.SLACK_TOKEN);

const isDev = process.env.NOW_REGION === 'dev1';
const TIMEZONE = 'Asia/Singapore';

var cycleIndex = 0;
var cycle = function (list) {
  if (cycleIndex < list.length) cycleIndex++;
  else cycleIndex = 1;
  return list[cycleIndex - 1];
};
var webuildColors = ['#c11a18', '#e06149', '#228dB7', '#f1e9b4'];

const blocklistRegex = /(business|marketing|superbowl|blockchain|Kakis SG|chainlink|meetnewpeopleSG)/i;
const generateMessage = async () => {
  const nowDate = spacetime.now(TIMEZONE);
  const newEventsResponse = await got('https://engineers.sg/api/events', {
    responseType: 'json',
    agent: {
      http: new HttpAgent(),
      https: new HttpsAgent(),
    },
  });

  const eventNames = new Set();
  const events = [...newEventsResponse.body.events]
    .sort((a, b) => {
      const dateDiff = new Date(a.start_time) - new Date(b.start_time);
      if (dateDiff !== 0) return dateDiff;
      const rsvpDiff = b.rsvp_count - a.rsvp_count;
      if (rsvpDiff !== 0) return rsvpDiff;
      const locationDiff = b.location.length - a.location.length;
      if (locationDiff !== 0) return locationDiff;
      const descDiff = b.description.length - a.description.length;
      return descDiff;
    })
    .filter((ev, i) => {
      const eventDate = spacetime(ev.start_time).goto(TIMEZONE);
      const isSame = eventDate.isSame(nowDate, 'date');
      const isAfter = eventDate.isAfter(nowDate);
      if (i == 0) {
        console.log(`${eventDate.format('iso-short')}: ${isSame} - ${isAfter}`);
      }
      const sameDay = isSame && isAfter;

      const evName = ev.name.trim();
      const blacklisted =
        blocklistRegex.test(ev.location) ||
        blocklistRegex.test(ev.group_name) ||
        blocklistRegex.test(ev.group_url) ||
        blocklistRegex.test(evName);

      const significantRSVPCount = ev.rsvp_count > 2;

      const legit = sameDay && !blacklisted && significantRSVPCount;

      if (eventNames.has(evName)) return false;
      if (legit) eventNames.add(evName);

      return legit;
    })
    .slice(0, 15);

  if (isDev) console.log(events);

  // Filter out the non-200 meetups
  const aliveEvents = (
    await Promise.all(
      events.map((ev) =>
        got(ev.url, {
          timeout: 5000,
          retry: 0,
          followRedirect: false,
          agent: {
            http: new HttpAgent(),
            https: new HttpsAgent(),
          },
        })
          .then((r) => {
            if (r.statusCode !== 200) return;
            const canceled = /eventTimeDisplay\-canceled/i.test(r.body);
            if (canceled) return;
            return ev;
          })
          .catch(() => {
            return null;
          }),
      ),
    )
  ).filter((ev) => ev);

  const attachments = aliveEvents.map((event) => {
    const dt = spacetime(event.start_time).goto(TIMEZONE);
    const time = dt.format('time');
    const groupName = event.group_name.trim().replace(/\*/g, '٭­');
    const location = event.location.trim().replace(/\*/g, '٭');
    const shortLocation = location.split(',', 1)[0].trim();
    let contextText = `*${time}*`;
    if (location && !/^online/i.test(shortLocation))
      contextText += ` - <https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        location,
      )}|${shortLocation}>`;
    contextText += ` - ${groupName}`;
    const eventName = event.name.trim().replace(/[^ -~]+/g, '');
    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${event.url}|${eventName}>*`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: contextText,
            },
          ],
        },
      ],
      color: cycle(webuildColors),
    };
  });

  const eventsCount = aliveEvents.length;

  const msg = eventsCount
    ? {
        text: `📢 *${eventsCount}* tech event${
          eventsCount == 1 ? '' : 's'
        } today!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📢 *${eventsCount}* tech event${
                eventsCount == 1 ? '' : 's'
              } <https://engineers.sg/events/|today>!`,
            },
          },
        ],
        attachments,
      }
    : {
        text: '😭 No tech events today',
      };

  return msg;
};

const postEvents = async (channel) => {
  const msg = await generateMessage();
  const res = await web.chat.postMessage({
    channel: channel || process.env.SLACK_CHANNEL,
    ...msg,
  });
  console.log('Message sent: ', res.ok, res.ts);
};

const handler = async (req, res) => {
  const ip =
    req.headers['x-forwarded-for'] ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    (req.connection.socket ? req.connection.socket.remoteAddress : null);
  console.log(
    `${req.method} ${req.url} - ${ip} - ${req.headers['user-agent']}`,
  );
  const url = require('url').parse(req.url, true);
  if (url.pathname == '/') {
    res.setHeader('content-type', 'text/html');
    res.statusCode = 200;
    res.end(fs.readFileSync('index.html'));
  } else if (url.pathname == '/events') {
    const msg = await generateMessage();
    res.setHeader('content-type', 'application/json');
    res.statusCode = 200;
    res.end(JSON.stringify(msg, null, ' '));
  } else if (url.pathname == '/post') {
    const { channel } = url.query;
    res.setHeader('content-type', 'text/plain');
    res.statusCode = 200;
    try {
      await postEvents(channel);
      res.end('Posted message to channel' + (channel ? ` (${channel})` : ''));
    } catch (e) {
      console.log(e);
      res.end('Error: ' + e.message ? e.message : String(e));
    }
  } else {
    res.setHeader('content-type', 'text/plain');
    res.statusCode = 404;
    res.end('404');
  }
};

exports.default = handler;

const [_, __, args] = process.argv;
if (args === '--post') {
  postEvents();
  console.log('Posting message to channel');
  return;
}

if (isDev) {
  const PORT = process.env.PORT || 1337;
  const listen = () => console.log(`Listening on ${PORT}...`);
  require('http').createServer(handler).listen(PORT, listen);
}
