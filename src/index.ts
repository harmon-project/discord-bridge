import "dotenv/config";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WebSocket } from "ws";
import { loadConfig } from "./config.js";
import { loadOrCreateIdentity } from "./harmon/identity.js";
import { createDiscordClient } from "./discord/bot.js";
import { startBridge } from "./bridge.js";

// Harmon's vendored client (src/harmon/vendor/websocke.ts) expects a global
// WebSocket constructor, same as browsers provide. Node's own native
// WebSocket is version-gated, so polyfill unconditionally for consistency
// across Node 20+. Safe to do before connect() is ever called below.
if (!globalThis.WebSocket) {
	// @ts-expect-error - `ws` isn't a 1:1 type match for the DOM WebSocket, close enough here.
	globalThis.WebSocket = WebSocket;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

async function main() {
	const config = loadConfig(join(rootDir, "config.json"));
	const identity = await loadOrCreateIdentity(join(rootDir, ".env"));

	const token = process.env.DISCORD_TOKEN;
	if (!token) {
		throw new Error("DISCORD_TOKEN is not set (see .env.example)");
	}

	const discord = createDiscordClient();

	discord.once("ready", async (client) => {
		console.log(`[discord] logged in as ${client.user.tag}`);
		await startBridge(discord, config, identity);
		console.log("[bridge] up and relaying");
	});

	await discord.login(token);
}

main().catch((error) => {
	console.error("[fatal]", error);
	process.exit(1);
});
