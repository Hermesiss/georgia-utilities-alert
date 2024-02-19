import express, {Express, Request, Response} from "express";
import http from "http";
import dotenv from "dotenv";
import {envError} from "./common/utils";
import dayjs from "dayjs";
import {TelegramController} from "./bot";

const app = express();
let server: http.Server;

dotenv.config();

const port = process.env.PORT || 8000;
const ownerId = process.env.TELEGRAM_OWNER_ID ?? envError("TELEGRAM_OWNER_ID")
const token = process.env.TELEGRAM_BOT_TOKEN ?? envError("TELEGRAM_BOT_TOKEN")
const tgController = new TelegramController(token, ownerId);

process.on('SIGTERM', async () => {
		console.log('SIGTERM signal received. Shutting down.');

		if (server) {
				server.close(() => {
						console.log('Express server closed');
				});
		} else {
				console.log("No server to close")
		}

		console.log("Stopping telegram")
		tgController.stopPollingUpdates()


		while (tgController.isFetching) {
				console.log("Waiting for fetch to finish")
				await new Promise(resolve => setTimeout(resolve, 500));
		}

		console.log("Exiting")
		process.exit(0);
});

const run = async () => {
		app.use(express.static('public'))

		app.get('/', (req: Request, res: Response) => {
				res.send('Georgia Utilities Alert');
		});

		app.post('/api/actions/updatePostedAlerts', (req: Request, res: Response) => {
				callAsyncAndMeasureTime(
					async () => {
							const day = dayjs().format('YYYY-MM-DD HH:mm')
							await tgController.sendToOwner("Daily midnight renaming " + day)
							await tgController.editAllPostedAlerts(links => {
									res.send(links);
							})
							await tgController.sendToOwner("Daily midnight renaming ended " + day)
					}, "updatePostedAlerts"
				)
		})

		app.post('/api/actions/checkAlerts', (req: Request, res: Response) => {
				tgController.fetchAndSendNewAlerts().then()
				res.send("OK")
		})

		app.post('/api/actions/sendToday', (req: Request, res: Response) => {
				callAsyncAndMeasureTime(
					async () => {
							await tgController.sendToOwner("Daily morning report " + dayjs().format('YYYY-MM-DD HH:mm'))
							const date = dayjs()
							await tgController.postAlertsForDay(date, `Today! ${date.format('YYYY-MM-DD')}`)
					}, "postAlertsForToday"
				).then()
				res.send("OK")
		})

		app.post('/api/actions/sendTomorrow', (req: Request, res: Response) => {
				callAsyncAndMeasureTime(
					async () => {
							await tgController.sendToOwner("Daily evening report " + dayjs().format('YYYY-MM-DD HH:mm'))
							const tomorrowDate = dayjs().add(1, 'day')
							await tgController.postAlertsForDay(tomorrowDate, `Tomorrow, ${tomorrowDate.format('YYYY-MM-DD')}`)
					}, "postAlertsForTomorrow"
				).then()
				res.send("OK")
		})

		app.post('/api/actions/sendDate/:date', (req: Request, res: Response) => {
				const date = req.params.date
				callAsyncAndMeasureTime(
					async () => {
							await tgController.sendToOwner(`Report for day ${date} at ${dayjs().format('YYYY-MM-DD HH:mm')}`)
							const dateObj = dayjs(date);
							await tgController.postAlertsForDay(dateObj, dateObj.format("DD MMMM YYYY"))
					}, "postAlertsForDay"
				).then()
				res.send("OK")
		})

		server = app.listen(port, () => {
		});

		tgController.run().then()
}

async function callAsyncAndMeasureTime(func: () => Promise<void>, fnName: string) {
		const start = Date.now()
		await func()
		const end = Date.now()
		console.log(`${fnName} Finished in ${end - start} ms`)
}

run().then()