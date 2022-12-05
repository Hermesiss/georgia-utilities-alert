import dotenv from 'dotenv';
import {RemoveKeyboard, Telegram, UpdateType} from 'puregram'
import {BatumiElectricityParser} from "../batumiElectricity";
import {Alert, AlertDiff} from "../batumiElectricity/types";
import express, {Express, Request, Response} from 'express';
import {MessageContext} from "puregram/lib/contexts/message";
import {TelegramKeyboardButton} from "puregram/lib/generated/telegram-interfaces";
import * as mongoose from "mongoose";
import cron from 'node-cron'
import dayjs, {Dayjs} from "dayjs";
import {IPosts, OriginalAlert} from "../mongo/originalAlert";

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

  const originalAlert = await OriginalAlert.findOne({taskId: alert.taskId})

  if (!originalAlert) {
    throw Error(`ALERT ${alert.taskId} SHOULD BE IN DB AT THIS MOMENT`)
  }

  if (!originalAlert.posts) {
    originalAlert.posts = new Array<IPosts>()
  }


  for (let chat_id of channels) {
    const msg = await telegram.api.sendMessage({chat_id, text, parse_mode: 'markdown'})
    originalAlert.posts.push({channel: chat_id, messageId: msg.message_id})
    await new Promise(r => setTimeout(r, 1500))
  }

  await originalAlert.save()
}

async function fetchAndSendNewAlerts() {
  const newAlerts = await batumi.fetchAlerts(true)
  if (newAlerts.length == 0) {
    await sendToOwner("No new alerts " + dayjs().format('YYYY-MM-DD HH:mm'),)
  } else {
    for (let newAlert of newAlerts) {
      let text: string | null = null
      if (newAlert.oldAlert == null) {
        await sendAlertToChannels(newAlert.translatedAlert)
      } else if (newAlert.diffs.length > 0) {
        const diffPrint = JSON.stringify(newAlert.diffs)
        text = `Changed alert ${newAlert.translatedAlert.scName} /alert_${newAlert.translatedAlert.taskId}\n${diffPrint}`
      } else {
        //something is wrong
        text = `¯\\_(ツ)_/¯ /alert_${newAlert.translatedAlert.taskId}`;
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

  app.listen(port, () => {
  });

  batumi = new BatumiElectricityParser();

  await fetchAndSendNewAlerts();

  telegram.updates.startPolling().then(success => console.log(`@${telegram.bot.username} launched: ${success}`))

  //run every 10 minutes
  cron.schedule("*/10 * * * *", async () => {
    await fetchAndSendNewAlerts();
  })
}


async function getAlertsForDate(date: Dayjs, caption: string, cityName: string | null = null): Promise<string> {
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
    const s = await getAlertsForDate(date, caption, city);
    await context.send(s)
    await new Promise(r => setTimeout(r, 300))
  }
}

async function sendToOwner(text: string) {
  if (!ownerId) return
  await telegram.api.sendMessage({chat_id: ownerId, text: text})
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
          const s = await getAlertsForDate(date, caption);
          context.send(s)
          return
        }
        case "/tomorrow": {
          context.sendChatAction("typing")
          let tomorrow = dayjs().add(1, "day")
          const caption = "Tomorrow's alerts:"
          const s = await getAlertsForDate(tomorrow, caption);
          context.send(s)
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
            const s = await getAlertsForDate(date, caption);
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
        context.send(formatSingleAlert || "", {parse_mode: 'markdown'})
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
