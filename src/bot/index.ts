import dotenv from 'dotenv';
import {Telegram, UpdateType} from 'puregram'
import {BatumiElectricityParser} from "../BatumiElectricity";

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) throw new Error("No telegram token in .env")

const telegram = Telegram.fromToken(token)
const batumi = new BatumiElectricityParser();

async function GetAlertsForDate(date: Date, caption: string) {
  const alerts = await batumi.getAlertsFromDay(date)
  return caption + "\n" +
    alerts.map(x => `${x.getPlanEmoji()} [${batumi.getEnCityName(x.scName)}] ${x.formatStartTime()} - ${x.formatEndTime()} /alert_${x.taskId}`).join('\n')
}

telegram.updates.on(UpdateType.Message, async context => {
  const text = context.text;

  console.log(`Message from ${context.from?.username}`)

  if (text) {
    if (context.text?.startsWith('/')) {
      console.log(`Command ${context.text}`)
      switch (text) {
        case "/start":
          context.send(`Let's start!\nSend me /today or /tomorrow`)
          return
        case "/today": {
          const date = new Date();
          const caption = "Today's alerts:"
          context.send(await GetAlertsForDate(date, caption))
          return
        }

        case "/tomorrow": {
          const today = new Date()
          let tomorrow = new Date()
          tomorrow.setDate(today.getDate() + 1)
          const caption = "Tomorrow's alerts:"
          context.send(await GetAlertsForDate(tomorrow, caption))
          return
        }
      }

      if (text.startsWith("/alert_")) {
        const taskId = Number.parseInt(text.replace("/alert_", ""));
        const alertFromId = await batumi.getAlertFromId(taskId);
        if (!alertFromId) {
          context.send(`Cannot find alert with id ${alertFromId}`)
          return
        }
        const formatSingleAlert = alertFromId.formatSingleAlert();
        context.send(formatSingleAlert || "")
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
