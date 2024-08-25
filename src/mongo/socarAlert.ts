import {model, Model, Schema} from "mongoose";
import {Translator} from "../translator";
import dayjs from "dayjs";

export interface ISocarAlert {
		id: string;
		objectId: number;
		description: string;
		title: string;
		affectedCustomers: number;
		start: Date;
		end: Date;
		notifiedCustomers: number;
		isNotified: boolean;
		type: string;
		docflowCode: string;
		dateChanged: boolean;
		created: Date;
		isPending: boolean;
		isDeactivated: boolean;
		detail: IDetail;

		/**
		 * Check if the alert is related to the given city
		 * @param city - City name in Georgian
		 */
		isCity: (city: string) => boolean;
		/**
		 * Check if the alert is actual
		 */
		isActual: () => boolean;

		format: () => Promise<string>;
}

export interface IDetail {
		notificationTitle: string;
		notificationDescription: string;
		notificationTitleEN: string;
		notificationDescriptionEN: string;
}

type SocarAlertDocumentProps = {};

type SocarAlertType = Model<ISocarAlert, {}, SocarAlertDocumentProps>;

const socarAlertSchema = new Schema<ISocarAlert, SocarAlertType>({
		id: {type: String, required: true},
		objectId: {type: Number, required: true},
		description: {type: String, default: ''},
		title: {type: String, required: true},
		affectedCustomers: {type: Number, required: true},
		start: {type: Date, required: true},
		end: {type: Date, required: true},
		notifiedCustomers: {type: Number, required: true},
		isNotified: {type: Boolean, required: true},
		type: {type: String, required: true},
		docflowCode: {type: String, required: true},
		dateChanged: {type: Boolean, required: true},
		created: {type: Date, required: true},
		isPending: {type: Boolean, required: true},
		isDeactivated: {type: Boolean, required: true},

		detail: {
				type: new Schema<IDetail>({
						notificationTitle: {type: String, required: true},
						notificationDescription: {type: String, required: true},
						notificationTitleEN: {type: String, required: true},
						notificationDescriptionEN: {type: String, required: true},
				}),
				required: true
		},
});

socarAlertSchema.methods.isCity = function (city: string) {
		// City name + municipality
		const cityRegex = new RegExp(`${city}ს? მუნიციპალიტეტში`, 'i');
		return cityRegex.test(this.detail.notificationDescription)
};

socarAlertSchema.methods.isActual = function () {
		return this.end >= new Date();
}

socarAlertSchema.methods.format = async function () {
		const title = await Translator.getTranslation(this.title)
		const from = dayjs(this.start)
		const to = dayjs(this.end)
		const sameDay = from.isSame(to, 'day')

		let range: string;
		if (sameDay) {
				range = `${from.format('YYYY-MM-DD HH:mm')} - ${to.format('HH:mm')}`;
		} else {
				range = `${from.format('YYYY-MM-DD HH:mm')} - ${to.format('YYYY-MM-DD HH:mm')}`;
		}
		return `*${title}*\n\n💨 #Socar Gas shutdown\n\n*Date:*  ${range}\n\n${this.detail.notificationTitleEN} [${this.objectId}]`;
}

export const SocarAlert = model<ISocarAlert, SocarAlertType>('SocarAlert', socarAlertSchema);
