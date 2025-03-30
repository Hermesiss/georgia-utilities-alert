import express, {Express, Request, Response} from "express";
import http from "http";
import dotenv from "dotenv";
import {envError} from "./common/utils";
import dayjs from "dayjs";
import {TelegramController} from "./bot";
import {OriginalAlert} from "./mongo/originalAlert";

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
				res.sendFile('index.html', { root: 'public' });
		});

		app.get('/api/stats/street/:street/cities', async (req: Request, res: Response) => {
				const street = req.params.street;
				const oneYearAgo = dayjs().subtract(1, 'year').toDate();

				try {
						const alerts = await OriginalAlert.find({
								disconnectionArea: { $regex: street, $options: 'i' },
								createdDate: { $gte: oneYearAgo }
						});

						// Count cities and sort by frequency
						const cityCounts = alerts.reduce((acc, alert) => {
								acc[alert.scName] = (acc[alert.scName] || 0) + 1;
								return acc;
						}, {} as Record<string, number>);

						const cities = Object.entries(cityCounts)
								.sort(([,a], [,b]) => b - a)
								.map(([name, count]) => ({ name, count }));

						res.json({ cities });
				} catch (error) {
						res.status(500).json({ error: 'Failed to fetch cities' });
				}
		});

		app.get('/api/stats/street/:street/city/:city', async (req: Request, res: Response) => {
				const street = req.params.street;
				const city = req.params.city;
				const oneYearAgo = dayjs().subtract(1, 'year').toDate();

				try {
						const alerts = await OriginalAlert.find({
								disconnectionArea: { $regex: street, $options: 'i' },
								scName: city,
								createdDate: { $gte: oneYearAgo }
						}).sort({ disconnectionDate: -1 });

						const total = alerts.length;
						const lastDisconnection = alerts[0]?.disconnectionDate;
						
						// Calculate total affected customers
						const totalAffectedCustomers = alerts.reduce((sum, alert) => {
							const customers = parseInt(alert.scEffectedCustomers || '0') || 0;
							return sum + customers;
						}, 0);
						
						// Group alerts by date, including all days between disconnection and reconnection
						const dailyCounts = alerts.reduce((acc, alert) => {
								const disconnectionDate = dayjs(alert.disconnectionDate);
								const reconnectionDate = alert.reconnectionDate ? dayjs(alert.reconnectionDate) : null;
								
								// If reconnection date is different from disconnection date, count all days in between
								if (reconnectionDate && !reconnectionDate.isSame(disconnectionDate, 'day')) {
										for (let d = disconnectionDate; d.isBefore(reconnectionDate); d = d.add(1, 'day')) {
												const dateStr = d.format('YYYY-MM-DD');
												acc[dateStr] = (acc[dateStr] || 0) + 1;
										}
								} else {
										// If no reconnection date or same day, just count the disconnection date
										const dateStr = disconnectionDate.format('YYYY-MM-DD');
										acc[dateStr] = (acc[dateStr] || 0) + 1;
								}
								return acc;
						}, {} as Record<string, number>);

						// Fill in missing dates with zero counts
						const startDate = dayjs().subtract(1, 'year');
						const endDate = dayjs();
						const dates: string[] = [];
						const counts: number[] = [];
						
						for (let d = startDate; d.isBefore(endDate); d = d.add(1, 'day')) {
								const dateStr = d.format('YYYY-MM-DD');
								dates.push(dateStr);
								counts.push(dailyCounts[dateStr] || 0);
						}

						// Calculate achievements
						const maxDisconnectionsInDay = Math.max(...counts);
						const maxDisconnectionsDate = dates[counts.indexOf(maxDisconnectionsInDay)];

						let currentStreak = 0;
						let maxStreakWithDisconnections = 0;
						let maxStreakWithoutDisconnections = 0;
						let daysWithDisconnections = 0;

						counts.forEach(count => {
								if (count > 0) {
										currentStreak++;
										maxStreakWithDisconnections = Math.max(maxStreakWithDisconnections, currentStreak);
										daysWithDisconnections++;
								} else {
										currentStreak = 0;
								}
						});

						currentStreak = 0;
						counts.forEach(count => {
								if (count === 0) {
										currentStreak++;
										maxStreakWithoutDisconnections = Math.max(maxStreakWithoutDisconnections, currentStreak);
								} else {
										currentStreak = 0;
								}
						});

						const totalDays = counts.length;
						const percentageWithDisconnections = (daysWithDisconnections / totalDays) * 100;
						
						res.json({
								total,
								lastDisconnection,
								dailyData: {
										dates,
										counts
								},
								achievements: {
										maxDisconnectionsInDay,
										maxDisconnectionsDate,
										maxStreakWithDisconnections,
										maxStreakWithoutDisconnections,
										percentageWithDisconnections,
										totalDisconnections: total,
										totalAffectedCustomers
								}
						});
				} catch (error) {
						res.status(500).json({ error: 'Failed to fetch statistics' });
				}
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
			console.log(`Server is running on port ${port}`)
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