// arfs.js
import * as arweave from './arweave';
import * as fs from 'fs';
import * as types from './types';
import * as gql from './gql';
import * as crypto from './crypto';
import { v4 as uuidv4 } from 'uuid';
import { DataItemJson } from 'arweave-bundles';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';
import Transaction from 'arweave/node/lib/transaction';
import { JWKInterface } from 'arweave/node/lib/wallet';

export const prodAppUrl = 'https://app.ardrive.io';
export const stagingAppUrl = 'https://staging.ardrive.io';
export const primaryGatewayURL = 'https://arweave.net/';
export const backupGatewayURL = 'https://arweave.dev/';

export const appName = 'ArDrive-Desktop';
export const appVersion = '0.1.0';
export const arFSVersion = '0.11';
export const cipher = 'AES256-GCM';

// Gets an ArFS Drive entity from GQL and then downloads the data JSON and decrypts if private (requires drive key)
export async function arfsGetDrive(driveId: string, driveKey?: Buffer): Promise<types.ArFSDriveEntity | string> {
	const drive = await gql.getDriveEntity(driveId);
	if (typeof drive === 'string') {
		// There was an error
		return 'Error getting Drive Entity';
	} else {
		// Get the data JSON for this drive transaction
		const data = await arweave.getTransactionData(drive.txId);

		if (drive.cipher !== '' && driveKey !== undefined) {
			// Private drive
			const dataBuffer = Buffer.from(data);
			const decryptedDataBuffer: Buffer = await crypto.driveDecrypt(drive.cipherIV, driveKey, dataBuffer);
			const decryptedDataString: string = Utf8ArrayToStr(decryptedDataBuffer);
			const driveJSON = await JSON.parse(decryptedDataString);
			drive.name = driveJSON.name;
			drive.rootFolderId = driveJSON.rootFolderId;
		} else {
			const dataString = Utf8ArrayToStr(data);
			const driveJSON = await JSON.parse(dataString);
			drive.name = driveJSON.name;
			drive.rootFolderId = driveJSON.rootFolderId;
		}
		return drive;
	}
}

// Gets all Files and Folders for a particular drive.  If the file or folder is private, it will decrypt it with the driveKey
export async function arfsSyncDrive(
	owner: string,
	driveId: string,
	lastBlockHeight: number,
	driveKey?: Buffer
): Promise<{ fileEntities: types.ArFSFileEntity[]; folderEntities: types.ArFSFolderEntity[] } | string> {
	const driveState = await gql.getAllFileAndFolderEntities(owner, driveId, lastBlockHeight);
	if (typeof driveState === 'string') {
		// MUST USE CORRECT ERROR CHECKING
		// There was an error
		return 'Error synchronizing drive';
	} else {
		for (let i = 0; i < driveState.folderEntities.length; i++) {
			await getTransactionData(driveState.folderEntities[i].txId);
		}
	}
}

// Gets an ArFS Folder entity from GQL and then downloads the data JSON and decrypts if private (requires drive key)
export async function arfsGetFolder(
	owner: string,
	folderId: string,
	driveKey?: Buffer
): Promise<types.ArFSFolderEntity | string> {
	const folder = await gql.getFolderEntity(owner, folderId);
	if (typeof folder === 'string') {
		// There was an error
		return folder;
	} else {
		// Get the data JSON for this drive transaction
		const data = await arweave.getTransactionData(folder.txId);

		if (folder.cipher !== '' && driveKey !== undefined) {
			// Private folder
			// Decrypt the JSON data using the drive key
			const dataBuffer = Buffer.from(data);
			const fileKey: Buffer = await crypto.deriveFileKey(folderId, driveKey);
			const decryptedDataBuffer: Buffer = await crypto.fileDecrypt(folder.cipherIV, fileKey, dataBuffer);
			const decryptedDataString: string = Utf8ArrayToStr(decryptedDataBuffer);
			const folderJSON = await JSON.parse(decryptedDataString);
			folder.name = folderJSON.name;
		} else {
			const dataString = Utf8ArrayToStr(data);
			const folderJSON = await JSON.parse(dataString);
			folder.name = folderJSON.name;
		}
		return folder;
	}
}

// Tags and creates a new data item (ANS-102) to be bundled and uploaded
export async function arfsNewFileDataItem(
	fileMetaData: types.ArFSFileEntity,
	fileData: Buffer,
	walletPrivateKey: JWKInterface,
	driveKey?: Buffer
): Promise<{ fileMetaData: types.ArFSFileEntity; dataItem: DataItemJson } | string> {
	let dataItem: DataItemJson | string;
	try {
		if (fileMetaData.cipher !== '' && driveKey !== undefined) {
			// Private file, so it must be encrypted
			console.log('Encrypting and bundling %s (%d bytes) to the Permaweb', fileMetaData.name, fileMetaData.size);

			// Derive the keys needed for encryption
			const fileKey: Buffer = await crypto.deriveFileKey(fileMetaData.uuid, driveKey);

			// Get the encrypted version of the file
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(fileKey, fileData);

			// Set the private file metadata
			fileMetaData.cipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;

			// Get a signed data item for the encrypted data
			dataItem = await arweave.createFileDataItemTransaction(encryptedData.data, fileMetaData, walletPrivateKey);
		} else {
			console.log('Bundling %s (%d bytes) to the Permaweb', fileMetaData.name, fileMetaData.size);
			dataItem = await arweave.createFileDataItemTransaction(fileData, fileMetaData, walletPrivateKey);
		}
		if (typeof dataItem !== 'string') {
			console.log('SUCCESS %s data item was created with TX %s', fileMetaData.name, dataItem.id);
			return { fileMetaData, dataItem };
		} else {
			return 'Error bundling file data item';
		}
	} catch (err) {
		console.log(err);
		console.log('Error bundling file data item');
		return 'Error bundling file data item';
	}
}

// Tags and creates a single file metadata item (ANS-102) to your ArDrive
export async function arfsNewFileMetaDataItem(
	fileMetaData: types.ArFSFileEntity,
	walletPrivateKey: JWKInterface,
	driveKey?: Buffer
): Promise<{ fileMetaData: types.ArFSFileEntity; dataItem: DataItemJson } | string> {
	let dataItem: DataItemJson | string;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		secondaryFileMetaDataTags = {
			name: fileMetaData.name,
			size: fileMetaData.size,
			lastModifiedDate: fileMetaData.lastModifiedDate,
			dataTxId: fileMetaData.dataTxId,
			dataContentType: fileMetaData.contentType
		};

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (driveKey !== undefined) {
			// Private file, so it must be encrypted
			const fileKey: Buffer = await crypto.deriveFileKey(fileMetaData.uuid, driveKey);
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			fileMetaData.cipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;
			dataItem = await arweave.createFileMetaDataItemTransaction(
				fileMetaData,
				encryptedData.data,
				walletPrivateKey
			);
		} else {
			// Public file, do not encrypt
			dataItem = await arweave.createFileMetaDataItemTransaction(
				fileMetaData,
				secondaryFileMetaDataJSON,
				walletPrivateKey
			);
		}
		if (typeof dataItem !== 'string') {
			console.log('SUCCESS %s data item was created with TX %s', fileMetaData.name, dataItem.id);
			return { fileMetaData, dataItem };
		} else {
			console.log('Error uploading file metadata item');
			return 'Error';
		}
	} catch (err) {
		console.log(err);
		console.log('Error uploading file metadata item');
		return 'Error';
	}
}

// Takes a buffer and ArFS File Metadata and creates an ArFS Data Transaction using V2 Transaction with proper GQL tags
export async function arfsNewFileData(
	fileId: string,
	fileMetaData: types.ArFSFileEntityData,
	fileData: Buffer,
	walletPrivateKey?: JWKInterface,
	driveKey?: Buffer
): Promise<{ fileMetaData: types.ArFSFileEntityData; uploader: TransactionUploader } | string> {
	let transaction;
	try {
		if (driveKey != undefined) {
			// The file is private and we must encrypt
			const fileKey: Buffer = await crypto.deriveFileKey(fileId, driveKey);

			// Encrypt the data with the file key
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(fileKey, fileData);

			// Update the file metadata
			fileMetaData.cipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;

			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.createFileDataTransaction(encryptedData.data, fileMetaData, walletPrivateKey);
		} else {
			// The file is public
			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.createFileDataTransaction(fileData, fileMetaData, walletPrivateKey);
		}

		// Update the file's data transaction ID
		fileMetaData.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { fileMetaData, uploader };
	} catch (err) {
		console.log(err);
		return 'Error';
	}
}

// Takes ArFS File Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
export async function arfsNewFileMetaData(
	fileMetaData: types.ArFSFileEntity,
	walletPrivateKey?: JWKInterface,
	driveKey?: Buffer
): Promise<{ fileMetaData: types.ArFSFileEntity; uploader: TransactionUploader } | string> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		secondaryFileMetaDataTags = {
			name: fileMetaData.name,
			size: fileMetaData.size,
			lastModifiedDate: fileMetaData.lastModifiedDate,
			dataTxId: fileMetaData.dataTxId,
			dataContentType: fileMetaData.contentType
		};

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (driveKey != undefined) {
			// Private file, so the metadata must be encrypted
			const fileKey: Buffer = await crypto.deriveFileKey(fileMetaData.uuid, driveKey);
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			fileMetaData.cipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;
			transaction = await arweave.createFileOrFolderMetaDataTransaction(
				fileMetaData,
				encryptedData.data,
				walletPrivateKey
			);
		} else {
			// Public file, do not encrypt
			transaction = await arweave.createFileOrFolderMetaDataTransaction(
				fileMetaData,
				secondaryFileMetaDataJSON,
				walletPrivateKey
			);
		}

		// Update the file's data transaction ID
		fileMetaData.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { fileMetaData, uploader };
	} catch (err) {
		console.log(err);
		return 'Error';
	}
}

// Takes ArFS File Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
export async function arfsNewFolderMetaData(
	folderMetaData: types.ArFSFolderEntity,
	walletPrivateKey?: JWKInterface,
	driveKey?: Buffer
): Promise<{ folderMetaData: types.ArFSFolderEntity; uploader: TransactionUploader } | string> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		secondaryFileMetaDataTags = {
			name: folderMetaData.name
		};

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (driveKey != undefined) {
			// Private file, so the metadata must be encrypted
			const fileKey: Buffer = await crypto.deriveFileKey(folderMetaData.uuid, driveKey);
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			folderMetaData.cipherIV = encryptedData.cipherIV;
			folderMetaData.cipher = encryptedData.cipher;
			transaction = await arweave.createFileOrFolderMetaDataTransaction(
				folderMetaData,
				encryptedData.data,
				walletPrivateKey
			);
		} else {
			// Public file, do not encrypt
			transaction = await arweave.createFileOrFolderMetaDataTransaction(
				folderMetaData,
				secondaryFileMetaDataJSON,
				walletPrivateKey
			);
		}

		// Update the file's data transaction ID
		folderMetaData.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { folderMetaData, uploader };
	} catch (err) {
		console.log(err);
		return 'Error';
	}
}

// Creates an new Drive transaction and uploader using ArFS Metadata
export async function arfsNewDriveMetaData(
	driveMetaData: types.ArFSDriveEntity,
	walletPrivateKey?: JWKInterface,
	driveKey?: Buffer
): Promise<{ driveMetaData: types.ArFSDriveEntity; uploader: TransactionUploader } | string> {
	try {
		let transaction: Transaction;
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: driveMetaData.name,
			rootFolderId: driveMetaData.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// Check if the drive is public or private
		if (driveKey != undefined) {
			console.log('Creating a new Private Drive (name: %s) on the Permaweb', driveMetaData.name);
			const encryptedDriveMetaData: types.ArFSEncryptedData = await crypto.driveEncrypt(
				driveKey,
				Buffer.from(driveMetaDataJSON)
			);
			driveMetaData.cipher = encryptedDriveMetaData.cipher;
			driveMetaData.cipherIV = encryptedDriveMetaData.cipherIV;
			transaction = await arweave.createDriveTransaction(
				encryptedDriveMetaData.data,
				driveMetaData,
				walletPrivateKey
			);
		} else {
			// The drive is public
			console.log('Creating a new Public Drive (name: %s) on the Permaweb', driveMetaData.name);
			transaction = await arweave.createDriveTransaction(driveMetaDataJSON, driveMetaData, walletPrivateKey);
		}
		// Update the file's data transaction ID
		driveMetaData.txId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { driveMetaData, uploader };
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', driveMetaData.name);
		return 'Error';
	}
}

// This will create and upload a new drive entity and its root folder
export async function arfsNewDriveAndRootFolder(
	appName: string,
	appVersion: string,
	driveName: string,
	isPrivate: boolean,
	walletPrivateKey?: JWKInterface,
	driveKey?: Buffer
): Promise<boolean> {
	try {
		// Create a new ArFS Drive entity
		const newDrive = DriveEntity(appName, appVersion, driveName, isPrivate);

		// Prepare the drive transaction.  It will encrypt the data if necessary.
		const preppedDrive = await arfsNewDriveMetaData(newDrive, walletPrivateKey, driveKey);

		// Create a new ArFS Drive Root Folder entity
		if (typeof preppedDrive === 'string') {
			return false;
		} else {
			// Prepare the root folder transaction.  It will encrypt the data if necessary.
			const newRootFolder = FolderEntity(
				appName,
				appVersion,
				driveName,
				'0',
				preppedDrive.driveMetaData.driveId,
				isPrivate
			);
			const preppedRootFolder = await arfsNewFolderMetaData(newRootFolder, walletPrivateKey, driveKey);

			// Upload the drive entity transaction
			if (typeof preppedDrive !== 'string' && typeof preppedRootFolder !== 'string') {
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
		}
	} catch (err) {
		console.log(err);
		return false;
	}
}

// Creates a new ArFS Drive Entity object. Can pass in optional parameters for app name & version, drive name and privacy
export function DriveEntity(appName = '', appVersion = '', name = '', isPrivate?: boolean): types.ArFSDriveEntity {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	const drive: types.ArFSDriveEntity = {
		appName,
		appVersion,
		name,
		rootFolderId,
		cipher: '',
		cipherIV: '',
		unixTime,
		arFS: arFSVersion,
		driveId,
		drivePrivacy: 'public',
		driveAuthMode: '',
		txId: '',
		entityType: 'drive',
		contentType: 'application/json'
	};
	if (isPrivate) {
		drive.driveAuthMode = 'password';
		drive.drivePrivacy = 'private';
		drive.contentType = 'application/octet-stream';
		drive.cipher = cipher;
	}
	return drive;
}

// Creates a new ArFS Folder Entity object. Can pass in optional parameters for app name & version, drive id and privacy
export function FolderEntity(
	appName = '',
	appVersion = '',
	name = '',
	parentFolderId = '',
	driveId = '',
	isPrivate?: boolean
): types.ArFSFolderEntity {
	const uuid = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	const folder: types.ArFSFolderEntity = {
		appName,
		appVersion,
		arFS: arFSVersion,
		cipher: '',
		cipherIV: '',
		contentType: 'application/json',
		driveId,
		entityType: 'folder',
		uuid,
		name,
		parentFolderId,
		txId: '',
		unixTime
	};
	if (isPrivate) {
		folder.contentType = 'application/octet-stream';
		folder.cipher = cipher;
	}
	return folder;
}

// Creates a new ArFS File Entity object. Can pass in optional parameters for app name & version, drive id and privacy
export function FileEntity(
	appName = '',
	appVersion = '',
	name = '',
	parentFolderId = '',
	driveId = '',
	isPrivate?: boolean
): types.ArFSFileEntity {
	const uuid = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	const file: types.ArFSFileEntity = {
		appName,
		appVersion,
		arFS: arFSVersion,
		cipher: '',
		cipherIV: '',
		contentType: 'application/json',
		driveId,
		entityType: 'file',
		uuid,
		name,
		parentFolderId,
		txId: '',
		dataContentType: '',
		size: 0,
		lastModifiedDate: 0,
		unixTime
	};
	if (isPrivate) {
		file.contentType = 'application/octet-stream';
		file.cipher = cipher;
	}
	return file;
}

// Derives a file key from the drive key and formats it into a Private file sharing link using the file id
export async function createArFSPrivateFileSharingLink(
	user: types.ArDriveUser,
	fileToShare: types.ArFSFileMetaData
): Promise<string> {
	let fileSharingUrl = '';
	try {
		const driveKey: Buffer = await crypto.deriveDriveKey(
			user.dataProtectionKey,
			fileToShare.driveId,
			user.walletPrivateKey
		);
		const fileKey: Buffer = await crypto.deriveFileKey(fileToShare.fileId, driveKey);
		fileSharingUrl = stagingAppUrl.concat(
			'/#/file/',
			fileToShare.fileId,
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
export async function createArFSPublicFileSharingLink(fileToShare: types.ArFSFileMetaData): Promise<string> {
	let fileSharingUrl = '';
	try {
		fileSharingUrl = stagingAppUrl.concat('/#/file/', fileToShare.fileId, '/view');
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public File Sharing Link');
		fileSharingUrl = 'Error';
	}
	return fileSharingUrl;
}

// Creates a Public drive sharing link using the Drive Id
export async function createArFSPublicDriveSharingLink(driveToShare: types.ArFSDriveMetaData): Promise<string> {
	let driveSharingUrl = '';
	try {
		driveSharingUrl = stagingAppUrl.concat('/#/drives/', driveToShare.driveId);
	} catch (err) {
		console.log(err);
		console.log('Cannot generate Public Drive Sharing Link');
		driveSharingUrl = 'Error';
	}
	return driveSharingUrl;
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

// Tags and creates a new data item (ANS-102) to be bundled and uploaded
// OLD
export async function newArFSFileDataItem(
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData,
	fileData: Buffer
): Promise<{ fileMetaData: types.ArFSFileMetaData; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	try {
		if (fileMetaData.isPublic === 0) {
			// Private file, so it must be encrypted
			console.log(
				'Encrypting and bundling %s (%d bytes) to the Permaweb',
				fileMetaData.filePath,
				fileMetaData.fileSize
			);

			// Derive the keys needed for encryption
			const driveKey: Buffer = await crypto.deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await crypto.deriveFileKey(fileMetaData.fileId, driveKey);

			// Get the encrypted version of the file
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(fileKey, fileData);

			// Set the private file metadata
			fileMetaData.dataCipherIV;
			fileMetaData.cipher;

			// Get a signed data item for the encrypted data
			dataItem = await arweave.prepareArFSDataItemTransaction(user, encryptedData.data, fileMetaData);
		} else {
			console.log('Bundling %s (%d bytes) to the Permaweb', fileMetaData.filePath, fileMetaData.fileSize);
			const fileData = fs.readFileSync(fileMetaData.filePath);
			dataItem = await arweave.prepareArFSDataItemTransaction(user, fileData, fileMetaData);
		}
		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', fileMetaData.filePath, dataItem.id);

			// Set the file metadata to syncing
			fileMetaData.fileDataSyncStatus = 2;
			fileMetaData.dataTxId = dataItem.id;
			return { fileMetaData, dataItem };
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
// OLD
export async function newArFSFileMetaDataItem(
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData
): Promise<{ fileMetaData: types.ArFSFileMetaData; dataItem: DataItemJson } | null> {
	let dataItem: DataItemJson | null;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (fileMetaData.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName
			};
		} else if (fileMetaData.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName,
				size: fileMetaData.fileSize,
				lastModifiedDate: fileMetaData.lastModifiedDate,
				dataTxId: fileMetaData.dataTxId,
				dataContentType: fileMetaData.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (fileMetaData.isPublic === 1) {
			// Public file, do not encrypt
			dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, fileMetaData, secondaryFileMetaDataJSON);
		} else {
			// Private file, so it must be encrypted
			const driveKey: Buffer = await crypto.deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await crypto.deriveFileKey(fileMetaData.fileId, driveKey);
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			fileMetaData.metaDataCipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;
			dataItem = await arweave.prepareArFSMetaDataItemTransaction(user, fileMetaData, encryptedData.data);
		}
		if (dataItem != null) {
			console.log('SUCCESS %s data item was created with TX %s', fileMetaData.filePath, dataItem.id);
			// Set the file metadata to syncing
			fileMetaData.fileMetaDataSyncStatus = 2;
			fileMetaData.metaDataTxId = dataItem.id;
			return { fileMetaData, dataItem };
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
// OLD
export async function newArFSFileData(
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData,
	fileData: Buffer
): Promise<{ fileMetaData: types.ArFSFileMetaData; uploader: TransactionUploader } | null> {
	let transaction;
	try {
		if (fileMetaData.isPublic === 0) {
			// The file is private and we must encrypt
			console.log(
				'Encrypting and uploading the PRIVATE file %s (%d bytes) at %s to the Permaweb',
				fileMetaData.filePath,
				fileMetaData.fileSize
			);
			// Derive the drive and file keys in order to encrypt it with ArFS encryption
			const driveKey: Buffer = await crypto.deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await crypto.deriveFileKey(fileMetaData.fileId, driveKey);

			// Encrypt the data with the file key
			const encryptedData: types.ArFSEncryptedData = await crypto.getFileAndEncrypt(
				fileKey,
				fileMetaData.filePath
			);

			// Update the file metadata
			fileMetaData.dataCipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;

			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.prepareArFSDataTransaction(user, encryptedData.data, fileMetaData);
		} else {
			// The file is public
			console.log(
				'Uploading the PUBLIC file %s (%d bytes) at %s to the Permaweb',
				fileMetaData.filePath,
				fileMetaData.fileSize
			);

			// Create the Arweave transaction.  It will add the correct ArFS tags depending if it is public or private
			transaction = await arweave.prepareArFSDataTransaction(user, fileData, fileMetaData);
		}

		// Update the file's data transaction ID
		fileMetaData.dataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { fileMetaData, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Takes ArFS File (or folder) Metadata and creates an ArFS MetaData Transaction using V2 Transaction with proper GQL tags
// OLD
export async function newArFSFileMetaData(
	user: types.ArDriveUser,
	fileMetaData: types.ArFSFileMetaData
): Promise<{ fileMetaData: types.ArFSFileMetaData; uploader: TransactionUploader } | null> {
	let transaction;
	let secondaryFileMetaDataTags = {};
	try {
		// create secondary metadata, used to further ID the file (with encryption if necessary)
		if (fileMetaData.entityType === 'folder') {
			// create secondary metadata specifically for a folder
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName
			};
		} else if (fileMetaData.entityType === 'file') {
			secondaryFileMetaDataTags = {
				name: fileMetaData.fileName,
				size: fileMetaData.fileSize,
				lastModifiedDate: fileMetaData.lastModifiedDate,
				dataTxId: fileMetaData.dataTxId,
				dataContentType: fileMetaData.contentType
			};
		}

		// Convert to JSON string
		const secondaryFileMetaDataJSON = JSON.stringify(secondaryFileMetaDataTags);
		if (fileMetaData.isPublic === 1) {
			// Public file, do not encrypt
			transaction = await arweave.prepareArFSMetaDataTransaction(user, fileMetaData, secondaryFileMetaDataJSON);
		} else {
			// Private file, so the metadata must be encrypted
			// Get the drive and file key needed for encryption
			const driveKey: Buffer = await crypto.deriveDriveKey(
				user.dataProtectionKey,
				fileMetaData.driveId,
				user.walletPrivateKey
			);
			const fileKey: Buffer = await crypto.deriveFileKey(fileMetaData.fileId, driveKey);
			const encryptedData: types.ArFSEncryptedData = await crypto.fileEncrypt(
				fileKey,
				Buffer.from(secondaryFileMetaDataJSON)
			);

			// Update the file privacy metadata
			fileMetaData.metaDataCipherIV = encryptedData.cipherIV;
			fileMetaData.cipher = encryptedData.cipher;
			transaction = await arweave.prepareArFSMetaDataTransaction(user, fileMetaData, encryptedData.data);
		}

		// Update the file's data transaction ID
		fileMetaData.metaDataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { fileMetaData, uploader };
	} catch (err) {
		console.log(err);
		return null;
	}
}

// Creates an new Drive transaction and uploader using ArFS Metadata
// OLD
export async function newArFSDriveMetaData(
	user: types.ArDriveUser,
	driveMetaData: types.ArFSDriveMetaData
): Promise<{ driveMetaData: types.ArFSDriveMetaData; uploader: TransactionUploader } | null> {
	try {
		let transaction: Transaction;
		// Create a JSON file, containing necessary drive metadata
		const driveMetaDataTags = {
			name: driveMetaData.driveName,
			rootFolderId: driveMetaData.rootFolderId
		};

		// Convert to JSON string
		const driveMetaDataJSON = JSON.stringify(driveMetaDataTags);

		// Check if the drive is public or private
		if (driveMetaData.drivePrivacy === 'private') {
			console.log('Creating a new Private Drive (name: %s) on the Permaweb', driveMetaData.driveName);
			const driveKey: Buffer = await crypto.deriveDriveKey(
				user.dataProtectionKey,
				driveMetaData.driveId,
				user.walletPrivateKey
			);
			const encryptedDriveMetaData: types.ArFSEncryptedData = await crypto.driveEncrypt(
				driveKey,
				Buffer.from(driveMetaDataJSON)
			);
			driveMetaData.cipher = encryptedDriveMetaData.cipher;
			driveMetaData.cipherIV = encryptedDriveMetaData.cipherIV;
			transaction = await arweave.prepareArFSDriveTransaction(user, encryptedDriveMetaData.data, driveMetaData);
		} else {
			// The drive is public
			console.log('Creating a new Public Drive (name: %s) on the Permaweb', driveMetaData.driveName);
			transaction = await arweave.prepareArFSDriveTransaction(user, driveMetaDataJSON, driveMetaData);
		}
		// Update the file's data transaction ID
		driveMetaData.metaDataTxId = transaction.id;

		// Create the File Uploader object
		const uploader = await arweave.createDataUploader(transaction);

		return { driveMetaData, uploader };
	} catch (err) {
		console.log(err);
		console.log('Error creating new ArFS Drive transaction and uploader %s', driveMetaData.driveName);
		return null;
	}
}

// This will create and upload a new drive entity and its root folder
// OLD
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
		const newRootFolderMetaData: types.ArFSFileMetaData = {
			id: 0,
			login: user.login,
			appName: appName,
			appVersion: appVersion,
			unixTime: Math.round(Date.now() / 1000),
			contentType: 'application/json',
			entityType: 'folder',
			driveId: newDrive.driveId,
			parentFolderId: '0', // Must be set to 0 to indicate it is a root folder
			fileId: newDrive.rootFolderId,
			fileSize: 0,
			fileName: driveName,
			fileHash: '',
			filePath: '',
			fileVersion: 0,
			cipher: '',
			dataCipherIV: '',
			metaDataCipherIV: '',
			lastModifiedDate: Math.round(Date.now() / 1000),
			isLocal: 0,
			isPublic,
			permaWebLink: '',
			metaDataTxId: '0',
			dataTxId: '0',
			fileDataSyncStatus: 0,
			fileMetaDataSyncStatus: 0,
			cloudOnly: 0
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

// Creates a new drive depending on the privacy
// This should be in the Drive class
// OLD
export async function newArFSDrive(
	driveName: string,
	drivePrivacy: string,
	login?: string
): Promise<types.ArFSDriveMetaData> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	if (drivePrivacy === 'private') {
		console.log('Creating a new private drive %s | %s', driveName, driveId);
		const drive: types.ArFSDriveMetaData = {
			id: 0,
			login,
			appName: appName,
			appVersion: appVersion,
			driveName,
			rootFolderId,
			cipher: cipher,
			cipherIV: '',
			unixTime,
			arFS: arFSVersion,
			driveId,
			driveSharing: 'personal',
			drivePrivacy: 'private',
			driveAuthMode: 'password',
			metaDataTxId: '0',
			metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
			isLocal: 1
		};
		return drive;
	} else {
		// Drive is public
		console.log('Creating a new public drive %s | %s', driveName, driveId);
		const drive: types.ArFSDriveMetaData = {
			id: 0,
			login,
			appName: appName,
			appVersion: appVersion,
			driveName,
			rootFolderId,
			cipher: '',
			cipherIV: '',
			unixTime,
			arFS: arFSVersion,
			driveId,
			driveSharing: 'personal',
			drivePrivacy: 'public',
			driveAuthMode: '',
			metaDataTxId: '0',
			metaDataSyncStatus: 0, // Drives are lazily created once the user performs an initial upload
			isLocal: 1
		};
		return drive;
	}
}
