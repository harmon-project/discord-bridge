# harmon-chat-bridge

Relays messages between a Discord channel and a Harmon channel. See
[PLAN.md](./PLAN.md) for the full design and current limitations.

## Setup

1. `pnpm install`
2. `cp .env.example .env` and fill in `DISCORD_TOKEN` (leave
   `HARMON_MNEMONIC` blank — it's generated on first run).
3. `cp config.example.json config.json` and fill in your Harmon server's
   WebSocket URL plus the Discord/Harmon channel id pairs to bridge.
4. Invite the Discord bot to your server with the `Manage Webhooks`,
   `Send Messages`, and `Read Message History` permissions.
5. `pnpm dev`

On first run the bridge generates a Harmon identity (ed25519 keypair from a
BIP-39 mnemonic) and writes it to `.env` — back that up, since losing it
means the bridge re-registers as a new Harmon identity.

## Status

Implemented: auth against Harmon, joining channels, text relay both
directions, Discord webhook identity mirroring for Harmon → Discord.

Not yet implemented (see PLAN.md): attachment relay, message edit/delete
(not supported by the Harmon protocol at all), reconnect backfill via
`loadMessages`.
