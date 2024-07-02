import {SocarParser} from "../src/parsers/socar";
import {SocarAlert} from "../src/mongo/socarAlert";

describe('SocarParser', () => {
			it('returns array of alerts', async () => {
		const parser = new SocarParser();
		const alerts = await parser.getOutages(1, 100, 'Batumi');
		for (const alert of alerts) {
				const mongoAlert = new SocarAlert(alert);
				const isActual = mongoAlert.isActual();
				console.log(alert.id, alert.detail.notificationTitleEN, mongoAlert.isCity('ბათუმის'), isActual)
		}
		expect(alerts).toBeInstanceOf(Array);
	})
})
