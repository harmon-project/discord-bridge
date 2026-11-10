import { Client, GatewayIntentBits, Partials } from "discord.js";

export function createDiscordClient(): Client {
	return new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.MessageContent
		],
		partials: [Partials.Channel, Partials.Message],
		rest: {
			// discord.js aborts a request after 15s by default and then
			// *retries* it. Webhook sends with several large attachments
			// routinely take longer than that to upload, and Discord often
			// still finishes processing the aborted one, so the retry posted
			// the same message twice. Give uploads enough time to complete.
			timeout: 120_000
		}
	});
}
