import type {
	AttachmentPayload,
	Client as DiscordClient,
	TextChannel,
} from "discord.js";
import { ChannelType } from "discord.js";
import type { BridgeConfig } from "./config.js";
import { deriveHttpUrl, HarmonClient } from "./harmon/client.js";
import type { HarmonIdentity } from "./harmon/identity.js";
import { uint8ArrayToZ32 } from "./harmon/vendor/utils.js";
import { getFile, postFiles, type UploadableFile } from "./harmon/vendor/http.js";
import { getOrCreateWebhook } from "./discord/webhooks.js";

const DISCORD_MESSAGE_LIMIT = 2000;
// Discord webhooks reject uploads above the guild's boost-tier cap (10MB on
// a non-boosted server, up to 100MB boosted). We don't know the target
// guild's tier here, so use the safe non-boosted default rather than risk a
// 413 on send.
const DISCORD_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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
	const harmonHttpUrl = deriveHttpUrl(config.harmon.url);
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
				const content = `${message.content}`;
				const username = sanitizeWebhookUsername(
					`${message.profile.name || "Unnamed user"} [Harmon]`,
				);

				const files: AttachmentPayload[] = [];
				const oversizedLinks: string[] = [];
				for (const attachment of message.attachments) {
					if (attachment.size > DISCORD_MAX_ATTACHMENT_BYTES) {
						oversizedLinks.push(
							`[${attachment.name} (${formatBytes(attachment.size)}) too large to relay - ${harmonHttpUrl}/files/${attachment.id}]`,
						);
						continue;
					}

					try {
						const blob = await getFile(harmonHttpUrl, attachment.id);
						files.push({
							attachment: Buffer.from(await blob.arrayBuffer()),
							name: attachment.name,
						});
					} catch (error) {
						console.error(
							`[bridge] failed to fetch Harmon attachment ${attachment.id}:`,
							error,
						);
					}
				}

				await webhook.send({
					content: truncateForDiscord(content, oversizedLinks),
					username,
					files,
					// TODO: avatarURL - Harmon profiles have no avatar field yet.
				});
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

		const prefixed = `**${message.member?.displayName ?? message.author.username}:** ${content}`;

		try {
			const attachmentIds: string[] = [];
			if (message.attachments.size > 0) {
				const files: UploadableFile[] = [];
				for (const attachment of message.attachments.values()) {
					const response = await fetch(attachment.url);
					files.push({
						name: attachment.name,
						mimeType: attachment.contentType ?? "application/octet-stream",
						data: Buffer.from(await response.arrayBuffer()),
					});
				}

				const uploaded = await postFiles(harmonHttpUrl, files);
				attachmentIds.push(...uploaded.map((file) => file.id));
			}

			await pair.harmon.sendMessage(prefixed, attachmentIds);
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

/**
 * Truncates `content` to fit Discord's message limit, reserving space for
 * `extraLines` (e.g. oversized-attachment links) so they always survive
 * intact even if the original content has to be cut short.
 */
function truncateForDiscord(content: string, extraLines: string[] = []): string {
	const suffix = extraLines.join("\n");
	const budget = Math.max(0, DISCORD_MESSAGE_LIMIT - (suffix ? suffix.length + 1 : 0));
	const body = content.length > budget ? content.slice(0, budget) : content;
	return [body, suffix].filter(Boolean).join("\n");
}

function formatBytes(bytes: number): string {
	const mb = bytes / (1024 * 1024);
	return `${mb.toFixed(1)}MB`;
}
