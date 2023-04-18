import {Schema, model, connection, Model, Types} from "mongoose";

export interface IOriginalAlert {
  taskId: number;
  taskName: string;
  taskNote?: string;
  scEffectedCustomers?: string;
  disconnectionArea: string;
  regionName: string;
  scName: string;
  disconnectionDate: string;
  reconnectionDate: string;
  dif?: string;
  taskType: string;

  posts: IPosts[];
  createdDate?: Date;
  deletedDate?: Date;
}

export interface IPosts {
  channel: string;
  messageId: number;
  hasPhoto: boolean;
}

// TMethodsAndOverrides
type OriginalAlertDocumentProps = {
  names: Types.DocumentArray<IPosts>;
};

type OriginalAlertType = Model<IOriginalAlert, {}, OriginalAlertDocumentProps>

const originalAlertSchema = new Schema<IOriginalAlert, OriginalAlertType>({
  taskId: {type: Number, required: true, index: true},
  taskName: {type: String, required: false, default: ""},
  taskNote: {type: String, required: false},
  scEffectedCustomers: {type: String, required: false},
  disconnectionArea: {type: String, required: false, default: ""},
  regionName: {type: String, required: true},
  scName: {type: String, required: false, default: ""},
  disconnectionDate: {type: String, required: true},
  reconnectionDate: {type: String, required: true},
  dif: {type: String, required: false},
  taskType: {type: String, required: true},
  posts: [new Schema<IPosts>({
    channel: {type: String, required: true},
    messageId: {type: Number, required: true},
    hasPhoto: {type: Boolean, required: true, default: false},
  })],
  createdDate: {type: Date, required: false},
  deletedDate: {type: Date, required: false},
})


export const OriginalAlert = model<IOriginalAlert, OriginalAlertType>('OriginalAlert', originalAlertSchema);

export const getLinkFromPost = (post: IPosts) => `https://t.me/${post.channel.replace('@', '')}/${post.messageId}`

//TODO move somewhere else
connection.on("error", console.error.bind(console, "connection error: "));
connection.once("open", function () {
  console.log("Connected successfully");
});


