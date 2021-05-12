// arfs.js
import * as arweave from './arweave';
import * as fs from 'fs';
import * as types from './types/base_Types';
import * as clientTypes from './types/client_Types';
import { fileEncrypt, deriveDriveKey, deriveFileKey, getFileAndEncrypt, driveEncrypt } from './crypto';
import { v4 as uuidv4 } from 'uuid';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';
export const gatewayURL = 'https://arweave.net/';
//export const gatewayURL = 'https://arweave.dev/';

export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.1.0';
export const arFSVersion = '0.11';
export const cipher = 'AES256-GCM';

// Tags and creates a new data item (ANS-102) to be bundled and uploaded

export async function newArFSFileDataItem(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalFile
): Promise<{ file: clientTypes.ArFSLocalFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	try {
		//Note: No size field on this new type, find out reason and add back later
		console.log('Bundling %s (%d bytes) to the Permaweb', file.path, file.size);
		const fileData = fs.readFileSync(file.path);
		dataItem = await arweave.prepareArFSDataItemTransaction(user, fileData, file);

		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', file.path, dataItem.id);

			// Set the file metadata to syncing
			file.data.syncStatus = 2;
			file.data.txId = dataItem.id;
			return { file, dataItem };
		} else {
			return null;
		}
	} catch (err) {
		console.log(err);
		console.log('Error bundling file data item');
		return null;
	}
}

export async function newArFSPrivateFileDataItem(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalPrivateFile,
	fileData: Buffer
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	try {
		// Private file, so it must be encrypted
		console.log('Encrypting and bundling %s (%d bytes) to the Permaweb', file.path, file.size);

		// Derive the keys needed for encryption
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);

		// Get the encrypted version of the file
		const encryptedData: types.ArFSEncryptedData = await fileEncrypt(fileKey, fileData);

		// Set the private file metadata
		file.entity.cipherIV;
		file.entity.cipher;

		// Get a signed data item for the encrypted data
		dataItem = await arweave.prepareArFSDataItemTransaction(user, encryptedData.data, file);

		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', file.path, dataItem.id);

			// Set the file metadata to syncing
			file.entity.syncStatus = 2;
			file.entity.txId = dataItem.id;
			return { file, dataItem };
		} else {
			return null;
		}
	} catch (err) {
		console.log(err);
		console.log('Error bundling file data item');
		return null;
	}
}
// Tags and creates a single file metadata item (ANS-102) to your ArDrive
export async function newArFSFileMetaDataItem(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalFile
): Promise<{ file: clientTypes.ArFSLocalFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (file.entity.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: file.entity.name
			};
		} else if (file.entity.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: file.entity.name,
				size: file.size,
				lastModifiedDate: file.entity.unixTime,
				dataTxId: file.data.txId,
				dataContentType: file.entity.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		// Public file, do not encrypt
		dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, file, secondaryFileMetaDataJSON);

		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', file.path, dataItem.id);
			// Set the file metadata to syncing
			file.entity.syncStatus = 2;
			file.entity.txId = dataItem.id;
			return { file, dataItem };
		} else {
			return null;
		}
	} catch (err) {
		console.log(err);
		console.log('Error uploading file metadata item');
		return null;
	}
}
export async function newArFSPrivateFileMetaDataItem(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalPrivateFile
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (file.entity.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: file.entity.name
			};
		} else if (file.entity.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: file.entity.name,
				size: file.size,
				lastModifiedDate: file.entity.unixTime,
				dataTxId: file.data.txId,
				dataContentType: file.entity.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);

		// Private file, so it must be encrypted
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);
		const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
			fileKey,
			Buffer.from(secondaryFileMetaDataJSON)
		);

		// Update the file privacy metadata
		file.entity.cipherIV = encryptedData.cipherIV;
		file.entity.cipher = encryptedData.cipher;
		dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, file, encryptedData.data);

		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', file.path, dataItem.id);
			// Set the file metadata to syncing
			file.entity.syncStatus = 2;
			file.entity.txId = dataItem.id;
			return { file, dataItem };
		} else {
			return null;
		}
	} catch (err) {
		console.log(err);
		console.log('Error uploading file metadata item');
		return null;
	}
}
// Takes a buffer and ArFS File Metadata and creates an ArFS Data Transaction using V2 Transaction with proper GQL tags

export async function newArFSFileData(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalFile,
	fileData: Buffer
): Promise<{ file: clientTypes.ArFSLocalFile; uploader: TransactionUploader } | null> {
	try {
		// The file is public
		console.log('Uploading the PUBLIC file %s (%d bytes) at %s to the Permaweb', file.path, file.size);

		// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
		const transaction = await arweave.prepareArFSDataTransaction(user, fileData, file);

		// Update the file's data transaction ID
		file.data.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}
export async function newArFSPrivateFileData(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalPrivateFile
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; uploader: TransactionUploader } | null> {
	try {
		// The file is private and we must encrypt
		console.log(
			'Encrypting and uploading the PRIVATE file %s (%d bytes) at %s to the Permaweb',
			file.path,
			file.size
		);
		// Derive the drive and file keys in order to encrypt it with ArFS encryption
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);

		// Encrypt the data with the file key
		const encryptedData: types.ArFSEncryptedData = await getFileAndEncrypt(fileKey, file.path);

		// Update the file metadata
		file.entity.cipherIV = encryptedData.cipherIV;
		file.entity.cipher = encryptedData.cipher;

		// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
		const transaction = await arweave.prepareArFSDataTransaction(user, encryptedData.data, file);

		// Update the file's data transaction ID
		file.data.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}
// Takes ArFS File (or folder) Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
export async function newArFSFileMetaData(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalFile
): Promise<{ file: clientTypes.ArFSLocalFile; uploader: TransactionUploader } | null> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (file.entity.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: file.entity.name
			};
		} else if (file.entity.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: file.entity.name,
				size: file.size,
				lastModifiedDate: file.entity.unixTime,
				dataTxId: file.data.txId,
				dataContentType: file.data.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		// Public file, do not encrypt
		transaction = await arweave.prepareArFSMetaDataTransaction(user, file, secondaryFileMetaDataJSON);

		// Update the file's data transaction ID
		file.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}
export async function newArFSPrivateFileMetaData(
	user: types.ArDriveUser,
	file: clientTypes.ArFSLocalPrivateFile
): Promise<{ file: clientTypes.ArFSLocalPrivateFile; uploader: TransactionUploader } | null> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (file.entity.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: file.entity.name
			};
		} else if (file.entity.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: file.entity.name,
				size: file.size,
				lastModifiedDate: file.entity.unixTime,
				dataTxId: file.data.txId,
				dataContentType: file.entity.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);

		// Private file, so the metadata must be encrypted
		// Get the drive and file key needed for encryption
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			file.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(file.entity.entityId, driveKey);
		const encryptedData: types.ArFSEncryptedData = await fileEncrypt(
			fileKey,
			Buffer.from(secondaryFileMetaDataJSON)
		);

		// Update the file privacy metadata
		file.entity.cipherIV = encryptedData.cipherIV;
		file.entity.cipher = encryptedData.cipher;
		transaction = await arweave.prepareArFSMetaDataTransaction(user, file, encryptedData.data);

		// Update the file's data transaction ID
		file.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { file, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Creates an new Drive transaction and uploader using ArFS Metadata
export async function newArFSDriveMetaData(
	user: types.ArDriveUser,
	driveMetaData: clientTypes.ArFSLocalDriveEntity
): Promise<{ driveMetaData: clientTypes.ArFSLocalDriveEntity; uploader: TransactionUploader } | null> {
	try {
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: driveMetaData.entity.name,
			rootFolderId: driveMetaData.entity.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// The drive is public
		console.log('Creating a new Public Drive (name: %s) on the Permaweb', driveMetaData.entity.name);
		const transaction = await arweave.prepareArFSDriveTransaction(user, driveMetaDataJSON, driveMetaData);

		// Update the file's data transaction ID
		driveMetaData.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { driveMetaData, uploader };
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', driveMetaData.entity.name);
		return null;
	}
}

export async function newArFSPrivateDriveMetaData(
	user: types.ArDriveUser,
	driveMetaData: clientTypes.ArFSLocalPrivateDriveEntity
): Promise<{ driveMetaData: clientTypes.ArFSLocalPrivateDriveEntity; uploader: TransactionUploader } | null> {
	try {
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: driveMetaData.entity.name,
			rootFolderId: driveMetaData.entity.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// Check if the drive is public or private
		console.log('Creating a new Private Drive (name: %s) on the Permaweb', driveMetaData.entity.name);
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			driveMetaData.entity.driveId,
			user.walletPrivateKey
		);
		const encryptedDriveMetaData: types.ArFSEncryptedData = await driveEncrypt(
			driveKey,
			Buffer.from(driveMetaDataJSON)
		);
		driveMetaData.entity.cipher = encryptedDriveMetaData.cipher;
		driveMetaData.entity.cipherIV = encryptedDriveMetaData.cipherIV;
		const transaction = await arweave.prepareArFSDriveTransaction(user, encryptedDriveMetaData.data, driveMetaData);

		// Update the file's data transaction ID
		driveMetaData.entity.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { driveMetaData, uploader };
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', driveMetaData.entity.name);
		return null;
	}
}

// Creates a new drive depending on the privacy
// This should be in the Drive class
export async function newArFSDrive(driveName: string, login: string): Promise<clientTypes.ArFSLocalDriveEntity> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);

	// Drive is public
	console.log('Creating a new public drive %s | %s', driveName, driveId);
	const drive: clientTypes.ArFSLocalDriveEntity = {
		id: 0,
		owner: login,
		isLocal: 1,
		entity: {
			appName: appName,
			appVersion: appVersion,
			arFS: arFSVersion,
			contentType: '',
			driveId: driveId,
			drivePrivacy: 'public',
			rootFolderId: rootFolderId,
			syncStatus: 0,
			txId: '0',
			unixTime: unixTime,
			name: '',
			entityType: ''
		}
	};

	return drive;
}
export async function newArFSPrivateDrive(
	driveName: string,
	login?: string
): Promise<clientTypes.ArFSLocalDriveEntity> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	console.log('Creating a new private drive %s | %s', driveName, driveId);
	const drive: clientTypes.ArFSLocalPrivateDriveEntity = {
		id: 0,
		owner: login != undefined ? login : '',
		isLocal: 1,
		entity: {
			appName: appName,
			appVersion: appVersion,
			arFS: arFSVersion,
			contentType: '',
			driveId: driveId,
			drivePrivacy: 'personal',
			rootFolderId: rootFolderId,
			syncStatus: 0,
			txId: '0',
			unixTime: unixTime,
			name: '',
			entityType: '',
			cipher: cipher,
			cipherIV: '',
			driveAuthMode: 'password'
		}
	};

	return drive;
}
// This will create and upload a new drive entity and its root folder
export async function createAndUploadArFSDriveAndRootFolder(
	user: types.ArDriveUser,
	driveName: string,
	drivePrivacy: string
): Promise<boolean> {
	try {
		// Create a new ArFS Drive entity
		const newDrive = await newArFSDrive(driveName, drivePrivacy);

		// Prepare the drive transaction.  It will encrypt the data if necessary.
		const preppedDrive = await newArFSDriveMetaData(user, newDrive);
		let isPublic = 1;
		if (drivePrivacy === 'private') {
			isPublic = 0;
		}

		// Create a new ArFS Drive Root Folder entity
		const newRootFolderMetaData: clientTypes.ArFSLocalFile = {
			id: 0,
			owner: user.login,
			hash: '',
			isLocal: 1,
			path: '',
			size: 0,
			version: 0,
			entity: {
				appName: appName,
				appVersion: appVersion,
				unixTime: Math.round(Date.now() / 1000),
				contentType: 'application/json',
				entityType: 'folder',
				driveId: newDrive.entity.driveId,
				parentFolderId: '0', // Must be set to 0 to indicate it is a root folder
				entityId: newDrive.entity.rootFolderId,
				name: driveName,
				syncStatus: 0,
				txId: '0',
				arFS: arFSVersion
			},
			data: { appName: appName, appVersion: appVersion, contentType: '', syncStatus: 0, txId: '0', unixTime: 0 }
		};

		// Prepare the root folder transaction.  It will encrypt the data if necessary.
		const preppedRootFolder = await newArFSFileMetaData(user, newRootFolderMetaData);

		// Upload the drive entity transaction
		if (preppedDrive !== null && preppedRootFolder !== null) {
			while (!preppedDrive.uploader.isComplete) {
				await preppedDrive.uploader.uploadChunk();
			}
			// upload the root folder entity metadata transaction
			while (!preppedRootFolder.uploader.isComplete) {
				await preppedRootFolder.uploader.uploadChunk();
			}
			return true;
		} else {
			// Error creating root folder transaction and uploader
			return false;
		}
	} catch (err) {
		console.log(err);
		return false;
	}
}

// Derives a file key from the drive key and formats it into a Private file sharing link using the file id
export async function createArFSPrivateFileSharingLink(
	user: types.ArDriveUser,
	fileToShare: clientTypes.ArFSLocalFile
): Promise<string> {
	let fileSharingUrl = '';
	try {
		const driveKey: Buffer = await deriveDriveKey(
			user.dataProtectionKey,
			fileToShare.entity.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await deriveFileKey(fileToShare.entity.entityId, driveKey);
		fileSharingUrl = stagingAppUrl.concat(
			'/#/file/',
			fileToShare.entity.entityId,
			'/view?fileKey=',
			fileKey.toString('base64')
		);
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Private File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
}

// Creates a Public file sharing link using the File Id.
export async function createArFSPublicFileSharingLink(fileToShare: clientTypes.ArFSLocalFile): Promise<string> {
	let fileSharingUrl = '';
	try {
		fileSharingUrl = stagingAppUrl.concat('/#/file/', fileToShare.entity.entityId, '/view');
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
}

// Creates a Public drive sharing link using the Drive Id
export async function createArFSPublicDriveSharingLink(
	driveToShare: clientTypes.ArFSLocalDriveEntity
): Promise<string> {
	let driveSharingUrl = '';
	try {
		driveSharingUrl = stagingAppUrl.concat('/#/drives/', driveToShare.entity.driveId);
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public Drive Sharing Link');
		driveSharingUrl = 'Error';
	}
	return driveSharingUrl;
}
