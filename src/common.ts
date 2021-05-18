// index.js
import * as mime from 'mime-types';
export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';
export const gatewayURL = 'https://arweave.net/';
//export const gatewayURL = 'https://arweave.dev/';

export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.1.0';
export const arFSVersion = '0.11';
export const cipher = 'AES256-GCM';

// Asyncronous ForEach function
export async function asyncForEach(array: any[], callback: any): Promise<string> {
	for (let index = 0; index < array.length; index += 1) {
		// eslint-disable-next-line no-await-in-loop
		await callback(array[index], index, array);
	}
	return 'Done';
}

export function extToMime(fullPath: string): string {
	let extension = fullPath.substring(fullPath.lastIndexOf('.') + 1);
	extension = extension.toLowerCase();
	const m = mime.lookup(extension);
	return m === false ? 'unknown' : m;
}

export async function Utf8ArrayToStr(array: any): Promise<string> {
	let out, i, c;
	let char2, char3;

	out = '';
	const len = array.length;
	i = 0;
	while (i < len) {
		c = array[i++];
		switch (c >> 4) {
			case 0:
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
			case 6:
			case 7:
				// 0xxxxxxx
				out += String.fromCharCode(c);
				break;
			case 12:
			case 13:
				// 110x xxxx   10xx xxxx
				char2 = array[i++];
				out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
				break;
			case 14:
				// 1110 xxxx  10xx xxxx  10xx xxxx
				char2 = array[i++];
				char3 = array[i++];
				out += String.fromCharCode(((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0));
				break;
		}
	}
	return out;
}

// Used by the selectWeightedRanom function to determine who receives a tip
export function weightedRandom(dict: Record<string, number>): string | undefined {
	let sum = 0;
	const r = Math.random();

	for (const addr of Object.keys(dict)) {
		sum += dict[addr];
		if (r <= sum && dict[addr] > 0) {
			return addr;
		}
	}
	return;
}
