import { JWKInterface } from 'arweave/node/lib/wallet';

export interface Wallet {
	walletPrivateKey: JWKInterface;
	walletPublicKey: string;
}

export interface ArDriveUser {
	login: string;
	dataProtectionKey: string;
	walletPrivateKey: string;
	walletPublicKey: string;
	syncFolderPath: string;
	autoSyncApproval: number;
}

export interface UploadBatch {
	totalArDrivePrice: number;
	totalUSDPrice: number;
	totalSize: string;
	totalNumberOfFileUploads: number;
	totalNumberOfMetaDataUploads: number;
	totalNumberOfFolderUploads: number;
}

export interface ArFSRootFolderMetaData {
	metaDataTxId: string;
	cipher: string;
	cipherIV: string;
}

export interface ArDriveBundle {
	id: number;
	login: string;
	bundleTxId: string;
	bundleSyncStatus: number;
	uploadTime: number;
}

export interface ArFSDriveMetaData {
	id: number;
	login?: string;
	appName: string;
	appVersion: string;
	driveName: string;
	rootFolderId: string;
	cipher: string;
	cipherIV: string;
	unixTime: number;
	arFS: string;
	driveId: string;
	driveSharing?: string;
	drivePrivacy: string;
	driveAuthMode: string;
	metaDataTxId: string;
	metaDataSyncStatus: number;
	isLocal?: number;
}

export interface ArFSFileMetaData {
	id: number;
	login: string;
	appName: string;
	appVersion: string;
	unixTime: number;
	contentType: string;
	entityType: string;
	driveId: string;
	parentFolderId: string;
	fileId: string;
	fileSize: number;
	fileName: string;
	fileHash: string;
	filePath: string;
	fileVersion: number;
	cipher: string;
	dataCipherIV: string;
	metaDataCipherIV: string;
	lastModifiedDate: number;
	isLocal: number;
	isPublic: number;
	permaWebLink: string;
	metaDataTxId: string;
	dataTxId: string;
	fileDataSyncStatus: number;
	fileMetaDataSyncStatus: number;
	cloudOnly: number;
}

export interface ArFSEncryptedData {
	cipher: string;
	cipherIV: string;
	data: Buffer;
}

// Arweave GraphQL Interfaces
export interface GQLPageInfoInterface {
	hasNextPage: boolean;
}

export interface GQLOwnerInterface {
	address: string;
	key: string;
}

export interface GQLAmountInterface {
	winston: string;
	ar: string;
}

export interface GQLMetaDataInterface {
	size: number;
	type: string;
}

export interface GQLTagInterface {
	name: string;
	value: string;
}

export interface GQLBlockInterface {
	id: string;
	timestamp: number;
	height: number;
	previous: string;
}

export interface GQLNodeInterface {
	id: string;
	anchor: string;
	signature: string;
	recipient: string;
	owner: GQLOwnerInterface;
	fee: GQLAmountInterface;
	quantity: GQLAmountInterface;
	data: GQLMetaDataInterface;
	tags: GQLTagInterface[];
	block: GQLBlockInterface;
	parent: {
		id: string;
	};
}

export interface GQLEdgeInterface {
	cursor: string;
	node: GQLNodeInterface;
}

export interface GQLTransactionsResultInterface {
	pageInfo: GQLPageInfoInterface;
	edges: GQLEdgeInterface[];
}

export default interface GQLResultInterface {
	data: {
		transactions: GQLTransactionsResultInterface;
	};
}

// A Drive is a logical grouping of folders and files. All folders and files must be part of a drive, and reference the Drive ID.
// When creating a Drive, a corresponding folder must be created as well. This folder will act as the Drive Root Folder.
// This seperation of drive and folder entity enables features such as folder view queries.
export interface ArFSDriveEntity {
	appName: string; // The app that has submitted this entity
	appVersion: string; // The app version that has submitted this entity
	arFS: string; // 0.11
	cipher?: string; // AES-256-GCM
	cipherIV?: string; // <12 byte initialization vector as base 64>
	contentType: string; // <application/json | application/octet-stream>
	driveAuthMode?: string; // password
	driveId: string; // <uuid>
	drivePrivacy: string; // <public | private>
	entityType: string; // drive
	name: string; // <user defined drive name>
	rootFolderId: string; // <uuid of the drive root folder>
	txId?: string; // <arweave transaction id>
	unixTime: number; // <seconds since unix epoch>
}

// A Folder is a logical grouping of other folders and files. Folder entity metadata transactions without a parent folder id are considered the Drive Root Folder of their corresponding Drives. All other Folder entities must have a parent folder id.
// Since folders do not have underlying data, there is no Folder data transaction required.
export interface ArFSFolderEntity {
	appName: string; // The app that has submitted this entity
	appVersion: string; // The app version that has submitted this entity
	arFS: string; // 0.11
	cipher?: string; // AES-256-GCM
	cipherIV?: string; // <12 byte initialization vector as base 64>
	contentType: string; // <application/json | application/octet-stream>
	driveId: string; // <uuid>
	entityType: string; // folder
	folderId: string; // <uuid>
	name: string; // <user defined folder name>
	parentFolderId: string; // <parent folder uuid>
	txId?: string; // <arweave transaction id>
	unixTime: number; // <seconds since unix epoch>
}

// A File contains actual data, like a photo, document or movie.
// The File metadata transaction JSON references the File data transaction for retrieval.
// This separation allows for file metadata to be updated without requiring the file data to be reuploaded.
export interface ArFSFileEntity {
	appName: string;
	appVersion: string;
	arFS: string; // 0.11
	cipher?: string; // AES-256-GCM
	cipherIV?: string; // <12 byte initialization vector as base 64>
	contentType: string; // <12 byte initialization vector as base 64>
	dataContentType: string; // <the mime type of the data associated with this file entity>
	dataTxId?: string; // <arweave transaction id of underlying data for this transaction>
	driveId: string; // <uuid>
	entityType: string; // file
	fileId: string; // <uuid>
	name: string; // <user defined file name with extension eg. happyBirthday.jpg>
	parentFolderId: string; // <parent folder uuid>
	size: number; // <computed file size - int>
	lastModifiedDate: number; // <timestamp for OS reported time of file's last modified date represented as milliseconds since unix epoch - int>
	txId?: string; // <arweave transaction id>
	unixTime: number; // <seconds since unix epoch>
}

// File entity metadata transactions do not include the actual File data they represent.
// Instead, the File data must be uploaded as a separate transaction, called the File data transaction.
export interface ArFSFileEntityData {
	appName: string; // The app that has submitted this entity
	appVersion: string; // The app version that has submitted this entity
	cipher?: string; // AES-256-GCM
	cipherIV?: string; // <12 byte initialization vector as base 64>
	contentType: string; // <12 byte initialization vector as base 64>
	txId?: string; // <arweave transaction id>
	unixTime: number; // <seconds since unix epoch>
}
