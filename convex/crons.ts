import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

const githubNode = (internal as any).githubNode;
crons.interval("githubSyncWorker", { minutes: 1 }, githubNode.runSyncWorker);
crons.interval("githubReconcileFallback", { minutes: 15 }, githubNode.runSyncWorker);
crons.interval("telegramReminders", { minutes: 30 }, internal.telegramNode.sendSmartReminders);

export default crons;
