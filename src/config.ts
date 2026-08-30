import { readFileSync } from "node:fs";

export interface ChannelPair {
	discordChannelId: string;
	harmonChannelId: string;
}

export interface BridgeConfig {
	harmon: {
		url: string;
		profileName?: string;
	};
	channels: ChannelPair[];
}

export function loadConfig(path: string): BridgeConfig {
	const raw = readFileSync(path, "utf8");
	const config = JSON.parse(raw) as BridgeConfig;

	if (!config.harmon?.url) {
		throw new Error(`${path}: missing "harmon.url"`);
	}

	if (!Array.isArray(config.channels) || config.channels.length === 0) {
		throw new Error(`${path}: "channels" must be a non-empty array`);
	}

	for (const pair of config.channels) {
		if (!pair.discordChannelId || !pair.harmonChannelId) {
			throw new Error(
				`${path}: every entry in "channels" needs both "discordChannelId" and "harmonChannelId"`
			);
		}
	}

	return config;
}
