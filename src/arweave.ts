// arweave.js
import * as fs from 'fs';
import { JWKInterface } from 'arweave/node/lib/wallet';
import {
	appName,
	appVersion,
	asyncForEach,
	arFSVersion,
	Utf8ArrayToStr,
	webAppName,
	graphQLURL,
	weightedRandom
} from './common';
import {
	ArDriveUser,
	ArFSDriveMetaData,
	ArFSEncryptedData,
	ArFSFileMetaData,
	ArFSRootFolderMetaData,
	GQLEdgeInterface,
	GQLTagInterface,
	Wallet
} from './types';
import {
	updateFileMetaDataSyncStatus,
	updateFileDataSyncStatus,
	setFileUploaderObject,
	updateDriveInDriveTable,
	addToBundleTable,
	setBundleUploaderObject
} from './db_update';
import { getDriveFromDriveTable } from './db_get';
import { generateMnemonic, getKeyFromMnemonic } from 'arweave-mnemonic-keys';
import { readContract } from 'smartweave';
import Arweave from 'arweave';
import deepHash from 'arweave/node/lib/deepHash';
import ArweaveBundles from 'arweave-bundles';
import { DataItemJson } from 'arweave-bundles';
import { deriveDriveKey, driveDecrypt, driveEncrypt, fileEncrypt } from './crypto';

// ArDrive Profit Sharing Community Smart Contract
const communityTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';

const arweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Initialize the arweave-bundles API
const deps = {
	utils: Arweave.utils,
	crypto: Arweave.crypto,
	deepHash: deepHash
};
const arBundles = ArweaveBundles(deps);

// Gets a public key for a given JWK
const getAddressForWallet = async (walletPrivateKey: JWKInterface): Promise<string> => {
	return arweave.wallets.jwkToAddress(walletPrivateKey);
};

// Creates a new Arweave wallet JWK comprised of a private key and public key
const generateWallet = async (): Promise<Wallet> => {
	const walletPrivateKey = await arweave.wallets.generate();
	const walletPublicKey = await getAddressForWallet(walletPrivateKey);
	return { walletPrivateKey, walletPublicKey };
};

// Creates a new Arweave wallet JWK using the Arweave Mnemonics package
export async function generateMnemonicWallet(): Promise<Wallet> {
	const mnemonic: string = await generateMnemonic();
	console.log('Your Arweave Wallet Mnemonic is a 12 word representation of your key file.');
	console.log('Please write this down and keep it safe.  If needed, it can be used to recover this Arweave Wallet');
	const walletPrivateKey = await getKeyFromMnemonic(mnemonic);
	const walletPublicKey = await getAddressForWallet(walletPrivateKey);
	return { walletPrivateKey, walletPublicKey };
}

// Imports an existing wallet as a JWK from a user's local harddrive
const getLocalWallet = async (
	existingWalletPath: string
): Promise<{ walletPrivateKey: JWKInterface; walletPublicKey: string }> => {
	const walletPrivateKey: JWKInterface = JSON.parse(fs.readFileSync(existingWalletPath).toString());
	const walletPublicKey = await getAddressForWallet(walletPrivateKey);
	return { walletPrivateKey, walletPublicKey };
};

// Uses GraphQl to pull necessary drive information from another user's Shared Public Drives
const getSharedPublicDrive = async (driveId: string): Promise<ArFSDriveMetaData> => {
	const drive: ArFSDriveMetaData = {
		id: 0,
		login: '',
		appName: appName,
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
		await asyncForEach(edges, async (edge: GQLEdgeInterface) => {
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			const { node } = edge;
			const { tags } = node;
			tags.forEach((tag: GQLTagInterface) => {
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
			const dataString = await Utf8ArrayToStr(data);
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
};

// Gets the root folder ID for a Public Drive
const getPublicDriveRootFolderTxId = async (driveId: string, folderId: string): Promise<string> => {
	let metaDataTxId = '0';
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "ArFS", values: "${arFSVersion}" }
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
		await asyncForEach(edges, async (edge: GQLEdgeInterface) => {
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
};

// Gets the root folder ID for a Private Drive and includes the Cipher and IV
const getPrivateDriveRootFolderTxId = async (driveId: string, folderId: string): Promise<ArFSRootFolderMetaData> => {
	let rootFolderMetaData: ArFSRootFolderMetaData = {
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
          { name: "ArFS", values: "${arFSVersion}" }
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
		await asyncForEach(edges, async (edge: GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			rootFolderMetaData.metaDataTxId = node.id;
			tags.forEach((tag: GQLTagInterface) => {
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
};

// Gets all of the ardrive IDs from a user's wallet
// Uses the Entity type to only search for Drive tags
const getAllMyPublicArDriveIds = async (
	login: string,
	walletPublicKey: string,
	lastBlockHeight: number
): Promise<ArFSDriveMetaData[]> => {
	const allPublicDrives: ArFSDriveMetaData[] = [];
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
          { name: "App-Name", values: ["${appName}", "${webAppName}"] }
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

		// Call the Arweave Graphql Endpoint
		const response = await arweave.api.post(graphQLURL, query); // This must be updated to production when available
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		// Iterate through each returned transaction and pull out the private drive IDs
		await asyncForEach(edges, async (edge: GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const drive: ArFSDriveMetaData = {
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
				metaDataSyncStatus: 3
			};
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			tags.forEach((tag: GQLTagInterface) => {
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

			// If this is a Private Drive, we drop it
			// If this drive is already present in the Database, we drop it
			const exists: ArFSDriveMetaData = await getDriveFromDriveTable(drive.driveId);
			if (drive.drivePrivacy === 'private' || exists !== undefined) {
				return 'Skip';
			}

			// Capture the TX of the public drive metadata tx
			drive.metaDataTxId = node.id;

			// Download the File's Metadata using the metadata transaction ID
			const data = await getTransactionData(drive.metaDataTxId);
			const dataString = await Utf8ArrayToStr(data);
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
};

// Gets all of the private ardrive IDs from a user's wallet, using the Entity type to only search for Drive tags
// Only returns Private drives from graphql
const getAllMyPrivateArDriveIds = async (user: ArDriveUser, lastBlockHeight: number): Promise<ArFSDriveMetaData[]> => {
	const allPrivateDrives: ArFSDriveMetaData[] = [];

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
        { name: "ArFS", values: "${arFSVersion}" }
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
	await asyncForEach(edges, async (edge: GQLEdgeInterface) => {
		const { node } = edge;
		const { tags } = node;
		const drive: ArFSDriveMetaData = {
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
			metaDataSyncStatus: 3
		};
		// Iterate through each tag and pull out each drive ID as well the drives privacy status
		tags.forEach((tag: GQLTagInterface) => {
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
			const decryptedDriveString: string = await Utf8ArrayToStr(decryptedDriveBuffer);
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
};

// Gets all of the transactions from a user's wallet, filtered by owner and drive ID
const getAllMyDataFileTxs = async (
	walletPublicKey: string,
	driveId: string,
	lastBlockHeight: number
): Promise<GQLEdgeInterface[]> => {
	let hasNextPage = true;
	let cursor = '';
	let edges: GQLEdgeInterface[] = [];
	let primaryGraphQLURL = graphQLURL;
	const backupGraphQLURL = graphQLURL.replace('.net', '.dev');
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
          { name: "App-Name", values: ["${appName}", "${webAppName}"]}
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
			const response = await arweave.api.post(primaryGraphQLURL, query);
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
				if (primaryGraphQLURL.includes('.dev')) {
					console.log('Backup gateway is having issues, switching to primary.');
					primaryGraphQLURL = graphQLURL; // Set back to primary and try 5 times
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					primaryGraphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
				}
			}
		}
	}
	return edges;
};

// Gets all of the transactions from a user's wallet, filtered by owner and drive ID.
const getAllMySharedDataFileTxs = async (driveId: string, lastBlockHeight: number): Promise<GQLEdgeInterface[]> => {
	let hasNextPage = true;
	let cursor = '';
	let edges: GQLEdgeInterface[] = [];
	let primaryGraphQLURL = graphQLURL;
	const backupGraphQLURL = graphQLURL.replace('.net', '.dev');
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
          { name: "App-Name", values: ["${appName}", "${webAppName}"]}
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
			const response = await arweave.api.post(primaryGraphQLURL, query);
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
				if (primaryGraphQLURL.includes('.dev')) {
					console.log('Backup gateway is having issues, switching to primary.');
					primaryGraphQLURL = graphQLURL; // Set back to primary and try 5 times
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					primaryGraphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
				}
			}
		}
	}
	return edges;
};

// Gets the CipherIV tag of a private data transaction
const getPrivateTransactionCipherIV = async (txid: string): Promise<string> => {
	let primaryGraphQLURL = graphQLURL;
	const backupGraphQLURL = graphQLURL.replace('.net', '.dev');
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
			const response = await arweave.api.request().post(primaryGraphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			const { node } = edges[0];
			const { tags } = node;
			tags.forEach((tag: GQLTagInterface) => {
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
				primaryGraphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
			}
		}
	}
	return 'Error';
};

// Gets only the data of a given ArDrive Data transaction (U8IntArray)
const getTransactionData = async (txid: string): Promise<any> => {
	try {
		const data = await arweave.transactions.getData(txid, { decode: true });
		return data;
	} catch (err) {
		console.log('Error getting transaction data for Txid %s', txid);
		console.log(err);
		return Promise.reject(err);
	}
};

// Get the latest status of a transaction
const getTransactionStatus = async (txid: string): Promise<number> => {
	try {
		const response = await arweave.transactions.getStatus(txid);
		return response.status;
	} catch (err) {
		// console.log(err);
		return 0;
	}
};

// Get the balance of an Arweave wallet
const getWalletBalance = async (walletPublicKey: string): Promise<number> => {
	try {
		let balance = await arweave.wallets.getBalance(walletPublicKey);
		balance = await arweave.ar.winstonToAr(balance);
		return +balance;
	} catch (err) {
		console.log(err);
		return 0;
	}
};

// Get the latest block height
const getLatestBlockHeight = async (): Promise<number> => {
	try {
		const info = await arweave.network.getInfo();
		return info.height;
	} catch (err) {
		console.log('Failed getting latest block height');
		return 0;
	}
};

// Creates an arweave transaction to upload public ardrive metadata
const createPublicDriveTransaction = async (walletPrivateKey: string, drive: ArFSDriveMetaData): Promise<string> => {
	try {
		// Create a JSON file, containing necessary drive metadata
		const arDriveMetadataJSON = {
			name: drive.driveName,
			rootFolderId: drive.rootFolderId
		};
		const arDriveMetaData = JSON.stringify(arDriveMetadataJSON);

		// Create transaction
		console.log('Creating a new Public Drive (name: %s) on the Permaweb', drive.driveName);
		const transaction = await arweave.createTransaction({ data: arDriveMetaData }, JSON.parse(walletPrivateKey));

		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Unix-Time', drive.unixTime.toString());
		transaction.addTag('Content-Type', 'application/json');
		transaction.addTag('ArFS', arFSVersion);
		transaction.addTag('Entity-Type', 'drive');
		transaction.addTag('Drive-Id', drive.driveId);
		transaction.addTag('Drive-Privacy', 'public');

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
		const uploader = await arweave.transactions.getUploader(transaction);

		// Update the Profile table to include the default /Public/ ArDrive
		await updateDriveInDriveTable(transaction.id, drive.cipher, drive.cipherIV, drive.driveId);

		while (!uploader.isComplete) {
			// eslint-disable-next-line no-await-in-loop
			await uploader.uploadChunk();
		}
		console.log('SUCCESS Public Drive was submitted with TX %s', transaction.id);
		return 'Success';
	} catch (err) {
		console.log(err);
		return 'Error';
	}
};

// Creates an arweave transaction to upload encrypted private ardrive metadata
const createPrivateDriveTransaction = async (
	driveKey: Buffer,
	walletPrivateKey: string,
	drive: ArFSDriveMetaData
): Promise<string> => {
	try {
		// Create a JSON file, containing necessary drive metadata
		const driveMetadataJSON = {
			name: drive.driveName,
			rootFolderId: drive.rootFolderId
		};

		// Turn the JSON into a string, and then encrypt it
		const driveMetaData: Buffer = Buffer.from(JSON.stringify(driveMetadataJSON));
		const encryptedDriveMetaData: ArFSEncryptedData = await driveEncrypt(driveKey, driveMetaData);

		// Create transaction
		console.log('Creating a new Private Drive (name: %s) on the Permaweb', drive.driveName);
		const transaction = await arweave.createTransaction(
			{ data: encryptedDriveMetaData.data },
			JSON.parse(walletPrivateKey)
		);

		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Unix-Time', drive.unixTime.toString());
		transaction.addTag('Content-Type', 'application/octet-stream');
		transaction.addTag('ArFS', arFSVersion);
		transaction.addTag('Entity-Type', 'drive');
		transaction.addTag('Drive-Id', drive.driveId);
		transaction.addTag('Drive-Privacy', drive.drivePrivacy);
		transaction.addTag('Drive-Auth-Mode', drive.driveAuthMode);
		transaction.addTag('Cipher', encryptedDriveMetaData.cipher);
		transaction.addTag('Cipher-IV', encryptedDriveMetaData.cipherIV);

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
		const uploader = await arweave.transactions.getUploader(transaction);

		// Update the Drive table to include this transaction information
		await updateDriveInDriveTable(
			transaction.id,
			encryptedDriveMetaData.cipher,
			encryptedDriveMetaData.cipherIV,
			drive.driveId
		);

		while (!uploader.isComplete) {
			// eslint-disable-next-line no-await-in-loop
			await uploader.uploadChunk();
		}
		console.log('SUCCESS Private Drive was submitted with TX %s', transaction.id);
		return 'Success';
	} catch (err) {
		console.log(err);
		return 'Error';
	}
};

// Creates an arweave transaction to upload file data (and no metadata) to arweave
// Saves the upload chunk of the object in case the upload has to be restarted
const createArDrivePublicDataTransaction = async (
	walletPrivateKey: string,
	filePath: string,
	contentType: string,
	id: number
): Promise<string> => {
	try {
		const fileToUpload = fs.readFileSync(filePath);
		const transaction = await arweave.createTransaction(
			{ data: fileToUpload }, // How to replace this?
			JSON.parse(walletPrivateKey)
		);
		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Content-Type', contentType);

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
		const uploader = await arweave.transactions.getUploader(transaction);
		await setFileUploaderObject(JSON.stringify(uploader), id);
		const fileToUpdate = {
			fileDataSyncStatus: 2,
			dataTxId: transaction.id,
			dataCipherIV: '',
			cipher: '',
			id
		};
		// Update the queue since the file is now being uploaded
		await updateFileDataSyncStatus(fileToUpdate);
		while (!uploader.isComplete) {
			// eslint-disable-next-line no-await-in-loop
			await uploader.uploadChunk();
			await setFileUploaderObject(JSON.stringify(uploader), id);
			console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
		}
		console.log('SUCCESS %s was submitted with TX %s', filePath, transaction.id);
		return transaction.id;
	} catch (err) {
		console.log(err);
		return 'Transaction failed';
	}
};

// Creates an arweave transaction to upload only file metadata to arweave
const createArDrivePublicMetaDataTransaction = async (
	walletPrivateKey: string,
	fileToUpload: ArFSFileMetaData,
	secondaryFileMetaDataJSON: string
): Promise<string> => {
	try {
		const transaction = await arweave.createTransaction(
			{ data: secondaryFileMetaDataJSON },
			JSON.parse(walletPrivateKey)
		);

		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Unix-Time', fileToUpload.unixTime.toString());
		transaction.addTag('Content-Type', 'application/json');
		transaction.addTag('ArFS', arFSVersion);
		transaction.addTag('Entity-Type', fileToUpload.entityType);
		transaction.addTag('Drive-Id', fileToUpload.driveId);
		if (fileToUpload.entityType === 'file') {
			transaction.addTag('File-Id', fileToUpload.fileId);
			transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
		} else {
			transaction.addTag('Folder-Id', fileToUpload.fileId);
			if (fileToUpload.parentFolderId !== '0') {
				transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
			}
		}

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
		const uploader = await arweave.transactions.getUploader(transaction);
		const fileMetaDataToUpdate = {
			id: fileToUpload.id,
			fileMetaDataSyncStatus: 2,
			metaDataCipherIV: '',
			cipher: '',
			metaDataTxId: transaction.id
		};
		// Update the queue since the file metadata is now being uploaded
		await updateFileMetaDataSyncStatus(fileMetaDataToUpdate);
		while (!uploader.isComplete) {
			// eslint-disable-next-line no-await-in-loop
			await uploader.uploadChunk();
		}
		console.log('SUCCESS %s metadata was submitted with TX %s', fileToUpload.filePath, transaction.id);
		return transaction.id;
	} catch (err) {
		console.log(err);
		return 'Transaction failed';
	}
};

// Creates a bundled data transaction
const createArDriveBundledDataTransaction = async (
	items: DataItemJson[],
	walletPrivateKey: string,
	login: string
): Promise<string> => {
	try {
		// Bundle up all individual items into a single data bundle
		const dataBundle = await arBundles.bundleData(items);
		const dataBuffer: Buffer = Buffer.from(JSON.stringify(dataBundle));

		// Create the transaction for the entire data bundle
		const transaction = await arweave.createTransaction({ data: dataBuffer }, JSON.parse(walletPrivateKey));

		// Tag file
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Bundle-Format', 'json');
		transaction.addTag('Bundle-Version', '1.0.0');
		transaction.addTag('Content-Type', 'application/json');

		// Sign the bundle
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
		const uploader = await arweave.transactions.getUploader(transaction);

		const currentTime = Math.round(Date.now() / 1000);
		await addToBundleTable(login, transaction.id, 2, currentTime);
		while (!uploader.isComplete) {
			// eslint-disable-next-line no-await-in-loop
			await uploader.uploadChunk();
			await setBundleUploaderObject(JSON.stringify(uploader), transaction.id);
			console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
		}
		console.log('SUCCESS data bundle was submitted with TX %s', transaction.id);
		return transaction.id;
	} catch (err) {
		console.log('Error sending data bundle');
		console.log(err);
		return 'Error';
	}
};

// Creates an arweave data item transaction (ANS-102) to upload file data (and no metadata) to arweave
const createArDrivePublicDataItemTransaction = async (
	walletPrivateKey: string,
	filePath: string,
	contentType: string,
	id: number
): Promise<DataItemJson | null> => {
	try {
		const fileToUpload = fs.readFileSync(filePath);
		const item = await arBundles.createData(
			{ data: fileToUpload }, // How to replace this?
			JSON.parse(walletPrivateKey)
		);

		// Tag file
		arBundles.addTag(item, 'App-Name', appName);
		arBundles.addTag(item, 'App-Version', appVersion);
		arBundles.addTag(item, 'Content-Type', contentType);

		// Sign the data, ready to be added to a bundle
		const dataItem = await arBundles.sign(item, JSON.parse(walletPrivateKey));

		const fileToUpdate = {
			fileDataSyncStatus: 2,
			dataTxId: item.id,
			dataCipherIV: '',
			cipher: '',
			id
		};
		// Update the queue since the file is now being uploaded
		await updateFileDataSyncStatus(fileToUpdate);
		console.log('SUCCESS %s public data item was created with TX %s', filePath, item.id);
		return dataItem;
	} catch (err) {
		console.log('Error creating public data item');
		console.log(err);
		return null;
	}
};

// Creates an arweave data item transaction (ANS-102) to upload only file metadata to arweave
const createArDrivePublicMetaDataItemTransaction = async (
	walletPrivateKey: string,
	fileToUpload: ArFSFileMetaData,
	secondaryFileMetaDataJSON: string
): Promise<DataItemJson | null> => {
	try {
		const item = await arBundles.createData({ data: secondaryFileMetaDataJSON }, JSON.parse(walletPrivateKey));

		// Tag file
		arBundles.addTag(item, 'App-Name', appName);
		arBundles.addTag(item, 'App-Version', appVersion);
		arBundles.addTag(item, 'Unix-Time', fileToUpload.unixTime.toString());
		arBundles.addTag(item, 'Content-Type', 'application/json');
		arBundles.addTag(item, 'ArFS', arFSVersion);
		arBundles.addTag(item, 'Entity-Type', fileToUpload.entityType);
		arBundles.addTag(item, 'Drive-Id', fileToUpload.driveId);
		if (fileToUpload.entityType === 'file') {
			arBundles.addTag(item, 'File-Id', fileToUpload.fileId);
			arBundles.addTag(item, 'Parent-Folder-Id', fileToUpload.parentFolderId);
		} else {
			arBundles.addTag(item, 'Folder-Id', fileToUpload.fileId);
			if (fileToUpload.parentFolderId !== '0') {
				arBundles.addTag(item, 'Parent-Folder-Id', fileToUpload.parentFolderId);
			}
		}

		// Sign file
		const dataItem = await arBundles.sign(item, JSON.parse(walletPrivateKey));
		const fileMetaDataToUpdate = {
			id: fileToUpload.id,
			fileMetaDataSyncStatus: 2,
			metaDataCipherIV: '',
			cipher: '',
			metaDataTxId: dataItem.id
		};
		// Update the queue since the file metadata is now being uploaded
		await updateFileMetaDataSyncStatus(fileMetaDataToUpdate);
		console.log('SUCCESS %s public metadata item was created with TX %s', fileToUpload.filePath, dataItem.id);
		return dataItem;
	} catch (err) {
		console.log('Error creating private data item');
		console.log(err);
		return null;
	}
};

// Creates an arweave data item transaction (ANS-102) to encrypt and upload file data (and no metadata) to arweave
const createArDrivePrivateDataItemTransaction = async (
	fileKey: Buffer,
	fileToUpload: ArFSFileMetaData,
	walletPrivateKey: string
): Promise<DataItemJson | null> => {
	try {
		const data = fs.readFileSync(fileToUpload.filePath);
		const encryptedData: ArFSEncryptedData = await fileEncrypt(fileKey, data);
		const item = await arBundles.createData({ data: encryptedData.data }, JSON.parse(walletPrivateKey));

		// Tag file with Content-Type, Cipher and Cipher-IV
		arBundles.addTag(item, 'App-Name', appName);
		arBundles.addTag(item, 'App-Version', appVersion);
		arBundles.addTag(item, 'Content-Type', 'application/octet-stream');
		arBundles.addTag(item, 'Cipher', encryptedData.cipher);
		arBundles.addTag(item, 'Cipher-IV', encryptedData.cipherIV);

		// Sign file
		// Sign the data, ready to be added to a bundle
		const dataItem = await arBundles.sign(item, JSON.parse(walletPrivateKey));

		const fileToUpdate = {
			id: fileToUpload.id,
			fileDataSyncStatus: 2,
			dataTxId: item.id,
			dataCipherIV: encryptedData.cipherIV,
			cipher: encryptedData.cipher
		};

		// Update the queue since the file is now being uploaded
		await updateFileDataSyncStatus(fileToUpdate);
		console.log('SUCCESS %s data item was created with TX %s', fileToUpload.filePath, item.id);
		return dataItem;
	} catch (err) {
		console.log('Error creating private data item');
		console.log(err);
		return null;
	}
};

// Creates an arweave transaction to encrypt and upload only file metadata to arweave
const createArDrivePrivateMetaDataItemTransaction = async (
	fileKey: Buffer,
	walletPrivateKey: string,
	fileToUpload: ArFSFileMetaData,
	secondaryFileMetaDataTags: string
): Promise<DataItemJson | null> => {
	try {
		// Encrypt the file metadata first since this is a private transaction
		const encryptedData: ArFSEncryptedData = await fileEncrypt(fileKey, Buffer.from(secondaryFileMetaDataTags));

		// Setup the transaction and get the price
		const item = await arBundles.createData({ data: encryptedData.data }, JSON.parse(walletPrivateKey));

		// Tag file with Private metadata
		arBundles.addTag(item, 'App-Name', appName);
		arBundles.addTag(item, 'App-Version', appVersion);
		arBundles.addTag(item, 'Unix-Time', fileToUpload.unixTime.toString());
		arBundles.addTag(item, 'Content-Type', 'application/octet-stream');
		arBundles.addTag(item, 'Cipher', encryptedData.cipher);
		arBundles.addTag(item, 'Cipher-IV', encryptedData.cipherIV);
		arBundles.addTag(item, 'ArFS', arFSVersion);
		arBundles.addTag(item, 'Entity-Type', fileToUpload.entityType);
		arBundles.addTag(item, 'Drive-Id', fileToUpload.driveId);
		if (fileToUpload.entityType === 'file') {
			arBundles.addTag(item, 'File-Id', fileToUpload.fileId);
			arBundles.addTag(item, 'Parent-Folder-Id', fileToUpload.parentFolderId);
		} else {
			arBundles.addTag(item, 'Folder-Id', fileToUpload.fileId);
			// If parent folder ID is 0, then this is a root folder and we do not include this tag.
			if (fileToUpload.parentFolderId !== '0') {
				arBundles.addTag(item, 'Parent-Folder-Id', fileToUpload.parentFolderId);
			}
		}

		// Sign file
		const dataItem = await arBundles.sign(item, JSON.parse(walletPrivateKey));
		const fileMetaDataToUpdate = {
			id: fileToUpload.id,
			fileMetaDataSyncStatus: 2,
			metaDataTxId: item.id,
			metaDataCipherIV: encryptedData.cipherIV,
			cipher: encryptedData.cipher
		};
		// Update the queue since the file metadata is now being uploaded
		await updateFileMetaDataSyncStatus(fileMetaDataToUpdate);
		console.log('SUCCESS %s public metadata item was created with TX %s', fileToUpload.filePath, dataItem.id);
		return dataItem;
	} catch (err) {
		console.log('Error creating private metadata item');
		console.log(err);
		return null;
	}
};

// Creates an arweave transaction to encrypt and upload file data (and no metadata) to arweave
const createArDrivePrivateDataTransaction = async (
	fileKey: Buffer,
	fileToUpload: ArFSFileMetaData,
	walletPrivateKey: string
): Promise<string> => {
	try {
		const data = fs.readFileSync(fileToUpload.filePath);
		const encryptedData: ArFSEncryptedData = await fileEncrypt(fileKey, data);
		const transaction = await arweave.createTransaction({ data: encryptedData.data }, JSON.parse(walletPrivateKey));

		// Tag file with Content-Type, Cipher and Cipher-IV
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Content-Type', 'application/octet-stream');
		transaction.addTag('Cipher', encryptedData.cipher);
		transaction.addTag('Cipher-IV', encryptedData.cipherIV);

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
		const uploader = await arweave.transactions.getUploader(transaction);
		const fileToUpdate = {
			id: fileToUpload.id,
			fileDataSyncStatus: 2,
			dataTxId: transaction.id,
			dataCipherIV: encryptedData.cipherIV,
			cipher: encryptedData.cipher
		};
		// Update the queue since the file is now being uploaded
		await updateFileDataSyncStatus(fileToUpdate);
		while (!uploader.isComplete) {
			// eslint-disable-next-line no-await-in-loop
			await uploader.uploadChunk();
			await setFileUploaderObject(JSON.stringify(uploader), fileToUpload.id);
			console.log(`${uploader.pctComplete}% complete, ${uploader.uploadedChunks}/${uploader.totalChunks}`);
		}
		console.log('SUCCESS %s was submitted with TX %s', fileToUpload.filePath, transaction.id);
		return transaction.id;
	} catch (err) {
		console.log(err);
		return 'Error';
	}
};

// Creates an arweave transaction to encrypt and upload only file metadata to arweave
const createArDrivePrivateMetaDataTransaction = async (
	fileKey: Buffer,
	walletPrivateKey: string,
	fileToUpload: ArFSFileMetaData,
	secondaryFileMetaDataTags: string
): Promise<string> => {
	try {
		// Encrypt the file metadata first since this is a private transaction
		const encryptedData: ArFSEncryptedData = await fileEncrypt(fileKey, Buffer.from(secondaryFileMetaDataTags));

		// Setup the transaction and get the price
		const transaction = await arweave.createTransaction({ data: encryptedData.data }, JSON.parse(walletPrivateKey));

		// Tag file with Private metadata
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Unix-Time', fileToUpload.unixTime.toString());
		transaction.addTag('Content-Type', 'application/octet-stream');
		transaction.addTag('Cipher', encryptedData.cipher);
		transaction.addTag('Cipher-IV', encryptedData.cipherIV);
		transaction.addTag('ArFS', arFSVersion);
		transaction.addTag('Entity-Type', fileToUpload.entityType);
		transaction.addTag('Drive-Id', fileToUpload.driveId);
		if (fileToUpload.entityType === 'file') {
			transaction.addTag('File-Id', fileToUpload.fileId);
			transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
		} else {
			transaction.addTag('Folder-Id', fileToUpload.fileId);
			// If parent folder ID is 0, then this is a root folder and we do not include this tag.
			if (fileToUpload.parentFolderId !== '0') {
				transaction.addTag('Parent-Folder-Id', fileToUpload.parentFolderId);
			}
		}

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));
		const uploader = await arweave.transactions.getUploader(transaction);
		const fileMetaDataToUpdate = {
			id: fileToUpload.id,
			fileMetaDataSyncStatus: 2,
			metaDataTxId: transaction.id,
			metaDataCipherIV: encryptedData.cipherIV,
			cipher: encryptedData.cipher
		};
		// Update the queue since the file metadata is now being uploaded
		await updateFileMetaDataSyncStatus(fileMetaDataToUpdate);
		while (!uploader.isComplete) {
			// eslint-disable-next-line no-await-in-loop
			await uploader.uploadChunk();
		}
		console.log('SUCCESS %s metadata was submitted with TX %s', fileToUpload.filePath, transaction.id);
		return transaction.id;
	} catch (err) {
		console.log(err);
		return 'Error';
	}
};

// Create a wallet and return the key and address
const createArDriveWallet = async (): Promise<Wallet> => {
	try {
		// Generate an Arweave wallet using a randomly generated 12 word seed phrase
		const wallet = await generateMnemonicWallet();

		// Generate an Arweave wallet using the standard Arweave.js
		// const wallet = await generateWallet();

		console.log('SUCCESS! Your new wallet public address is %s', wallet.walletPublicKey);
		return wallet;
	} catch (err) {
		console.error('Cannot create Wallet');
		console.error(err);
		return Promise.reject(err);
	}
};

// Calls the ArDrive Community Smart Contract to pull the fee
const getArDriveFee = async (): Promise<number> => {
	try {
		const contract = await readContract(arweave, communityTxId);
		const arDriveCommunityFee = contract.settings.find(
			(setting: (string | number)[]) => setting[0].toString().toLowerCase() === 'fee'
		);
		return arDriveCommunityFee ? arDriveCommunityFee[1] : 15;
	} catch {
		return 0.15; // Default fee of 15% if we cannot pull it from the community contract
	}
};

// Gets a random ArDrive token holder based off their weight (amount of tokens they hold)
const selectTokenHolder = async (): Promise<string | undefined> => {
	// Read the ArDrive Smart Contract to get the latest state
	const state = await readContract(arweave, communityTxId);
	const balances = state.balances;
	const vault = state.vault;

	// Get the total number of token holders
	let total = 0;
	for (const addr of Object.keys(balances)) {
		total += balances[addr];
	}

	// Check for how many tokens the user has staked/vaulted
	for (const addr of Object.keys(vault)) {
		if (!vault[addr].length) continue;

		const vaultBalance = vault[addr]
			.map((a: { balance: number; start: number; end: number }) => a.balance)
			.reduce((a: number, b: number) => a + b, 0);

		total += vaultBalance;

		if (addr in balances) {
			balances[addr] += vaultBalance;
		} else {
			balances[addr] = vaultBalance;
		}
	}

	// Create a weighted list of token holders
	const weighted: { [addr: string]: number } = {};
	for (const addr of Object.keys(balances)) {
		weighted[addr] = balances[addr] / total;
	}
	// Get a random holder based off of the weighted list of holders
	const randomHolder = weightedRandom(weighted);
	return randomHolder;
};

// Sends a fee to ArDrive Profit Sharing Community holders
const sendArDriveFee = async (walletPrivateKey: string, arPrice: number): Promise<string> => {
	try {
		// Get the latest ArDrive Community Fee from the Community Smart Contract
		let fee = arPrice * ((await getArDriveFee()) / 100);

		// If the fee is too small, we assign a minimum
		if (fee < 0.00001) {
			fee = 0.00001;
		}

		// Probabilistically select the PST token holder
		const holder = await selectTokenHolder();

		// send a fee. You should inform the user about this fee and amount.
		const transaction = await arweave.createTransaction(
			{ target: holder, quantity: arweave.ar.arToWinston(fee.toString()) },
			JSON.parse(walletPrivateKey)
		);

		// Tag file with data upload Tipping metadata
		transaction.addTag('App-Name', appName);
		transaction.addTag('App-Version', appVersion);
		transaction.addTag('Type', 'fee');
		transaction.addTag('Tip-Type', 'data upload');

		// Sign file
		await arweave.transactions.sign(transaction, JSON.parse(walletPrivateKey));

		// Submit the transaction
		const response = await arweave.transactions.post(transaction);
		if (response.status === 200 || response.status === 202) {
			// console.log('SUCCESS ArDrive fee of %s was submitted with TX %s to %s', fee.toFixed(9), transaction.id, holder);
		} else {
			// console.log('ERROR submitting ArDrive fee with TX %s', transaction.id);
		}
		return transaction.id;
	} catch (err) {
		console.log(err);
		return 'ERROR sending ArDrive fee';
	}
};

export {
	getAddressForWallet,
	getLatestBlockHeight,
	sendArDriveFee,
	createArDriveWallet,
	createArDrivePublicMetaDataTransaction,
	createArDrivePrivateMetaDataTransaction,
	getSharedPublicDrive,
	getPublicDriveRootFolderTxId,
	getPrivateDriveRootFolderTxId,
	createArDrivePrivateDataTransaction,
	createArDrivePublicDataTransaction,
	createPublicDriveTransaction,
	createPrivateDriveTransaction,
	getWalletBalance,
	getPrivateTransactionCipherIV,
	getTransactionStatus,
	getTransactionData,
	getAllMyDataFileTxs,
	getAllMySharedDataFileTxs,
	getAllMyPrivateArDriveIds,
	getAllMyPublicArDriveIds,
	getLocalWallet,
	generateWallet,
	getArDriveFee,
	createArDriveBundledDataTransaction,
	createArDrivePrivateDataItemTransaction,
	createArDrivePrivateMetaDataItemTransaction,
	createArDrivePublicDataItemTransaction,
	createArDrivePublicMetaDataItemTransaction
};
