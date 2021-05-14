import * as arfsTypes from './types/arfs_Types';
import * as gqlTypes from './types/gql_Types';
import Arweave from 'arweave';

const arweave = Arweave.init({
	host: 'arweave.net', // Arweave Gateway
	//host: 'arweave.dev', // Arweave Dev Gateway
	port: 443,
	protocol: 'https',
	timeout: 600000
});

// Our primary GQL url
export const primaryGraphQLURL = 'https://arweave.net/graphql';
export const backupGraphQLURL = 'https://arweave.dev/graphql';

// Gets the latest version of a drive entity
export async function getPublicDriveEntity(driveId: string): Promise<arfsTypes.ArFSDriveEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const drive: arfsTypes.ArFSDriveEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		contentType: '',
		driveId,
		drivePrivacy: '',
		entityType: 'drive',
		name: '',
		rootFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		// GraphQL Query
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "drive" }
		  { name: "Drive-Privacy", values: "public" }]) 
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
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			const { node } = edge;
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Get the drives transaction ID
			drive.txId = node.id;
		});
		return drive;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get Shared Public Drive');
		return 'CORE GQL ERROR: Cannot get Shared Public Drive';
	}
}

// Gets the latest version of a drive entity
export async function getPrivateDriveEntity(driveId: string): Promise<arfsTypes.ArFSPrivateDriveEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const drive: arfsTypes.ArFSPrivateDriveEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		driveId,
		drivePrivacy: '',
		driveAuthMode: '',
		entityType: '',
		name: '',
		rootFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		// GraphQL Query
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "drive" }
		  { name: "Drive-Privacy", values: "private" }]) 
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
		edges.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			const { node } = edge;
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Cipher':
						drive.cipher = value;
						break;
					case 'Cipher-IV':
						drive.cipherIV = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Auth-Mode':
						drive.driveAuthMode = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Get the drives transaction ID
			drive.txId = node.id;
		});
		return drive;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get Public Drive');
		return 'CORE GQL ERROR: Cannot get Public Drive';
	}
}

// Gets the latest version of a folder entity
export async function getPublicFolderEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const folder: arfsTypes.ArFSFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		contentType: '',
		driveId: '',
		entityType: 'folder',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "Folder-Id", values: "${entityId}"}
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
		edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			folder.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						folder.appName = value;
						break;
					case 'App-Version':
						folder.appVersion = value;
						break;
					case 'ArFS':
						folder.arFS = value;
						break;
					case 'Content-Type':
						folder.contentType = value;
						break;
					case 'Drive-Id':
						folder.driveId = value;
						break;
					case 'Entity-Type':
						folder.entityType = value;
						break;
					case 'Folder-Id':
						folder.entityId = value;
						break;
					case 'Parent-Folder-Id':
						folder.parentFolderId = value;
						break;
					case 'Unix-Time':
						folder.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return folder;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get public folder entity');
		return 'CORE GQL ERROR: Cannot get public folder entity';
	}
}

// Gets the latest version of a folder entity
export async function getPrivateFolderEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSPrivateFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const folder: arfsTypes.ArFSPrivateFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		driveId: '',
		entityType: 'folder',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "Folder-Id", values: "${entityId}"}
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
		edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			folder.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						folder.appName = value;
						break;
					case 'App-Version':
						folder.appVersion = value;
						break;
					case 'ArFS':
						folder.arFS = value;
						break;
					case 'Cipher':
						folder.cipher = value;
						break;
					case 'Cipher-IV':
						folder.cipherIV = value;
						break;
					case 'Content-Type':
						folder.contentType = value;
						break;
					case 'Drive-Id':
						folder.driveId = value;
						break;
					case 'Entity-Type':
						folder.entityType = value;
						break;
					case 'Folder-Id':
						folder.entityId = value;
						break;
					case 'Parent-Folder-Id':
						folder.parentFolderId = value;
						break;
					case 'Unix-Time':
						folder.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return folder;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get private folder entity');
		return 'CORE GQL ERROR: Cannot get private folder entity';
	}
}

// Gets the latest version of a file entity
export async function getPublicFileEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const file: arfsTypes.ArFSFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		contentType: '',
		driveId: '',
		entityType: 'file',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "File-Id", values: "${entityId}"}
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
		edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			file.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						file.appName = value;
						break;
					case 'App-Version':
						file.appVersion = value;
						break;
					case 'ArFS':
						file.arFS = value;
						break;
					case 'Content-Type':
						file.contentType = value;
						break;
					case 'Drive-Id':
						file.driveId = value;
						break;
					case 'Entity-Type':
						file.entityType = value;
						break;
					case 'File-Id':
						file.entityId = value;
						break;
					case 'Parent-Folder-Id':
						file.parentFolderId = value;
						break;
					case 'Unix-Time':
						file.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return file;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get folder entity');
		return 'CORE GQL ERROR: Cannot get folder entity';
	}
}

// Gets the latest version of a private file entity
export async function getPrivateFileEntity(
	owner: string,
	entityId: string
): Promise<arfsTypes.ArFSPrivateFileFolderEntity | string> {
	const graphQLURL = primaryGraphQLURL;
	const file: arfsTypes.ArFSPrivateFileFolderEntity = {
		appName: '',
		appVersion: '',
		arFS: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		driveId: '',
		entityType: 'file',
		entityId: '',
		name: '',
		parentFolderId: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	try {
		const query = {
			query: `query {
      transactions(
        first: 1
        sort: HEIGHT_ASC
		owners: ["${owner}"]
        tags: { name: "File-Id", values: "${entityId}"}
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
		edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			file.txId = node.id;
			// Enumerate through each tag to pull the data
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						file.appName = value;
						break;
					case 'App-Version':
						file.appVersion = value;
						break;
					case 'ArFS':
						file.arFS = value;
						break;
					case 'Cipher':
						file.cipher = value;
						break;
					case 'Cipher-IV':
						file.cipherIV = value;
						break;
					case 'Content-Type':
						file.contentType = value;
						break;
					case 'Drive-Id':
						file.driveId = value;
						break;
					case 'Entity-Type':
						file.entityType = value;
						break;
					case 'File-Id':
						file.entityId = value;
						break;
					case 'Parent-Folder-Id':
						file.parentFolderId = value;
						break;
					case 'Unix-Time':
						file.unixTime = +value; // Convert to number
						break;
					default:
						break;
				}
			});
		});
		return file;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get folder entity');
		return 'CORE GQL ERROR: Cannot get folder entity';
	}
}

// Gets all of the drive entities for a users wallet
export async function getAllPublicDriveEntities(
	owner: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSDriveEntity[] | string> {
	const graphQLURL = primaryGraphQLURL;
	const allDrives: arfsTypes.ArFSDriveEntity[] = [];
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
				owners: ["${owner}"]
				tags: [
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
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		// Iterate through each returned transaction and pull out the drive IDs
		edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const drive: arfsTypes.ArFSDriveEntity = {
				appName: '',
				appVersion: '',
				arFS: '',
				contentType: 'application/json',
				driveId: '',
				drivePrivacy: 'public',
				entityType: 'drive',
				name: '',
				rootFolderId: '',
				txId: '',
				unixTime: 0,
				syncStatus: 0
			};
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Capture the TX of the public drive metadata tx
			drive.txId = node.id;
			allDrives.push(drive);
		});
		return allDrives;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get folder entity');
		return 'CORE GQL ERROR: Cannot get drive ids';
	}
}

// Gets all of the private drive entities for a users wallet
export async function getAllPrivateDriveEntities(
	owner: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSPrivateDriveEntity[] | string> {
	const graphQLURL = primaryGraphQLURL;
	const allDrives: arfsTypes.ArFSPrivateDriveEntity[] = [];
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
				owners: ["${owner}"]
				tags: [
					{ name: "Entity-Type", values: "drive" }
					{ name: "Drive-Privacy", values: "private" }]) 
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
		const response = await arweave.api.post(graphQLURL, query);
		const { data } = response.data;
		const { transactions } = data;
		const { edges } = transactions;

		// Iterate through each returned transaction and pull out the drive IDs
		edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
			const { node } = edge;
			const { tags } = node;
			const drive: arfsTypes.ArFSPrivateDriveEntity = {
				appName: '',
				appVersion: '',
				arFS: '',
				cipher: '',
				cipherIV: '',
				contentType: 'application/json',
				driveId: '',
				drivePrivacy: 'private',
				driveAuthMode: '',
				entityType: 'drive',
				name: '',
				rootFolderId: '',
				txId: '',
				unixTime: 0,
				syncStatus: 0
			};
			// Iterate through each tag and pull out each drive ID as well the drives privacy status
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						drive.appName = value;
						break;
					case 'App-Version':
						drive.appVersion = value;
						break;
					case 'ArFS':
						drive.arFS = value;
						break;
					case 'Cipher':
						drive.cipher = value;
						break;
					case 'Cipher-IV':
						drive.cipherIV = value;
						break;
					case 'Content-Type':
						drive.contentType = value;
						break;
					case 'Drive-Auth-Mode':
						drive.driveAuthMode = value;
						break;
					case 'Drive-Id':
						drive.driveId = value;
						break;
					case 'Drive-Privacy':
						drive.drivePrivacy = value;
						break;
					case 'Unix-Time':
						drive.unixTime = +value;
						break;
					default:
						break;
				}
			});

			// Capture the TX of the public drive metadata tx
			drive.txId = node.id;
			allDrives.push(drive);
		});
		return allDrives;
	} catch (err) {
		console.log(err);
		console.log('CORE GQL ERROR: Cannot get private drive entities');
		return 'CORE GQL ERROR: Cannot get private drive entities';
	}
}

// Gets all of the folder entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPublicFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFolders: arfsTypes.ArFSFileFolderEntity[] = [];
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
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "folder"}
		  { name: "Content-Type", values: "application/json"}
        ]
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
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const folder: arfsTypes.ArFSFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					contentType: '',
					driveId: '',
					entityType: 'folder',
					entityId: '',
					name: '',
					parentFolderId: '',
					unixTime: 0,
					txId: '',
					syncStatus: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							folder.appName = value;
							break;
						case 'App-Version':
							folder.appVersion = value;
							break;
						case 'ArFS':
							folder.arFS = value;
							break;
						case 'Content-Type':
							folder.contentType = value;
							break;
						case 'Drive-Id':
							folder.driveId = value;
							break;
						case 'Folder-Id':
							folder.entityId = value;
							break;
						case 'Parent-Folder-Id':
							folder.parentFolderId = value;
							break;
						case 'Unix-Time':
							folder.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				folder.txId = node.id;
				allFolders.push(folder);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for folder entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get public folder entities';
	} else {
		return allFolders;
	}
}

// Gets all of the private folder entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPrivateFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSPrivateFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFolders: arfsTypes.ArFSPrivateFileFolderEntity[] = [];
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
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "folder"}
		  { name: "Content-Type", values: "application/octet-stream"}
        ]
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
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const folder: arfsTypes.ArFSPrivateFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					cipher: '',
					cipherIV: '',
					contentType: '',
					driveId: '',
					entityType: 'folder',
					entityId: '',
					name: '',
					parentFolderId: '',
					unixTime: 0,
					txId: '',
					syncStatus: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							folder.appName = value;
							break;
						case 'App-Version':
							folder.appVersion = value;
							break;
						case 'ArFS':
							folder.arFS = value;
							break;
						case 'Cipher':
							folder.cipher = value;
							break;
						case 'Cipher-IV':
							folder.cipherIV = value;
							break;
						case 'Content-Type':
							folder.contentType = value;
							break;
						case 'Drive-Id':
							folder.driveId = value;
							break;
						case 'Folder-Id':
							folder.entityId = value;
							break;
						case 'Parent-Folder-Id':
							folder.parentFolderId = value;
							break;
						case 'Unix-Time':
							folder.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				folder.txId = node.id;
				allFolders.push(folder);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for folder entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get private folder entities';
	} else {
		return allFolders;
	}
}

// Gets all of the file entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPublicFileEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFileEntities: arfsTypes.ArFSFileFolderEntity[] = [];
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
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "file"}
		  { name: "Content-Type", values: "application/json"}
        ]
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
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const file: arfsTypes.ArFSFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					contentType: '',
					driveId: '',
					entityType: 'file',
					entityId: '',
					name: '',
					parentFolderId: '',
					txId: '',
					unixTime: 0,
					syncStatus: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							file.appName = value;
							break;
						case 'App-Version':
							file.appVersion = value;
							break;
						case 'ArFS':
							file.arFS = value;
							break;
						case 'Content-Type':
							file.contentType = value;
							break;
						case 'Drive-Id':
							file.driveId = value;
							break;
						case 'File-Id':
							file.entityId = value;
							break;
						case 'Parent-Folder-Id':
							file.parentFolderId = value;
							break;
						case 'Unix-Time':
							file.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				file.txId = node.id;
				allFileEntities.push(file);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for file entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get public file entities';
	} else {
		return allFileEntities;
	}
}

// Gets all of the private file entity metadata transactions from a user's wallet, filtered by owner and drive ID
export async function getAllPrivateFileEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<arfsTypes.ArFSPrivateFileFolderEntity[] | string> {
	let hasNextPage = true;
	let cursor = '';
	let graphQLURL = primaryGraphQLURL;
	const allFileEntities: arfsTypes.ArFSPrivateFileFolderEntity[] = [];
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
        owners: ["${owner}"]
		first: 100
        after: "${cursor}"
        tags: [
          { name: "Drive-Id", values: "${driveId}" }
          { name: "Entity-Type", values: "file"}
		  { name: "Content-Type", values: "application/octet-stream"}
        ]
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
			const { edges } = transactions;
			hasNextPage = transactions.pageInfo.hasNextPage;
			edges.array.forEach((edge: gqlTypes.GQLEdgeInterface) => {
				const file: arfsTypes.ArFSPrivateFileFolderEntity = {
					appName: '',
					appVersion: '',
					arFS: '',
					cipher: '',
					cipherIV: '',
					contentType: '',
					driveId: '',
					entityType: 'file',
					entityId: '',
					name: '',
					parentFolderId: '',
					txId: '',
					unixTime: 0,
					syncStatus: 0
				};
				cursor = edge.cursor;
				const { node } = edge;
				const { tags } = node;
				// Enumerate through each tag to pull the data
				tags.forEach((tag: gqlTypes.GQLTagInterface) => {
					const key = tag.name;
					const { value } = tag;
					switch (key) {
						case 'App-Name':
							file.appName = value;
							break;
						case 'App-Version':
							file.appVersion = value;
							break;
						case 'ArFS':
							file.arFS = value;
							break;
						case 'Cipher':
							file.cipher = value;
							break;
						case 'Cipher-IV':
							file.cipherIV = value;
							break;
						case 'Content-Type':
							file.contentType = value;
							break;
						case 'Drive-Id':
							file.driveId = value;
							break;
						case 'File-Id':
							file.entityId = value;
							break;
						case 'Parent-Folder-Id':
							file.parentFolderId = value;
							break;
						case 'Unix-Time':
							file.unixTime = +value; // Convert to number
							break;
						default:
							break;
					}
				});
				// Capture the TX of the file metadata tx
				file.txId = node.id;
				allFileEntities.push(file);
			});
		} catch (err) {
			console.log(err);
			if (tries < 5) {
				tries += 1;
				console.log(
					'Error querying GQL for file entity transactions for %s starting at block height %s, trying again.',
					driveId,
					lastBlockHeight
				);
			} else {
				if (graphQLURL === backupGraphQLURL) {
					console.log('Backup gateway is having issues, stopping the query.');
					hasNextPage = false;
				} else {
					console.log('Primary gateway is having issues, switching to backup.');
					graphQLURL = backupGraphQLURL; // Change to the backup URL and try 5 times
					tries = 0;
				}
			}
		}
	}
	if (tries === 0) {
		return 'CORE GQL ERROR: Cannot get private file entities';
	} else {
		return allFileEntities;
	}
}
// Gets all of the File and Folder Entities from GraphQL for a specific private drive
export async function getAllPublicFileFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<
	{ fileEntities: arfsTypes.ArFSFileFolderEntity[]; folderEntities: arfsTypes.ArFSFileFolderEntity[] } | string
> {
	const folderEntities = await getAllPublicFolderEntities(owner, driveId, lastBlockHeight);
	const fileEntities = await getAllPublicFileEntities(owner, driveId, lastBlockHeight);
	if (typeof folderEntities === 'object' && typeof fileEntities === 'object') {
		return { folderEntities, fileEntities };
	} else {
		return 'Error';
	}
}

// Gets all of the File and Folder Entities from GraphQL for a specific drive
export async function getAllPrivateFileFolderEntities(
	owner: string,
	driveId: string,
	lastBlockHeight: number
): Promise<
	| { fileEntities: arfsTypes.ArFSPrivateFileFolderEntity[]; folderEntities: arfsTypes.ArFSPrivateFileFolderEntity[] }
	| string
> {
	const folderEntities = await getAllPrivateFolderEntities(owner, driveId, lastBlockHeight);
	const fileEntities = await getAllPrivateFileEntities(owner, driveId, lastBlockHeight);
	if (typeof folderEntities === 'object' && typeof fileEntities === 'object') {
		return { folderEntities, fileEntities };
	} else {
		return 'Error';
	}
}

// Gets the the tags for a file entity data transaction
export async function getPublicFileData(txid: string): Promise<arfsTypes.ArFSFileData | string> {
	let graphQLURL = primaryGraphQLURL;
	const fileData: arfsTypes.ArFSFileData = {
		appName: '',
		appVersion: '',
		contentType: '',
		syncStatus: 0,
		txId: '',
		unixTime: 0
	};
	let tries = 0;
	const query = {
		query: `query {
      transactions(
		first: 1
        sort: HEIGHT_ASC
		ids: ["${txid}"]) 
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

	// We will only attempt this 10 times
	while (tries < 10) {
		try {
			// Call the Arweave Graphql Endpoint
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			const { node } = edges[0];
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						fileData.appName = value;
						break;
					case 'App-Version':
						fileData.appVersion = value;
						break;
					case 'Unix-Type':
						fileData.unixTime = +value;
						break;
					case 'Content-Type':
						fileData.contentType = value;
						break;
					default:
						break;
				}
			});
			return fileData;
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
	return 'CORE GQL ERROR: Cannot get public file data';
}

// Gets the the tags for a file entity data transaction
export async function getPrivateFileData(txid: string): Promise<arfsTypes.ArFSPrivateFileData | string> {
	let graphQLURL = primaryGraphQLURL;
	const fileData: arfsTypes.ArFSPrivateFileData = {
		appName: '',
		appVersion: '',
		cipher: '',
		cipherIV: '',
		contentType: '',
		txId: '',
		unixTime: 0,
		syncStatus: 0
	};
	let tries = 0;
	const query = {
		query: `query {
      transactions(
		first: 1
        sort: HEIGHT_ASC
		ids: ["${txid}"]) 
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

	// We will only attempt this 10 times
	while (tries < 10) {
		try {
			// Call the Arweave Graphql Endpoint
			const response = await arweave.api.post(graphQLURL, query);
			const { data } = response.data;
			const { transactions } = data;
			const { edges } = transactions;
			const { node } = edges[0];
			const { tags } = node;
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
				const key = tag.name;
				const { value } = tag;
				switch (key) {
					case 'App-Name':
						fileData.appName = value;
						break;
					case 'App-Version':
						fileData.appVersion = value;
						break;
					case 'Unix-Type':
						fileData.unixTime = +value;
						break;
					case 'Cipher':
						fileData.cipher = value;
						break;
					case 'Cipher-IV':
						fileData.cipherIV = value;
						break;
					case 'Content-Type':
						fileData.contentType = value;
						break;
					default:
						break;
				}
			});
			return fileData;
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
	return 'CORE GQL ERROR: Cannot get private file data';
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
			tags.forEach((tag: gqlTypes.GQLTagInterface) => {
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
	return 'CORE GQL ERROR: Cannot get file data Cipher IV';
}
