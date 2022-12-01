import {Schema, model, connection} from "mongoose";

export interface IOriginalAlert {
  taskId: number;
  taskName: string;
  taskNote?: string;
  scEffectedCustomers: string;
  disconnectionArea: string;
  regionName: string;
  scName: string;
  disconnectionDate: string;
  reconnectionDate: string;
  dif: string;
  taskType: string;
}

const originalAlertSchema = new Schema<IOriginalAlert>({
  taskId: {type: Number, required: true, index: true},
  taskName: {type: String, required: true},
  taskNote: {type: String, required: false},
  scEffectedCustomers: {type: String, required: true},
  disconnectionArea: {type: String, required: true},
  regionName: {type: String, required: true},
  scName: {type: String, required: true},
  disconnectionDate: {type: String, required: true},
  reconnectionDate: {type: String, required: true},
  dif: {type: String, required: true},
  taskType: {type: String, required: true},
})

export const OriginalAlert = model<IOriginalAlert>('OriginalAlert', originalAlertSchema);

//TODO move somewhere else
connection.on("error", console.error.bind(console, "connection error: "));
connection.once("open", function () {
  console.log("Connected successfully");
});


