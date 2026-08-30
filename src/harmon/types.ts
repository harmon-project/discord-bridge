// Domain + RPC types, transcribed from harmon-project/harmon lib/src/index.svelte.ts
// (the type declarations there have no Svelte dependency).

export interface Channel {
	id: string;
	name: string;
	type?: "Text" | "Voice";
}

export interface Profile {
	name: string;
	public_key: string;
}

export interface MessageAttachment {
	id: string;
	name: string;
	mime_type: string;
	size: number;
	hash: string;
}

export interface HarmonMessage {
	id: string;
	profile: Profile;
	content: string;
	attachments: MessageAttachment[];
	created_at: string;
}

export interface ChannelMember {
	profile: Profile;
	socket_id: string;
}

export interface CurrentChannel {
	channel: Channel;
	members: ChannelMember[];
}

export interface ServerInfo {
	title: string;
	public_key: string;
}

export interface ResponseAuthChallenge {
	token: string;
}

export interface AuthenticatedPayload {
	public_key: string;
	is_admin: boolean;
	exp: number;
}

export interface ResponseConfirmAuthChallenge {
	token: string;
	payload: AuthenticatedPayload;
}

export type WebRTCEvent =
	| {
			type: "answer" | "offer" | "pranswer" | "rollback";
			sdp?: string;
	  }
	| {
			type: "candidate";
			candidate?: string;
			sdpMLineIndex?: number | null;
			sdpMid?: string | null;
			usernameFragment?: string | null;
	  };

export interface ServerToClientEvents {
	connectionReady(id: string): void;
	messageReceived(message: HarmonMessage): void;
	onChannelMemberJoined(member: ChannelMember): void;
	onChannelMemberLeft(member: ChannelMember): void;
	channelDeleted(channel: Channel): void;
	webrtcEvent(socket_id: string, event: WebRTCEvent): void;
}

export interface ClientToServerEvents {
	auth(token: string): AuthenticatedPayload;
	requestChallenge(publicKey: string): ResponseAuthChallenge;
	confirmChallenge(token: string, signature: string): ResponseConfirmAuthChallenge;

	joinChannel(channelId: string): CurrentChannel;
	sendMessage(message: string, attachments: string[]): void;
	loadMessages(beforeId?: string): HarmonMessage[];

	createChannel(name: string): Channel;
	deleteChannel(channelId: string): Channel;
	listChannels(): Channel[];

	updateProfile(name: string): Profile;
	getProfile(public_key?: string): Profile | undefined;

	sendWebRTCEvent(socketId: string, event: WebRTCEvent): void;
}
