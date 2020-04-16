require('dotenv').config();
const fs = require('fs');
const got = require('got');
const spacetime = require('spacetime');
const { WebClient } = require('@slack/web-api');
const web = new WebClient(process.env.SLACK_TOKEN);

const isDev = !process.env.NOW_REGION;
const TIMEZONE = 'Asia/Singapore';

var cycleIndex = 0;
var cycle = function(list) {
  if (cycleIndex < list.length) cycleIndex++;
  else cycleIndex = 1;
  return list[cycleIndex - 1];
};
var webuildColors = ['#c11a18', '#e06149', '#228dB7', '#f1e9b4'];

const blacklistRegex = /(business|marketing|superbowl)/i;
const generateMessage = async () => {
  const nowDate = spacetime.now(TIMEZONE);
  const newEventsResponse = await got('https://engineers.sg/api/events', {
    json: true,
  });
  const eventNames = [];
  const events = [...newEventsResponse.body.events]
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .filter((ev, i) => {
      const eventDate = spacetime(ev.start_time).goto(TIMEZONE);
      if (i == 0) {
        console.log(
          `${nowDate.format('iso-short')} ↔️ ${eventDate.format('iso-short')}`,
        );
      }
      const sameDay =
        nowDate.format('iso-short') == eventDate.format('iso-short');

      const eventName = ev.name.trim();

      const blacklisted =
        blacklistRegex.test(ev.location) ||
        blacklistRegex.test(ev.group_name) ||
        blacklistRegex.test(eventName);

      const eventNameDuplicated =
        eventName.length > 5 && eventNames.includes(eventName);
      eventNames.push(eventName);

      return sameDay && !blacklisted && !eventNameDuplicated;
    })
    .slice(0, 15);

  // Filter out the non-200 meetups
  const aliveEvents = (
    await Promise.all(
      events.map(ev =>
        got(ev.url, {
          method: 'HEAD',
          timeout: 1000,
          retry: 1,
        }).then(r => (r.statusCode === 200 ? ev : null)),
      ),
    )
  ).filter(ev => ev);

  const attachments = aliveEvents.map(event => {
    const dt = spacetime(event.start_time).goto(TIMEZONE);
    const time = dt.format('time');
    const groupName = event.group_name.trim().replace(/\*/g, '٭­');
    const location = event.location.trim().replace(/\*/g, '٭');
    const shortLocation = location.split(',', 1)[0].trim();
    let contextText = `*${time}*`;
    if (location)
      contextText += ` - <https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        location,
      )}|${shortLocation}>`;
    contextText += ` - ${groupName}`;
    return {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*<${event.url}|${event.name.trim()}>*`,
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

  const msg = events.length
    ? {
        text: `📢 *${events.length}* tech event${
          events.length == 1 ? '' : 's'
        } today!`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `📢 *${events.length}* tech event${
                events.length == 1 ? '' : 's'
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

const postEvents = async channel => {
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
  require('http')
    .createServer(handler)
    .listen(PORT, listen);
}
