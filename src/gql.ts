import * as types from './types';
import { getTransactionData } from './arweave';
import { deriveDriveKey, driveDecrypt } from './crypto';
import Arweave from 'arweave';

const arweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Primary and Backup GraphQL endpoints
export const primaryGraphQLURL = 'https://arweave.net/graphql';
export const backupGraphQLURL = 'https://arweave.dev/graphql';

export const desktopAppName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.1.0';

// Uses GraphQl to pull necessary drive information from another user's Shared Public Drives
export async function getSharedPublicDrive(driveId: string): Promise<types.ArFSDriveMetaData> {
	const graphQLURL = primaryGraphQLURL;
	const drive: types.ArFSDriveMetaData = {
		id: 0,
		login: '',
		appName: desktopAppName,
		appVersion: appVersion,
		driveName: '',
		rootFolderId: '',
		cipher: '',
		cipherIV: '',
		unixTime: 0,
		arFS: '',
		driveId,
		driveSharing: 'shared',
		drivePrivacy: 'public',
		driveAuthMode: '',
		metaDataTxId: '0',
		metaDataSyncStatus: 0 // Drives are lazily created once the user performs an initial upload
	};
	try {
		// GraphQL Query
		const query = {
			query: `query {
      transactions(
        first: 100
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "drive" }
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		await asyncForEach(edges, async (edge: types.GQLEdgeInterface) => {
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			const { node } = edge;
			const { tags } = node;
			tags.forEach((tag: types.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					default:
						break;
				}
			});

			// We cannot add this drive if it is private
			if (drive.drivePrivacy === 'private') {
				return 'Skipped';
			}

			// Download the File's Metadata using the metadata transaction ID
			drive.metaDataTxId = node.id;
			console.log('Shared Drive Metadata tx id: ', drive.metaDataTxId);
			drive.metaDataSyncStatus = 3;
			const data = await getTransactionData(drive.metaDataTxId);
			const dataString = Utf8ArrayToStr(data);
			const dataJSON = await JSON.parse(dataString);

			// Get the drive name and root folder id
			drive.driveName = dataJSON.name;
			drive.rootFolderId = dataJSON.rootFolderId;
			return 'Found';
		});
		return drive;
	} catch (err) {
		console.log(err);
		console.log('Error getting Shared Public Drive');
		return drive;
	}
}

// Gets the root folder ID for a Public Drive
export async function getPublicDriveRootFolderTxId(driveId: string, folderId: string): Promise<string> {
	const graphQLURL = primaryGraphQLURL;
	let metaDataTxId = '0';
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Folder-Id", values: "${folderId}"}
        ]
      ) {
        edges {
          node {
            id
          }
        }
      }
    }`
		};
		const response = await arweave.api.request().post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		await asyncForEach(edges, async (edge: types.GQLEdgeInterface) => {
			const { node } = edge;
			metaDataTxId = node.id;
		});
		return metaDataTxId;
	} catch (err) {
		console.log(err);
		console.log('Error querying GQL for personal public drive root folder id, trying again.');
		metaDataTxId = await getPublicDriveRootFolderTxId(driveId, folderId);
		return metaDataTxId;
	}
}

// Gets the root folder ID for a Private Drive and includes the Cipher and IV
export async function getPrivateDriveRootFolderTxId(
	driveId: string,
	folderId: string
): Promise<types.ArFSRootFolderMetaData> {
	const graphQLURL = primaryGraphQLURL;
	let rootFolderMetaData: types.ArFSRootFolderMetaData = {
		metaDataTxId: '0',
		cipher: '',
		cipherIV: ''
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Folder-Id", values: "${folderId}"}
        ]
      ) {
        edges {
          node {
            id
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;
		await asyncForEach(edges, async (edge: types.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			rootFolderMetaData.metaDataTxId = node.id;
			tags.forEach((tag: types.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'Cipher':
						rootFolderMetaData.cipher = value;
						break;
					case 'Cipher-IV':
						rootFolderMetaData.cipherIV = value;
						break;
				}
			});
		});
		return rootFolderMetaData;
	} catch (err) {
		console.log(err);
		console.log('Error querying GQL for personal private drive root folder id, trying again.');
		rootFolderMetaData = await getPrivateDriveRootFolderTxId(driveId, folderId);
		return rootFolderMetaData;
	}
}

// Gets all of the ardrive IDs from a user's wallet
// Uses the Entity type to only search for Drive tags
export async function getAllMyPublicArDriveIds(
	login: string,
	walletPublicKey: string,
	lastBlockHeight: number
): Promise<types.ArFSDriveMetaData[]> {
	const graphQLURL = primaryGraphQLURL;
	const allPublicDrives: types.ArFSDriveMetaData[] = [];
	try {
		// Search last 5 blocks minimum
		if (lastBlockHeight > 5) {
			lastBlockHeight -= 5;
		}

		// Create the Graphql Query to search for all drives relating to the User wallet
		const query = {
			query: `query {
      			transactions(
				block: {min: ${lastBlockHeight}}
				first: 100
				owners: ["${walletPublicKey}"]
				tags: [
					{ name: "App-Name", values: ["${desktopAppName}", "${webAppName}"] }
					{ name: "Entity-Type", values: "drive" }
					{ name: "Drive-Privacy", values: "public" }]) 
				{
					edges {
						node {
							id
							tags {
								name
								value
							}
						}
					}
      			}
    		}`
		};

		// Call the Arweave Graphql Endpoint
		const response = await arweave.api.post(graphQLURL, query); // This must be updated to production when available
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		// Iterate through each returned transaction and pull out the private drive IDs
		await asyncForEach(edges, async (edge: types.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const drive: types.ArFSDriveMetaData = {
				id: 0,
				login: login,
				appName: '',
				appVersion: '',
				driveName: '',
				rootFolderId: '',
				cipher: '',
				cipherIV: '',
				unixTime: 0,
				arFS: '',
				driveId: '',
				driveSharing: 'personal',
				drivePrivacy: 'public',
				driveAuthMode: '',
				metaDataTxId: '',
				metaDataSyncStatus: 3,
				isLocal: 0
			};
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			tags.forEach((tag: types.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					default:
						break;
				}
			});

			// Capture the TX of the public drive metadata tx
			drive.metaDataTxId = node.id;

			// Download the File's Metadata using the metadata transaction ID
			const data = await getTransactionData(drive.metaDataTxId);
			const dataString = Utf8ArrayToStr(data);
			const dataJSON = await JSON.parse(dataString);

			// Get the drive name and root folder id
			drive.driveName = dataJSON.name;
			drive.rootFolderId = dataJSON.rootFolderId;
			allPublicDrives.push(drive);
			return 'Added';
		});
		return allPublicDrives;
	} catch (err) {
		console.log(err);
		console.log('Error getting all public drives');
		return allPublicDrives;
	}
}

// Gets all of the private ardrive IDs from a user's wallet, using the Entity type to only search for Drive tags
// Only returns Private drives from graphql
export async function getAllMyPrivateArDriveIds(
	user: types.ArDriveUser,
	lastBlockHeight: number
): Promise<types.ArFSDriveMetaData[]> {
	const graphQLURL = primaryGraphQLURL;
	const allPrivateDrives: types.ArFSDriveMetaData[] = [];

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}

	const query = {
		query: `query {
    transactions(
      block: {min: ${lastBlockHeight}}
      first: 100
      owners: ["${user.walletPublicKey}"]
      tags: [
        { name: "Entity-Type", values: "drive" }
        { name: "Drive-Privacy", values: "private" }
      ]
    ) {
      edges {
        node {
          id
          tags {
            name
            value
          }
        }
      }
    }
  }`
	};

	// Call the Arweave Graphql Endpoint
	let response;
	try {
		response = await arweave.api.post(graphQLURL, query);
	} catch (err) {
		return allPrivateDrives;
	}

	const { data } = response.data;
	const { transactions } = data;
	const { edges } = transactions;

	// Iterate through each returned transaction and pull out the private drive IDs
	await asyncForEach(edges, async (edge: types.GQLEdgeInterface) => {
		const { node } = edge;
		const { tags } = node;
		const drive: types.ArFSDriveMetaData = {
			id: 0,
			login: user.login,
			appName: '',
			appVersion: '',
			driveName: '',
			rootFolderId: '',
			cipher: '',
			cipherIV: '',
			unixTime: 0,
			arFS: '',
			driveId: '',
			driveSharing: 'personal',
			drivePrivacy: '',
			driveAuthMode: '',
			metaDataTxId: '',
			metaDataSyncStatus: 3,
			isLocal: 0
		};
		// Iterate through each tag and pull out each drive ID as well the drives privacy status
		tags.forEach((tag: types.GQLTagInterface) => {
			const key = tag.name;
			const { value } = tag;
			switch (key) {
				case 'App-Name':
					drive.appName = value;
					break;
				case 'App-Version':
					drive.appVersion = value;
					break;
				case 'Unix-Time':
					drive.unixTime = +value;
					break;
				case 'Drive-Id':
					drive.driveId = value;
					break;
				case 'ArFS':
					drive.arFS = value;
					break;
				case 'Drive-Privacy':
					drive.drivePrivacy = value;
					break;
				case 'Drive-Auth-Mode':
					drive.driveAuthMode = value;
					break;
				case 'Cipher':
					drive.cipher = value;
					break;
				case 'Cipher-IV':
					drive.cipherIV = value;
					break;
				default:
					break;
			}
		});
		try {
			// Capture the TX of the public drive metadata tx
			drive.metaDataTxId = node.id;

			// Download the File's Metadata using the metadata transaction ID
			const data = await getTransactionData(drive.metaDataTxId);
			const dataBuffer = Buffer.from(data);
			// Since this is a private drive, we must decrypt the JSON data
			const driveKey: Buffer = await deriveDriveKey(user.dataProtectionKey, drive.driveId, user.walletPrivateKey);
			const decryptedDriveBuffer: Buffer = await driveDecrypt(drive.cipherIV, driveKey, dataBuffer);
			const decryptedDriveString: string = Utf8ArrayToStr(decryptedDriveBuffer);
			const decryptedDriveJSON = await JSON.parse(decryptedDriveString);

			// Get the drive name and root folder id
			drive.driveName = decryptedDriveJSON.name;
			drive.rootFolderId = decryptedDriveJSON.rootFolderId;
			allPrivateDrives.push(drive);
		} catch (err) {
			console.log('Error: ', err);
			console.log('Password not valid for this private drive TX %s | ID %s', node.id, drive.driveId);
			drive.driveName = 'Invalid Drive Password';
			drive.rootFolderId = '';
			allPrivateDrives.push(drive);
		}
	});
	return allPrivateDrives;
}

// Gets all of the transactions from a user's wallet, filtered by owner and drive ID
// CHANGE TO RETURN ARFSFILEMETADATA
export async function getAllMyDataFileTxs(
	walletPublicKey: string,
	driveId: string,
	lastBlockHeight: number
): Promise<types.GQLEdgeInterface[]> {
	let hasNextPage = true;
	let cursor = '';
	let edges: types.GQLEdgeInterface[] = [];
	let graphQLURL = primaryGraphQLURL;
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}

	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        owners: ["${walletPublicKey}"]
        tags: [
          { name: "App-Name", values: ["${desktopAppName}", "${webAppName}"]}
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: ["file", "folder"]}
        ]
        first: 100
        after: "${cursor}"
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    }`
		};

		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			if (transactions.edges && transactions.edges.length) {
				edges = edges.concat(transactions.edges);
				cursor = transactions.edges[transactions.edges.length - 1].cursor;
			}
			hasNextPage = transactions.pageInfo.hasNextPage;
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for personal data transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				tries = 0;
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, switching to primary.');
					graphQLURL = primaryGraphQLURL; // Set back to primary and try 5 times
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
				}
			}
		}
	}
	return edges;
}

// Gets all of the transactions from a user's wallet, filtered by owner and drive ID.
export async function getAllMySharedDataFileTxs(
	driveId: string,
	lastBlockHeight: number
): Promise<types.GQLEdgeInterface[]> {
	let hasNextPage = true;
	let cursor = '';
	let edges: types.GQLEdgeInterface[] = [];
	let graphQLURL = primaryGraphQLURL;
	let tries = 0;

	// Search last 5 blocks minimum
	if (lastBlockHeight > 5) {
		lastBlockHeight -= 5;
	}

	while (hasNextPage) {
		const query = {
			query: `query {
      transactions(
        block: {min: ${lastBlockHeight}}
        tags: [
          { name: "App-Name", values: ["${desktopAppName}", "${webAppName}"]}
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: ["file", "folder"]}
        ]
        first: 100
        after: "${cursor}"
      ) {
        pageInfo {
          hasNextPage
        }
        edges {
          cursor
          node {
            id
            block {
              timestamp
              height
            }
            tags {
              name
              value
            }
          }
        }
      }
    		}`
		};

		// Call the Arweave gateway
		try {
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			if (transactions.edges && transactions.edges.length) {
				edges = edges.concat(transactions.edges);
				cursor = transactions.edges[transactions.edges.length - 1].cursor;
			}
			hasNextPage = transactions.pageInfo.hasNextPage;
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for personal data transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				tries = 0;
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, switching to primary.');
					graphQLURL = primaryGraphQLURL; // Set back to primary and try 5 times
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
				}
			}
		}
	}
	return edges;
}

// Gets the CipherIV tag of a private data transaction
export async function getPrivateTransactionCipherIV(txid: string): Promise<string> {
	let graphQLURL = primaryGraphQLURL;
	let tries = 0;
	let dataCipherIV = '';
	const query = {
		query: `query {
      transactions(ids: ["${txid}"]) {
      edges {
        node {
          id
          tags {
            name
            value
          }
        }
      }
    }
  }`
	};
	// We will only attempt this 10 times
	while (tries < 10) {
		try {
			// Call the Arweave Graphql Endpoint
			const response = await arweave.api.request().post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			const { node } = edges[0];
			const { tags } = node;
			tags.forEach((tag: types.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'Cipher-IV':
						dataCipherIV = value;
						break;
					default:
						break;
				}
			});
			return dataCipherIV;
		} catch (err) {
			console.log(err);
			console.log('Error getting private transaction cipherIV for txid %s, trying again', txid);
			if (tries < 5) {
				tries += 1;
			} else {
				tries += 1;
				console.log('Primary gateway is having issues, switching to backup and trying again');
				graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
			}
		}
	}
	return 'Error';
}

// Asyncronous ForEach function
async function asyncForEach(array: any[], callback: any): Promise<string> {
	for (let index = 0; index < array.length; index += 1) {
		// eslint-disable-next-line no-await-in-loop
		await callback(array[index], index, array);
	}
	return 'Done';
}

// Converts a UTF8Array to a string
function Utf8ArrayToStr(array: any): string {
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
