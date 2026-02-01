import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("syncGithub", { minutes: 30 }, internal.github.syncAll);
crons.interval("telegramReminders", { minutes: 30 }, internal.telegramNode.sendSmartReminders);

export default crons;
