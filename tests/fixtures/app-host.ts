// A Satgas stand-in that starts one app and stays up, so a test can kill it the hard way.
import { startApp } from "../../src/server/apps";
import { loadToken } from "../../src/server/auth";
import { createRun } from "../../src/server/store";

const [command = "", cwd = ""] = process.argv.slice(2);
await loadToken();
const started = await startApp(createRun("host", cwd).id, "web", command);
console.log(started.ok ? started.port : `failed: ${started.error}`);
await Bun.sleep(120_000);
