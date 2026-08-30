// Adapted from harmon-project/harmon lib/src/http.ts (0BSD).
// The original `postFiles` takes a browser `FileList`; Node has no such
// type, so it's replaced with a plain array of in-memory files. Everything
// else (getInfo, getFile) is unchanged.
export interface GetInfoResponse {
	title: string;
	public_key: string;
}

export interface HarmonFile {
	id: string;
	name: string;
	mime_type: string;
	size: number;
	hash: string;
}

export interface UploadableFile {
	name: string;
	mimeType: string;
	data: Buffer | Uint8Array;
}

export async function getInfo(url: string): Promise<GetInfoResponse> {
	const response = await fetch(`${url}/info`, {
		method: "GET",
		headers: { "Content-Type": "application/json" }
	});

	return response.json();
}

export async function postFiles(url: string, files: UploadableFile[]): Promise<HarmonFile[]> {
	const formData = new FormData();

	for (const file of files) {
		const blob = new Blob([new Uint8Array(file.data)], { type: file.mimeType });
		formData.append(file.name, blob, file.name);
	}

	const response = await fetch(`${url}/files`, {
		method: "POST",
		body: formData
	});

	return response.json();
}

export async function getFile(url: string, id: string): Promise<Blob> {
	const response = await fetch(`${url}/files/${id}`, {
		method: "GET"
	});

	return response.blob();
}
