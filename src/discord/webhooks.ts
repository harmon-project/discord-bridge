import type { TextChannel, Webhook } from "discord.js";

/**
 * Reuses an existing webhook with the given name on the channel if one
 * exists, otherwise creates it. Requires the "Manage Webhooks" permission.
 */
export async function getOrCreateWebhook(
	channel: TextChannel,
	webhookName: string,
): Promise<Webhook> {
	const webhooks = await channel.fetchWebhooks();
	const existing = webhooks.find((webhook) => webhook.name === webhookName);
	if (existing) return existing;

	return channel.createWebhook({
		name: webhookName,
		reason: "Harmon <-> Discord chat bridge",
	});
}
