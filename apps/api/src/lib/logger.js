import pino from "pino";

// Structured JSON logs (one line per event). Pretty-printed in development,
// silent in tests. LOG_LEVEL overrides the default level.
const env = process.env.NODE_ENV || "development";

const logger = pino({
  level: process.env.LOG_LEVEL || (env === "test" ? "silent" : "info"),
  redact: ["req.headers.authorization", "req.headers.cookie"],
  ...(env === "development" && {
    transport: {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:HH:MM:ss", ignore: "pid,hostname,req,res,responseTime" },
    },
  }),
});

export default logger;
