import dotenv from 'dotenv';
import {APIError, Markdown, RemoveKeyboard, Telegram, UpdateType} from 'puregram'
import {BatumiElectricityParser} from "../batumiElectricity";
import {Alert} from "../batumiElectricity/types";
import express, {Express, Request, Response} from 'express';
import {MessageContext} from "puregram/lib/contexts/message";
import {TelegramKeyboardButton} from "puregram/lib/generated/telegram-interfaces";
import * as mongoose from "mongoose";
import cron, {ScheduledTask} from 'node-cron'
import dayjs, {Dayjs} from "dayjs";
import {getLinkFromPost, IOriginalAlert, IPosts, OriginalAlert} from "../mongo/originalAlert";
import {HydratedDocument} from "mongoose";
import * as Interfaces from "puregram/lib/generated/telegram-interfaces";
import {Translator} from "../translator";

dotenv.config();

const envError = (envName: string) => {
  throw Error(`Missing ${envName} env value`);
}

const port = process.env.PORT || 8000;
const ownerId = process.env.TELEGRAM_OWNER_ID ?? envError("TELEGRAM_OWNER_ID")
const token = process.env.TELEGRAM_BOT_TOKEN ?? envError("TELEGRAM_BOT_TOKEN")

let telegram: Telegram = Telegram.fromToken(token)
let batumi: BatumiElectricityParser;

const channelMain = process.env.TELEGRAM_CHANNEL_MAIN ?? envError("TELEGRAM_CHANNEL_MAIN")
const channelBatumi = process.env.TELEGRAM_CHANNEL_BATUMI ?? envError("TELEGRAM_CHANNEL_BATUMI")
const channelKutaisi = process.env.TELEGRAM_CHANNEL_KUTAISI ?? envError("TELEGRAM_CHANNEL_KUTAISI")
const channelKobuleti = process.env.TELEGRAM_CHANNEL_KOBULETI ?? envError("TELEGRAM_CHANNEL_KOBULETI")

function getChannelsForAlert(alert: Alert): Set<string> {
  //main channel and local channels for alert
  const s = new Set<string>([channelMain])
  for (let string of alert.citiesList) {
    switch (string) {
      case "Batumi":
        s.add(channelBatumi)
        break;
      case "Kutaisi":
        s.add(channelKutaisi)
        break;
      case "Kobuleti":
        s.add(channelKobuleti)
        break;
    }
  }
  return s;
}

async function sendAlertToChannels(alert: Alert): Promise<void> {
  if (process.env.TELEGRAM_DISABLE_CHANNELS == "true") return

  const channels = getChannelsForAlert(alert)
  const text = await alert.formatSingleAlert()

  // notify if alert is today or tomorrow
  const today = dayjs(alert.disconnectionDate).isSame(dayjs(), 'day')
  const tomorrow = dayjs(alert.disconnectionDate).isSame(dayjs().add(1, 'day'), 'day')
  const notify = today || tomorrow

  const originalAlert = await OriginalAlert.findOne({taskId: alert.taskId})

  if (!originalAlert) {
    throw Error(`ALERT ${alert.taskId} SHOULD BE IN DB AT THIS MOMENT`)
  }

  if (!originalAlert.posts) {
    originalAlert.posts = new Array<IPosts>()
  }

  for (let chat_id of channels) {
    console.log("==== SEND TO CHANNEL")

    try {
      const msg = await telegram.api.sendMessage({chat_id, text, parse_mode: 'Markdown', disable_notification: !notify})
      originalAlert.posts.push({channel: chat_id, messageId: msg.message_id})
    } catch (e) {
      console.log(`Error sending to ${chat_id}\nText:\n`, text, "Error:\n", e)
    }

    await new Promise(r => setTimeout(r, 1500))
  }

  await originalAlert.save()
}

async function postAlertsForDay(date: Dayjs, caption: string, debug = false): Promise<void> {
  const alerts = await batumi.getOriginalAlertsFromDay(date)
  console.log(`Posting ${alerts.length} alerts for ${date.format('YYYY-MM-DD')}`)
  const orderedAlerts = alerts.sort((a, b) => dayjs(a.disconnectionDate).unix() - dayjs(b.disconnectionDate).unix())

  const channelsWithAlerts = new Map<string, string[]>()

  for (let alert of orderedAlerts) {
    if (alert.deletedDate) continue

    const disconnectionTime = dayjs(alert.disconnectionDate).format('HH:mm')
    const reconnectionTime = dayjs(alert.reconnectionDate).format('HH:mm')
    let alertName = (await Translator.getTranslation(alert.taskName))

    alertName = Markdown.escape(alertName.replace('[', '(').replace(']', ')'))
    if (alert.posts.length == 0) {
      console.log(`Alert ${alert.taskId} has no posts. ${alert.createdDate}`)
      continue
    }

    for (let post of alert.posts) {
      if (post.channel == channelMain && !debug) continue

      if (!channelsWithAlerts.has(post.channel)) {
        channelsWithAlerts.set(post.channel, new Array<string>())
      }

      const link = getLinkFromPost(post)
      const markdownLink = `[${disconnectionTime}-${reconnectionTime} ${alertName}](${link})\n`

      channelsWithAlerts.get(post.channel)?.push(markdownLink)
    }
  }

  if (channelsWithAlerts.size == 0) {
    await sendToOwner(`No alerts for ${date.format('YYYY-MM-DD')}`)
  }

  for (let channelsWithAlert of channelsWithAlerts) {
    const post = `*${caption}*\n\n${channelsWithAlert[1].join('')}`
    if (debug) {
      await sendToOwner(post, "Markdown", 1000)
    } else {
      console.log("==== SEND DAILY TO CHANNEL")
      await telegram.api.sendMessage({chat_id: channelsWithAlert[0], text: post, parse_mode: 'Markdown'})
      await new Promise(r => setTimeout(r, 1500))
    }
  }
}


async function fetchAndSendNewAlerts() {
  const changedAlerts = await batumi.fetchAlerts(true)
  if (changedAlerts.length == 0) {
    await sendToOwner("No new alerts " + dayjs().format('YYYY-MM-DD HH:mm'),)
  } else {
    for (let changedAlert of changedAlerts) {
      let text: string | null = null
      if (changedAlert.deletedAlert) {
        await updatePost(changedAlert.deletedAlert)
      } else if (changedAlert.oldAlert == null) {
        await sendAlertToChannels(changedAlert.translatedAlert)
      } else if (changedAlert.diffs.length > 0) {
        const diffPrint = JSON.stringify(changedAlert.diffs)
        text = `Changed alert ${changedAlert.translatedAlert.scName} /alert_${changedAlert.translatedAlert.taskId}\n${diffPrint}`
      } else {
        //something is wrong
        text = `¯\\_(ツ)_/¯ /alert_${changedAlert.translatedAlert.taskId}`;
      }

      if (text) {
        await sendToOwner(text)
        await new Promise(r => setTimeout(r, 1000))
      }
    }
  }
}

const run = async () => {
  const mongoConnectString = process.env.MONGODB_CONNECT_STRING;

  if (!mongoConnectString) {
    throw new Error("MONGODB_CONNECT_STRING env variable is missing")
  }

  await mongoose.connect(mongoConnectString)

  const app: Express = express();

  app.get('/', (req: Request, res: Response) => {
    res.send('Georgia Utilities Alert');
  });

  app.get('/createCronJobs', (req: Request, res: Response) => {
    res.send(createCronJobs());
  })

  app.listen(port, () => {
  });

  batumi = new BatumiElectricityParser();

  await fetchAndSendNewAlerts();

  telegram.updates.startPolling().then(success => console.log(`@${telegram.bot.username} launched: ${success}`))
}


async function callAsyncAndMeasureTime(func: () => Promise<void>, fnName: string) {
  const start = Date.now()
  await func()
  const end = Date.now()
  console.log(`${fnName} Finished in ${end - start} ms`)
}

let cron10min: ScheduledTask | null = null;
let cronMorning: ScheduledTask | null = null;
let cronEvening: ScheduledTask | null = null;

function createCronJobs(): string {
  let response = ""
  if (cron10min) {
    response += "10min job already exists"
    cron10min.stop()
  }

  response += "10min job created"
  //run every 10 minutes
  cron10min = cron.schedule("*/10 * * * *", async () => {
    await callAsyncAndMeasureTime(async () => {
      await fetchAndSendNewAlerts()
    }, "fetchAndSendNewAlerts")
  })

  if (cronMorning) {
    response += "Morning job already exists"
    cronMorning.stop()
  }

  response += "Morning job created"
  //run every day at 09:00
  cronMorning = cron.schedule("0 9 * * *", async () => {
    await callAsyncAndMeasureTime(
      async () => {
        await sendToOwner("Daily morning report " + dayjs().format('YYYY-MM-DD HH:mm'))
        await postAlertsForDay(dayjs(), "Today!", false)
      }, "postAlertsForToday"
    )
  })

  if (cronEvening) {
    response += "Evening job already exists"
    cronEvening.stop()
  }

  response += "Evening job created"
  //run every day at 21:00
  cronEvening = cron.schedule("0 21 * * *", async () => {
    await callAsyncAndMeasureTime(
      async () => {
        await sendToOwner("Daily evening report " + dayjs().format('YYYY-MM-DD HH:mm'))
        await postAlertsForDay(dayjs().add(1, 'day'), "Tomorrow", false)
      }, "postAlertsForTomorrow"
    )
  })

  return response
}

//aggregate alerts by day in disconnectionDate. TODO TEST THIS
async function getAlertsByDay(): Promise<Map<string, HydratedDocument<IOriginalAlert>[]>> {
  const alerts = await OriginalAlert.find()
  const map = new Map<string, HydratedDocument<IOriginalAlert>[]>()
  for (let alert of alerts) {
    const date = dayjs(alert.disconnectionDate).format('YYYY-MM-DD')
    if (!map.has(date)) {
      map.set(date, new Array<HydratedDocument<IOriginalAlert>>())
    }
    map.get(date)?.push(alert)
  }
  return map
}


async function getAlertSummaryForDate(date: Dayjs, caption: string, cityName: string | null = null): Promise<string> {
  const alerts = await batumi.getAlertsFromDay(date)
  let regions = new Map<string, Array<Alert>>()
  for (let alert of alerts) {
    //Show only selected city if specified
    if (cityName && !alert.citiesList.has(cityName)) continue

    for (let region of alert.citiesList) {
      //Add for only selected city if specified
      if (cityName && region != cityName) continue
      if (!regions.has(region)) {
        regions.set(region, new Array<Alert>())
      }

      const regionArr = regions.get(region)
      regionArr?.push(alert)
    }
  }

  regions = new Map([...regions].sort((a, b) => a[0].localeCompare(b[0])))

  let text = `${caption}\n`

  if (regions.size == 0) {
    text += "No alerts"
  } else {
    for (let [region, alerts] of regions) {
      if (!cityName) //Don't show city name if it was specified
        text += `${region}\n`
      for (let alert of alerts) {
        text += `${alert.getPlanEmoji()} ${alert.formatStartTime()} - ${alert.formatEndTime()} /alert_${alert.taskId}\n`
      }
      text += "\n"
    }
  }

  return text
}

async function sendUpcoming(context: MessageContext, cityCommand: string) {
  await context.sendChatAction("typing")
  const cities = await batumi.getCitiesList();
  const city = cities.revGet(cityCommand)
  if (!city) {
    await context.send(`No alerts for ${cityCommand}`)
    return
  }
  const upcomingDays: Array<Dayjs> = await batumi.getUpcomingDays(city)
  if (upcomingDays.length == 0) {
    await context.send(`No upcoming alerts for ${cityCommand}`)
    return
  }

  for (let date of upcomingDays) {
    const caption = `Alerts for ${date.toString()}`
    const s = await getAlertSummaryForDate(date, caption, city);
    await context.send(s)
    await new Promise(r => setTimeout(r, 300))
  }
}

async function updatePost(originalAlert: HydratedDocument<IOriginalAlert>) {
  if (!originalAlert.posts) {
    console.error("Cannot update posts about deleted alert: no posts in DB")
    return
  }

  const alert = await Alert.fromOriginal(originalAlert)

  for (let post of originalAlert.posts) {
    const text = await alert.formatSingleAlert()
    let logTxt = `Changing post ${getLinkFromPost(post)}`
    let tries = 3
    while (tries > 0) {
      try {
        console.log("==== EDIT POST")
        await telegram.api.editMessageText({
          chat_id: post.channel,
          message_id: post.messageId,
          text,
          parse_mode: "Markdown"
        })
        console.log(logTxt)
        break
      } catch (e: any) {
        if ('code' in e) {
          if (e.code == 400) { // Bad Request: message is not modified
            // TODO handle markdown parse error
            console.log("Already edited")
            break
          }
          if (e.code == 429) { // Too Many Requests
            const apiError = <APIError>e
            const retry = apiError.parameters?.retry_after
            tries--
            if (retry) {
              console.log(`WAIT FOR ${retry} AND RETRY, ${tries}`)
              await new Promise(r => setTimeout(r, 1000 * (retry + 1)))
            } else {
              console.log(`RETRY, ${tries}`)
            }
          }
        } else {
          logTxt = e.toString()
          console.log("==== UNKNOWN ERROR", e)
          break
        }
      }
    }

    await new Promise(r => setTimeout(r, 1000))
    await sendToOwner(logTxt)

    await new Promise(r => setTimeout(r, 1000))
  }
}

async function sendToOwner(text: string, parse_mode: Interfaces.PossibleParseMode | undefined = undefined, awaitTimeMs: number = 0) {
  if (!ownerId) return
  console.log("==== SEND TO OWNER")
  await telegram.api.sendMessage({chat_id: ownerId, text: text, parse_mode})
  if (awaitTimeMs > 0) {
    await new Promise(r => setTimeout(r, awaitTimeMs))
  }
}

telegram.updates.on(UpdateType.Message, async context => {
  const text = context.text;

  console.log(`Message from ${context.from?.id} ${context.from?.username}`)

  if (text) {
    if (context.text?.startsWith('/')) {
      console.log(`Command ${context.text}`)
      switch (text) {
        case "/start":
          context.send(`Let's start!\nMy commands:\n/today\n/tomorrow\n/upcoming\n/cities\n`,
            {reply_markup: new RemoveKeyboard(),})
          return
        case "/today": {
          context.sendChatAction("typing")
          const date = dayjs();
          const caption = "Today's alerts:"
          const s = await getAlertSummaryForDate(date, caption);
          context.send(s)
          return
        }
        case "/tomorrow": {
          context.sendChatAction("typing")
          let tomorrow = dayjs().add(1, "day")
          const caption = "Tomorrow's alerts:"
          const s = await getAlertSummaryForDate(tomorrow, caption);
          context.send(s)
          return
        }
        case "/check_today_debug": {
          await postAlertsForDay(dayjs(), "Today!", true)
          return
        }
        case "/check_today": {
          await postAlertsForDay(dayjs(), "Today!", false)
          return
        }
        case "/check_tomorrow_debug": {
          await postAlertsForDay(dayjs().add(1, 'day'), "Tomorrow", true)
          return
        }
        case "/check_tomorrow": {
          await postAlertsForDay(dayjs().add(1, 'day'), "Tomorrow", false)
          return
        }
        case "/upcoming": {
          context.sendChatAction("typing")
          const upcomingDays: Array<Dayjs> = await batumi.getUpcomingDays()

          if (upcomingDays.length == 0) {
            await context.send("No upcoming alerts")
            return
          }

          for (let date of upcomingDays) {
            const caption = `Alerts for ${date.format('YYYY-MM-DD')}`
            const s = await getAlertSummaryForDate(date, caption);
            await context.send(s)
            await new Promise(r => setTimeout(r, 300))
          }
          return
        }
        case "/cities": {
          context.sendChatAction("typing")
          const cities = await batumi.getCitiesList()
          let text = "Cities with upcoming alerts:\n"
          const citiesSorted = Array.from(cities.values()).sort();
          for (let city of citiesSorted) {
            const cityName = cities.revGet(city);
            if (!cityName) continue
            text += `${cityName}:  ${batumi.getAlertCount(cityName)}    /upcoming_${city} \n`
          }

          let kb: TelegramKeyboardButton[][] = []

          for (let i = 0; i < citiesSorted.length; i++) {
            const colCount = 3
            const row = Math.floor(i / colCount)
            const column = i % colCount
            if (!kb[row]) {
              kb[row] = []
            }
            kb[row][column] = {text: `/upcoming_${citiesSorted[i]}`,}
          }

          await context.send(text,
            //{reply_markup: {keyboard: kb, one_time_keyboard: true, resize_keyboard: true}}
          )
          return
        }
      }

      if (text.startsWith("/alert_")) {
        context.sendChatAction("typing")
        const taskId = Number.parseInt(text.replace("/alert_", ""));
        const alertFromId = await batumi.getAlertFromId(taskId);
        if (!alertFromId) {
          context.send(`Cannot find alert with id ${taskId}`)
          return
        }
        const formatSingleAlert = await alertFromId.formatSingleAlert();
        context.send(formatSingleAlert || "", {parse_mode: 'Markdown'})
        return
      }

      if (text.startsWith("/upcoming_")) {
        const cityCommand = text.replace("/upcoming_", "")
        await sendUpcoming(context, cityCommand);
        return
      }
    } else {
      console.log(`Simple text ${context.text}`)
    }
  } else {
    console.log("Not a text")
  }
})

// Set commands
const commands = [
  {command: "today", description: "All today warnings"},
  {command: "tomorrow", description: "All tomorrow warnings"},
  {command: "upcoming", description: "All upcoming alerts grouped by day"},
  {command: "cities", description: "All cities with upcoming alerts"},
];

telegram.api.setMyCommands({
  commands
}).then(value => console.log("Set my commands", value, commands))

run().then()
