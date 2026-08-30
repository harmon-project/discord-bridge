import type { Client as DiscordClient, TextChannel } from "discord.js";
import { ChannelType } from "discord.js";
import type { BridgeConfig } from "./config.js";
import { HarmonClient } from "./harmon/client.js";
import type { HarmonIdentity } from "./harmon/identity.js";
import { uint8ArrayToZ32 } from "./harmon/vendor/utils.js";
import { getOrCreateWebhook } from "./discord/webhooks.js";

const DISCORD_MESSAGE_LIMIT = 2000;

interface Pair {
	discordChannelId: string;
	harmonChannelId: string;
	harmon: HarmonClient;
}

export async function startBridge(
	discord: DiscordClient,
	config: BridgeConfig,
	identity: HarmonIdentity,
) {
	const ourPublicKeyZ32 = uint8ArrayToZ32(identity.publicKey);
	const pairs: Pair[] = [];

	for (const {
		discordChannelId,
		harmonChannelId,
		webhookName,
	} of config.channels) {
		const channel = await discord.channels.fetch(discordChannelId);
		if (!channel || channel.type !== ChannelType.GuildText) {
			throw new Error(
				`Discord channel ${discordChannelId} is not a text channel the bot can see`,
			);
		}

		const webhook = await getOrCreateWebhook(
			channel as TextChannel,
			webhookName,
		);
		const profileName = config.harmon.profileName;

		if (!profileName) {
			console.error("[bridge] config.harmon.profileName must be set");
			return;
		}

		const harmon = new HarmonClient(
			config.harmon.url,
			identity,
			harmonChannelId,
			profileName,
		);

		const pair: Pair = { discordChannelId, harmonChannelId, harmon };
		pairs.push(pair);

		harmon.on("ready", () => {
			console.log(`[bridge] joined Harmon channel ${harmonChannelId}`);
		});

		harmon.on("disconnected", () => {
			console.warn(
				`[bridge] Harmon connection for ${harmonChannelId} dropped, reconnecting...`,
			);
		});

		harmon.on("error", (error) => {
			console.error(`[bridge] Harmon error for ${harmonChannelId}:`, error);
		});

		harmon.on("message", async (message) => {
			// Don't echo our own relayed messages back to Discord.
			if (message.profile.public_key === ourPublicKeyZ32) return;

			try {
				// TODO: relay message.attachments (GET /files/:id -> Discord attachment).
				const content = `${message.content}`;
				const username = sanitizeWebhookUsername(
					`${message.profile.name || "Unnamed user"} [Harmon]`,
				);

				for (const chunk of splitForDiscord(content)) {
					await webhook.send({
						content: chunk,
						username,
						// TODO: avatarURL - Harmon profiles have no avatar field yet.
					});
				}
			} catch (error) {
				console.error(
					`[bridge] failed to relay Harmon message to Discord:`,
					error,
				);
			}
		});

		harmon.connect();
	}

	discord.on("messageCreate", async (message) => {
		if (message.author.bot) return; // covers our own webhook posts and other bots

		const pair = pairs.find((p) => p.discordChannelId === message.channelId);
		if (!pair) return;

		const content = message.content.trim();
		if (!content && message.attachments.size === 0) return;

		// TODO: relay message.attachments (download -> POST /files -> attachment ids).
		const prefixed = `**${message.member?.displayName ?? message.author.username}:** ${content}`;

		try {
			await pair.harmon.sendMessage(prefixed);
		} catch (error) {
			console.error(
				`[bridge] failed to relay Discord message to Harmon:`,
				error,
			);
		}
	});

	return pairs;
}

// Discord rejects webhook usernames containing "discord" or "clyde"
// (case-insensitive), so any Harmon display name with those substrings
// would otherwise crash the relay. Break the match up with a visible
// separator rather than a zero-width one - Discord strips those before
// checking, which would defeat the point.
function sanitizeWebhookUsername(name: string): string {
	return name
		.replace(/discord/gi, (m) => `${m.slice(0, 4)}·${m.slice(4)}`)
		.replace(/clyde/gi, (m) => `${m.slice(0, 2)}·${m.slice(2)}`);
}

function splitForDiscord(content: string): string[] {
	if (content.length <= DISCORD_MESSAGE_LIMIT) return [content];

	const chunks: string[] = [];
	for (let i = 0; i < content.length; i += DISCORD_MESSAGE_LIMIT) {
		chunks.push(content.slice(i, i + DISCORD_MESSAGE_LIMIT));
	}
	return chunks;
}
