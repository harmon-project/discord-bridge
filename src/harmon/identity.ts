import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { generateMnemonic, keygen, mnemonicToSeed } from "./vendor/crypto.js";

export interface HarmonIdentity {
	privateKey: Uint8Array;
	publicKey: Uint8Array;
	mnemonic: string[];
}

/**
 * Loads the bridge's Harmon identity from HARMON_MNEMONIC. If it's unset,
 * generates a new one, persists it into the .env file so it survives
 * restarts, and prints it once — losing it means the bridge shows up as a
 * new Harmon identity next run.
 */
export async function loadOrCreateIdentity(envPath: string): Promise<HarmonIdentity> {
	let mnemonicStr = process.env.HARMON_MNEMONIC?.trim();

	if (!mnemonicStr) {
		const mnemonic = generateMnemonic();
		mnemonicStr = mnemonic.join(" ");
		process.env.HARMON_MNEMONIC = mnemonicStr;

		persistMnemonic(envPath, mnemonicStr);

		console.warn(
			"[harmon] Generated a new identity mnemonic and saved it to " +
				envPath +
				". Back it up — losing it means the bridge re-registers as a new Harmon identity."
		);
	}

	const mnemonic = mnemonicStr.split(/\s+/);
	const seed = await mnemonicToSeed(mnemonic);
	const { privateKey, publicKey } = keygen(seed);

	return { privateKey, publicKey, mnemonic };
}

function persistMnemonic(envPath: string, mnemonicStr: string) {
	const line = `HARMON_MNEMONIC=${mnemonicStr}`;

	if (!existsSync(envPath)) {
		writeFileSync(envPath, `${line}\n`, "utf8");
		return;
	}

	const contents = readFileSync(envPath, "utf8");

	if (/^HARMON_MNEMONIC=/m.test(contents)) {
		writeFileSync(envPath, contents.replace(/^HARMON_MNEMONIC=.*$/m, line), "utf8");
	} else {
		const withNewline = contents.endsWith("\n") ? contents : `${contents}\n`;
		writeFileSync(envPath, `${withNewline}${line}\n`, "utf8");
	}
}
