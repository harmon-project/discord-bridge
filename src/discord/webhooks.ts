import type { TextChannel, Webhook } from "discord.js";

const WEBHOOK_NAME = "harmon-bridge";

/**
 * Reuses an existing "harmon-bridge" webhook on the channel if one exists,
 * otherwise creates it. Requires the "Manage Webhooks" permission.
 */
export async function getOrCreateWebhook(channel: TextChannel): Promise<Webhook> {
	const webhooks = await channel.fetchWebhooks();
	const existing = webhooks.find((webhook) => webhook.name === WEBHOOK_NAME);
	if (existing) return existing;

	return channel.createWebhook({
		name: WEBHOOK_NAME,
		reason: "Harmon <-> Discord chat bridge"
	});
}
