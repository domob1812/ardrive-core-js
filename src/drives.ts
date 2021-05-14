import * as arweave from './arweave';
import * as arweavePrivate from './arweave_private';
import { TransactionUploader } from 'arweave/node/lib/transaction-uploader';

import { ArDriveUser, ArFSEncryptedData } from './types/base_Types';
import { ArFSLocalFile, ArFSLocalDriveEntity, ArFSLocalPrivateDriveEntity } from './types/client_Types';
import { newArFSFileMetaData } from './arfs';
import { v4 as uuidv4 } from 'uuid';
import { deriveDriveKey, driveEncrypt } from './crypto';
import { JWKInterface } from 'arweave/node/lib/wallet';

export const appName = 'ArDrive-Desktop';
export const webAppName = 'ArDrive-Web';
export const appVersion = '0.1.0';
export const arFSVersion = '0.11';
export const cipher = 'AES256-GCM';

// Creates an new Drive transaction and uploader using ArFS Metadata
export async function newArFSDriveMetaData(
	walletPrivateKey: JWKInterface,
	driveMetaData: ArFSLocalDriveEntity
): Promise<{ driveMetaData: ArFSLocalDriveEntity; uploader: TransactionUploader } | null> {
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
		const transaction = await arweave.createDriveTransaction(
			driveMetaDataJSON,
			driveMetaData.entity,
			walletPrivateKey
		);

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
	user: ArDriveUser,
	walletPrivateKey: JWKInterface,
	driveMetaData: ArFSLocalPrivateDriveEntity
): Promise<{ driveMetaData: ArFSLocalPrivateDriveEntity; uploader: TransactionUploader } | null> {
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
		const encryptedDriveMetaData: ArFSEncryptedData = await driveEncrypt(driveKey, Buffer.from(driveMetaDataJSON));
		driveMetaData.entity.cipher = encryptedDriveMetaData.cipher;
		driveMetaData.entity.cipherIV = encryptedDriveMetaData.cipherIV;
		const transaction = await arweavePrivate.createPrivateDriveTransaction(
			encryptedDriveMetaData.data,
			driveMetaData.entity,
			walletPrivateKey
		);

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
export async function newArFSDrive(driveName: string, login: string): Promise<ArFSLocalDriveEntity> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);

	// Drive is public
	console.log('Creating a new public drive %s | %s', driveName, driveId);
	const drive: ArFSLocalDriveEntity = {
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
export async function newArFSPrivateDrive(driveName: string, login?: string): Promise<ArFSLocalDriveEntity> {
	const driveId = uuidv4();
	const rootFolderId = uuidv4();
	const unixTime = Math.round(Date.now() / 1000);
	console.log('Creating a new private drive %s | %s', driveName, driveId);
	const drive: ArFSLocalPrivateDriveEntity = {
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
	user: ArDriveUser,
	walletPrivateKey: JWKInterface,
	driveName: string,
	drivePrivacy: string
): Promise<boolean> {
	try {
		// Create a new ArFS Drive entity
		const newDrive = await newArFSDrive(driveName, drivePrivacy);

		// Prepare the drive transaction.  It will encrypt the data if necessary.
		const preppedDrive = await newArFSDriveMetaData(walletPrivateKey, newDrive);
		let isPublic = 1;
		if (drivePrivacy === 'private') {
			isPublic = 0;
		}

		// Create a new ArFS Drive Root Folder entity
		const newRootFolderMetaData: ArFSLocalFile = {
			id: 0,
			owner: user.walletPublicKey,
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
		const preppedRootFolder = await newArFSFileMetaData(walletPrivateKey, newRootFolderMetaData);

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
