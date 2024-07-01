import {Schema, model, Model} from "mongoose";

export interface ITranslation {
  keyGe: string;
  valueEn: string;
}

type TranslationType = Model<ITranslation>

const translationSchema = new Schema<ITranslation, TranslationType>({
  keyGe: {type: String, required: true, index: true},
  valueEn: {type: String, required: true, default: ''},
})

export const Translation = model<ITranslation, TranslationType>('Translation', translationSchema);
