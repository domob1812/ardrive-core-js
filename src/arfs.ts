// arfs.js
import * as arweave from './arweave';
import * as fs from 'fs';
import * as types from './types/base_Types';
import * as clientTypes from './types/client_Types';
import { fileEncrypt, deriveDriveKey, deriveFileKey, getFileAndEncrypt } from './crypto';
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
