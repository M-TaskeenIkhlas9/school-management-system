// Registers every background job type. Imported by server.js (and by tests that run jobs).
import { registerJobHandler } from "./queue.js";
import { deliverMessage } from "../messaging/deliver.js";

registerJobHandler("deliver_message", deliverMessage);
import { answerMessage, notifyApprovers } from "../modules/whatsapp-bot/bot.service.js";
registerJobHandler("whatsapp_bot_message", answerMessage);
registerJobHandler("whatsapp_notify_approvers", notifyApprovers);
