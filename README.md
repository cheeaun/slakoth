Slakoth
===

<img src="slakoth.png" width="320" height="320" alt="">

> A Slack bot that auto-post daily tech events in Singapore.

Notes
---

This runs as a serverless instance but also can run as a normal server.

As of May 2019, it doesn't run its internal "cron-job" anymore. The auto-post part is triggered by a job on [Cronless](https://cronless.com/) instead. The `/post` endpoint will post to the configured Slack channel.

Technicalities
---

1. `npm i` - Install dependencies
2. Set these environment variables, optionally by creating a `.env` file:
    - `SLACK_TOKEN` - Bot token
    - `SLACK_CHANNEL` - Channel ID
3. `npm start` - Runs server