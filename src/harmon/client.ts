import { EventEmitter } from "node:events";
import { Client as JsonRpcClient } from "./vendor/jsonrpc.js";
import { sha256, sign } from "./vendor/crypto.js";
import { stringToUint8Array, uint8ArrayToZ32 } from "./vendor/utils.js";
import type { HarmonIdentity } from "./identity.js";
import type {
	ClientToServerEvents,
	CurrentChannel,
	HarmonMessage,
	ServerToClientEvents
} from "./types.js";

export interface HarmonClientEvents {
	ready: [channel: CurrentChannel];
	message: [message: HarmonMessage];
	disconnected: [];
	error: [error: unknown];
}

/**
 * One authenticated Harmon WebSocket session, scoped to a single channel
 * (see PLAN.md: `sendMessage` has no channel-id argument, so a session can
 * only usefully serve the one channel it last joined). Re-runs the full
 * challenge/auth/join sequence on every reconnect, since the underlying
 * `WS` auto-reconnects the socket but not the session state.
 */
export class HarmonClient extends EventEmitter {
	private rpc?: JsonRpcClient<ClientToServerEvents, ServerToClientEvents>;

	constructor(
		private readonly wsUrl: string,
		private readonly identity: HarmonIdentity,
		private readonly channelId: string,
		private readonly profileName: string
	) {
		super();
	}

	connect() {
		const rpc = new JsonRpcClient<ClientToServerEvents, ServerToClientEvents>(this.wsUrl);
		this.rpc = rpc;

		rpc.onOpen = async () => {
			try {
				await this.authenticate();

				// join_channel requires a profile row to already exist for our
				// public key (server/src/routes/ws/channel.rs), and the only way
				// one gets created is this upsert - a fresh identity has none yet.
				await this.step("updateProfile", () => rpc.call("updateProfile", this.profileName));

				const channel = await this.step("joinChannel", () => rpc.call("joinChannel", this.channelId));
				this.emit("ready", channel);
			} catch (error) {
				this.emit("error", error);
			}
		};

		rpc.onClose = () => {
			this.emit("disconnected");
		};

		rpc.on("messageReceived", (message) => {
			this.emit("message", message);
		});
	}

	private async authenticate() {
		if (!this.rpc) throw new Error("Not connected");
		const rpc = this.rpc;

		const publicKeyZ32 = uint8ArrayToZ32(this.identity.publicKey);
		const { token: challengeToken } = await this.step("requestChallenge", () =>
			rpc.call("requestChallenge", publicKeyZ32)
		);

		// Server verifies against sha256(token bytes), not the raw token
		// (see harmon server/src/routes/ws/auth.rs confirm_challenge).
		const tokenHash = sha256(stringToUint8Array(challengeToken));
		const signature = sign(tokenHash, this.identity.privateKey);
		const { token: sessionToken } = await this.step("confirmChallenge", () =>
			rpc.call("confirmChallenge", challengeToken, uint8ArrayToZ32(signature))
		);

		await this.step("auth", () => rpc.call("auth", sessionToken));
	}

	/** Runs one RPC call, tagging any thrown error with which step produced it. */
	private async step<T>(label: string, fn: () => Promise<T>): Promise<T> {
		try {
			return await fn();
		} catch (error) {
			console.error(`[harmon] "${label}" failed:`, error);
			throw error;
		}
	}

	async sendMessage(content: string, attachmentIds: string[] = []) {
		if (!this.rpc) throw new Error("Not connected");
		await this.rpc.call("sendMessage", content, attachmentIds);
	}

	close() {
		this.rpc?.close();
	}
}

export declare interface HarmonClient {
	on<K extends keyof HarmonClientEvents>(
		event: K,
		listener: (...args: HarmonClientEvents[K]) => void
	): this;
	emit<K extends keyof HarmonClientEvents>(event: K, ...args: HarmonClientEvents[K]): boolean;
}

/** Derives the HTTP(S) base URL (for /info, /files) from the configured WS URL. */
export function deriveHttpUrl(wsUrl: string): string {
	const url = new URL(wsUrl);
	url.protocol = url.protocol === "wss:" ? "https:" : "http:";
	url.pathname = url.pathname.replace(/\/ws\/?$/, "");
	return url.href.endsWith("/") ? url.href.slice(0, -1) : url.href;
}
