import dotenv from 'dotenv';
import {RemoveKeyboard, Telegram, UpdateType} from 'puregram'
import {BatumiElectricityParser} from "../batumiElectricity";
import {Alert} from "../batumiElectricity/types";
import express, {Express, Request, Response} from 'express';
import {MessageContext} from "puregram/lib/contexts/message";
import {TelegramKeyboardButton} from "puregram/lib/generated/telegram-interfaces";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 8000;

app.get('/', (req: Request, res: Response) => {
  res.send('Georgia Utilities Alert');
});

app.listen(port, () => {
});

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) throw new Error("No telegram token in .env")

const telegram = Telegram.fromToken(token)
const batumi = new BatumiElectricityParser();
batumi.fetchAlerts().then(() => console.log("Initial alerts fetch complete"))

async function getAlertsForDate(date: Date, caption: string, cityGe: string | null = null) {
  const alerts = await batumi.getAlertsFromDay(date)
  let regions = new Map<string, Array<Alert>>()
  for (let alert of alerts) {
    if (cityGe && alert.scName !== cityGe) continue

    const region = alert.scName
    if (!regions.has(region)) {
      regions.set(region, new Array<Alert>())
    }

    const regionArr = regions.get(region)
    regionArr?.push(alert)
  }

  regions = new Map([...regions].sort((a, b) => a[0].localeCompare(b[0])))

  let text = `${caption}\n`

  if (regions.size == 0) {
    text += "No alerts"
  } else {
    for (let [region, alerts] of regions) {
      text += `${region}\n`
      for (let alert of alerts) {
        text += `${alert.getPlanEmoji()} ${alert.formatStartTime()} - ${alert.formatEndTime()} /alert_${alert.taskId}\n`
      }
      text += "\n"
    }
  }

  return text
}

async function sendUpcoming(context: MessageContext, cityEn: string) {
  await context.sendChatAction("typing")
  const cities = await batumi.getCitiesList();
  const cityGe = cities.revGet(cityEn)
  const upcomingDays: Array<Date> = await batumi.getUpcomingDays(cityGe)
  if (upcomingDays.length == 0) {
    await context.send(`No upcoming alerts for ${cityEn}`)
    return
  }

  for (let date of upcomingDays) {
    const caption = `Alerts for ${date.toDateString()}`
    const s = await getAlertsForDate(date, caption, cityGe);
    await context.send(s)
    await new Promise(r => setTimeout(r, 300))
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
          const date = new Date();
          const caption = "Today's alerts:"
          const s = await getAlertsForDate(date, caption);
          context.send(s)
          return
        }
        case "/tomorrow": {
          context.sendChatAction("typing")
          const today = new Date()
          let tomorrow = new Date()
          tomorrow.setDate(today.getDate() + 1)
          const caption = "Tomorrow's alerts:"
          const s = await getAlertsForDate(tomorrow, caption);
          context.send(s)
          return
        }

        case "/upcoming": {
          context.sendChatAction("typing")
          const upcomingDays: Array<Date> = await batumi.getUpcomingDays()

          if (upcomingDays.length == 0) {
            await context.send("No upcoming alerts")
            return
          }

          for (let date of upcomingDays) {
            const caption = `Alerts for ${date.toDateString()}`
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
            text += `${city} /upcoming_${city} \n`
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
        const cityEn = text.replace("/upcoming_", "")
        await sendUpcoming(context, cityEn);
        return
      }
    } else {
      console.log(`Simple text ${context.text}`)
    }
  } else {
    console.log("Not a text")
  }
})

//// Set commands
const commands = [
  {command: "today", description: "All today warnings"},
  {command: "tomorrow", description: "All tomorrow warnings"},
  {command: "upcoming", description: "All upcoming alerts grouped by day"},
  {command: "cities", description: "All cities with upcoming alerts"},
];

telegram.api.setMyCommands({
  commands
}).then(value => console.log("Set my commands", value, commands))

telegram.updates.startPolling().then(success => console.log(`@${telegram.bot.username} launched: ${success}`))
