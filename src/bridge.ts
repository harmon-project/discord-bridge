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

	for (const { discordChannelId, harmonChannelId } of config.channels) {
		const channel = await discord.channels.fetch(discordChannelId);
		if (!channel || channel.type !== ChannelType.GuildText) {
			throw new Error(
				`Discord channel ${discordChannelId} is not a text channel the bot can see`,
			);
		}

		const webhook = await getOrCreateWebhook(channel as TextChannel);
		const profileName = config.harmon.profileName ?? "Discord Bridge";
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

			// TODO: relay message.attachments (GET /files/:id -> Discord attachment).
			const content = `${message.content}`;

			for (const chunk of splitForDiscord(content)) {
				await webhook.send({
					content: chunk,
					username: `${message.profile.name || "Unnamed user"} [Harmon]`,
					// TODO: avatarURL - Harmon profiles have no avatar field yet.
				});
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

function splitForDiscord(content: string): string[] {
	if (content.length <= DISCORD_MESSAGE_LIMIT) return [content];

	const chunks: string[] = [];
	for (let i = 0; i < content.length; i += DISCORD_MESSAGE_LIMIT) {
		chunks.push(content.slice(i, i + DISCORD_MESSAGE_LIMIT));
	}
	return chunks;
}
