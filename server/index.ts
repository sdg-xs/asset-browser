import { access } from "node:fs/promises";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";

const config = readConfig();
await access(config.sourceRoot).catch(() => {
  process.stderr.write(
    `${JSON.stringify({ event: "source-root-unavailable", sourceRoot: config.sourceRoot, message: "Existing models will appear when this configured folder is available. Managed uploads remain available." })}\n`,
  );
});
const app = await createApp(config);
const server = app.listen(config.port, "127.0.0.1", () => {
  process.stdout.write(
    `${JSON.stringify({ event: "library-listening", url: `http://127.0.0.1:${config.port}`, sourceRoot: config.sourceRoot, dataRoot: config.dataRoot })}\n`,
  );
});
server.on("error", (error) => {
  process.stderr.write(
    `${JSON.stringify({ event: "library-start-failed", message: error.message })}\n`,
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server.close();
  });
