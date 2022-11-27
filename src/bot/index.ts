import dotenv from 'dotenv';
import {Telegram, UpdateType} from 'puregram'
import {BatumiElectricityParser} from "../batumiElectricity";
import {Translator} from "../translator";
import {Alert} from "../batumiElectricity/types";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) throw new Error("No telegram token in .env")

const telegram = Telegram.fromToken(token)
const batumi = new BatumiElectricityParser();

async function getAlertsForDate(date: Date, caption: string, cityGe : string|null = null) {
  const alerts = await batumi.getAlertsFromDay(date)
  let regions = new Map<string, Array<Alert>>()
  for (let alert of alerts) {
    if (cityGe && alert.scName !== cityGe) continue

    const region = await Translator.getTranslation(alert.scName)
    if (!regions.has(region)) {
      regions.set(region, new Array<Alert>())
    }

    const regionArr = regions.get(region)
    regionArr?.push(alert)
  }

  regions = new Map([...regions].sort((a, b) => a[0].localeCompare(b[0])))

  let text = `${caption}\n`

  for (let [region, alerts] of regions) {
    text += `${region}\n`
    for (let alert of alerts) {
      text += `${alert.getPlanEmoji()} ${alert.formatStartTime()} - ${alert.formatEndTime()} /alert_${alert.taskId}\n`
    }
    text += "\n"
  }

  return text
}

telegram.updates.on(UpdateType.Message, async context => {
  const text = context.text;

  console.log(`Message from ${context.from?.username}`)

  if (text) {
    if (context.text?.startsWith('/')) {
      console.log(`Command ${context.text}`)
      switch (text) {
        case "/start":
          context.send(`Let's start!\nMy commands: /today\n/tomorrow\n/upcoming\n/cities\n`)
          return
        case "/today": {
          const date = new Date();
          const caption = "Today's alerts:"
          const s = await getAlertsForDate(date, caption);
          context.send(s)
          return
        }
        case "/tomorrow": {
          const today = new Date()
          let tomorrow = new Date()
          tomorrow.setDate(today.getDate() + 1)
          const caption = "Tomorrow's alerts:"
          const s = await getAlertsForDate(tomorrow, caption);
          context.send(s)
          return
        }

        case "/upcoming": {
          const upcomingDays: Array<Date> = await batumi.getUpcomingDays()

          if (upcomingDays.length == 0) {
            context.send("No upcoming alerts")
            return
          }

          for (let date of upcomingDays) {
            const caption = `Alerts for ${date.toDateString()}`
            const s = await getAlertsForDate(date, caption);
            context.send(s)
            await new Promise(r => setTimeout(r, 300))
          }

          return
        }
        case "/cities": {
          const cities = await batumi.getCitiesList()
          let text = "Cities with upcoming alerts:\n"
          for (let city of Array.from(cities.values()).sort()) {
            text += `${city} /upcoming_${city} \n`
          }

          context.send(text)
          return
        }
      }

      if (text.startsWith("/alert_")) {
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

      if (text.startsWith("/upcoming_")){
        const cityEn = text.replace("/upcoming_", "")
        const cities = await batumi.getCitiesList();
        const cityGe = cities.revGet(cityEn)

        const upcomingDays: Array<Date> = await batumi.getUpcomingDays(cityGe)

        if (upcomingDays.length == 0) {
          context.send(`No upcoming alerts for ${cityEn}`)
          return
        }

        for (let date of upcomingDays) {
          const caption = `Alerts for ${date.toDateString()}`
          const s = await getAlertsForDate(date, caption, cityGe);
          context.send(s)
          await new Promise(r => setTimeout(r, 300))
        }

        return
      }
    } else {
      console.log(`Simple text ${context.text}`)
    }
  } else {
    console.log("Not a text")
  }

  context.send(`Here random number: ${Math.random()}`);
})

telegram.updates.startPolling().then(success => console.log(`@${telegram.bot.username} launched: ${success}`))
