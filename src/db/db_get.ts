import { get, all } from './db_common';

/* New Get Functions 

getDrive


*/

///////////////////////////////
// GET SINGLE ITEM FUNCTIONS //
///////////////////////////////
// YES
// getLocalFolderByPath, getLocalPrivateFolderByPath
// Used in files.ts to match a found folder to a record in the local database, using the folders path.  folder paths are always unique.
// Split to public/private methods, returning LocalFolder/LocalPrivateFolder types
export const getFolderFromSyncTable = (driveId: string, filePath: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND filePath = ? AND entityType = 'folder'`, [driveId, filePath]);
};

// YES
// getLocalFolderByHash, getLocalPrivateFolderByHash
// Used in files.ts to match a found folder to a record in the local database, specifically used to determine if a folder has been MOVED by comparing their hash
// Split to public/private methods, returning LocalFolder/LocalPrivateFolder types
export const getFolderByHashFromSyncTable = (driveId: string, fileHash: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileHash = ? AND entityType = 'folder'`, [driveId, fileHash]);
};

// YES
// getLocalFolderBySize, getLocalPrivateFolderBySize
// Used in files.ts to match a found folder to a record in the local database, specifically used to determine if a folder has been RENAMED by checking its INode aka filesize
// Split to public/private methods, returning LocalFolder/LocalPrivateFolder types
export const getFolderByInodeFromSyncTable = (driveId: string, fileSize: number) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileSize = ? AND entityType = 'folder' AND isLocal = 1`, [
		driveId,
		fileSize
	]);
};

// NO, not used anywhere
export const checkIfExistsInSyncTable = (fileHash: string, fileName: string, fileId: string) => {
	return get(`SELECT * FROM Sync WHERE fileHash = ? AND fileName AND fileId = ?`, [fileHash, fileName, fileId]);
};

// YES
// getLocalFileByHashAndParent, getLocalPrivateFileByHashAndParent
// Used in files.ts to match a found file to a record in the local database, specifically used to determine if a file has been RENAMED by comparing hash and path
// Split to public/private methods, returning LocalFile/LocalPrivateFile types
export const getByFileHashAndParentFolderFromSyncTable = (driveId: string, fileHash: string, folderPath: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileHash = ? AND filePath LIKE ?`, [
		driveId,
		fileHash,
		folderPath
	]);
};

// YES
// getLocalFileByHashAndName, getLocalPrivateFileByHashAndName
// Used in files.ts to match a found file to a record in the local database, specifically used to determine if a file has been MOVED by seeing if a similarly named file and hash are already in the database
// Split to public/private methods, returning LocalFile/LocalPrivateFile types
export const getByFileHashAndFileNameFromSyncTable = (driveId: string, fileHash: string, fileName: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileHash = ? AND fileName = ?`, [driveId, fileHash, fileName]);
};

// YES
// getLocalFileByPath, getLocalPrivateFileByPath
// Used in files.ts to match a found file to a record in the local database, specifically used to determine if it is a new version of an existing file by using a descending sort of the fileVersion
// Split to public/private methods, returning LocalFile/LocalPrivateFile types
export const getByFilePathFromSyncTable = (driveId: string, filePath: string) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND filePath = ? ORDER BY fileVersion DESC`, [driveId, filePath]);
};

// YES
// getExactLocalFile, getExactLocalPrivateFile
// Used in files.ts to match a found file to a record in the local database, specifically used to match an exact file via filename, hash and parent folder
// Split to public/private methods, returning LocalFile/LocalPrivateFile types
export const getByFileNameAndHashAndParentFolderIdFromSyncTable = (
	driveId: string,
	fileName: string,
	fileHash: string,
	parentFolderId: string
) => {
	return get(`SELECT * FROM Sync WHERE driveId = ? AND fileName = ? AND fileHash = ? AND parentFolderId = ?`, [
		driveId,
		fileName,
		fileHash,
		parentFolderId
	]);
};

// YES
// getLatestLocalFile, getLatestLocalPrivateFile, getLatestLocalFolder, getLatestLocalPrivateFolder
// Used in download.ts and gets the latest file or folder version of a given entityId
// Needs to be split to public/private files/folders and returns local public/private folder/file types
export const getLatestFileVersionFromSyncTable = (fileId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [fileId]);
};

// YES
// getPreviousLocalFile, getPreviousLocalPrivateFile, getPreviousLocalFolder, getPreviousLocalPrivateFolder
// Used in download.ts and returns the n-1 version of a file or folder (aka the previous version) using a given entityId
// Needs to be split to public/private files/folders, returns local public/private folder types
export const getPreviousFileVersionFromSyncTable = (fileId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC LIMIT 1 OFFSET 1`, [fileId]);
};

// NO
// Duplicate above
export const getLatestFolderVersionFromSyncTable = (folderId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [folderId]);
};

// YES
// getLocalDriveRootFolder, getLocalPrivateDriveRootFolder
// Used in common.ts and gets a drive's root folder by selecting the folder with a parent ID of 0
// Needs to be split to public/private drives, returns local public/private folder types
export const getRootFolderPathFromSyncTable = (driveId: string) => {
	return get(`SELECT filePath from Sync WHERE parentFolderId = '0' and driveId = ?`, [driveId]);
};

// NO
// Can use getLatestLocalFolder, getLatestLocalPrivateFolder defined above
export const getDriveRootFolderFromSyncTable = (folderId: string) => {
	return get(`SELECT * FROM Sync WHERE fileId = ? AND entityType = 'folder'`, [folderId]);
};

// NO
// Can use getLocalDrive and getLocalPrivateDrive
export const getDriveInfoFromSyncTable = (id: string) => {
	return get(`SELECT driveId, fileId, fileName FROM Sync WHERE id = ?`, [id]);
};

// NO
// Can use getLatestLocalFolder, getLatestLocalPrivateFolder defined above
export const getFolderNameFromSyncTable = (fileId: string) => {
	return get(`SELECT fileName FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [fileId]);
};

// NO
// Can use getLatestLocalFolder, getLatestLocalPrivateFolder defined above
export const getFolderEntityFromSyncTable = (fileId: string) => {
	return get(`SELECT entityType FROM Sync WHERE fileId = ?`, [fileId]);
};

// NO
// Can use getLatestLocalFolder, getLatestLocalPrivateFolder defined above
export const getFolderParentIdFromSyncTable = (fileId: string) => {
	return get(`SELECT parentFolderId FROM Sync WHERE fileId = ? ORDER BY unixTime DESC`, [fileId]);
};

// NO
// Can use getLatestLocalFolder, getLatestLocalPrivateFolder defined above
export const getFileUploadTimeFromSyncTable = (id: number): Promise<number> => {
	return get(`SELECT uploadTime FROM Sync WHERE id = ?`, [id]);
};

// YES
// getBundle
// Used in node.ts to get an ArFSBundle from the local database
export const getBundleUploadTimeFromBundleTable = (id: number): Promise<number> => {
	return get(`SELECT uploadTime FROM Bundle WHERE id = ?`, [id]);
};

// YES
// getLocalFileByTx, getLocalPrivateFileByTx, getLocalFolderByTx, getLocalPrivateFolderByTx
// Used in download.ts to check if a file on arweave has already been synced into the database
// split into public/private files and folders, returns the Local Public/Private File/Folder types
export const getByMetaDataTxFromSyncTable = (metaDataTxId: string) => {
	return get(`SELECT * FROM Sync WHERE metaDataTxId = ?`, [metaDataTxId]);
};

// YES
// getUserLastBlockHeight
// Used in download.ts to get the last blockheight synced for a user, specifically used to sync Drive Entities.
// Only needs to return block height
export const getProfileLastBlockHeight = (login: string) => {
	return get(`SELECT lastBlockHeight FROM Profile WHERE login = ?`, [login]);
};

// YES
// getUserLastBlockHeight
// Used in download.ts to get the last blockheight synced for a user, specifically used to sync Drive Entities.
export const getDriveLastBlockHeight = (driveId: string) => {
	return get(`SELECT lastBlockHeight FROM Drive WHERE driveId = ?`, [driveId]);
};

// NO
export const getUserFromProfileById = (id: string) => {
	return get(`SELECT * FROM Profile WHERE id = ?`, [id]);
};

// YES
// getUser
// Used to get a user object from the database using their owner name aka arweave wallet public key and returns a user object including wallet
export const getUserFromProfile = (login: string) => {
	return get(`SELECT * FROM Profile WHERE login = ?`, [login]);
};

// YES
// getUserWalletBalance
// Used in the CLI and gets the locally saved wallet balance (in AR) for a given owner name
export const getProfileWalletBalance = (login: string) => {
	return get(`SELECT walletBalance FROM Profile WHERE login = ?`, [login]);
};

// NO
// Can use new getUser
export const getSyncFolderPathFromProfile = (login: string) => {
	return get(`SELECT syncFolderPath FROM Profile WHERE login = ?`, [login]);
};

// YES
// getLocalDrive, getLocalPrivateDrive
// Used in download.ts and gets a Local drive entity by using the driveId
// Needs to be split into public/, returns public/private local drive types
export const getDriveFromDriveTable = (driveId: string) => {
	return get(`SELECT * FROM Drive WHERE driveId = ?`, [driveId]);
};

///////////////////////////////
// GET ALL ITEMS FUNCTIONS   //
///////////////////////////////

// YES
// getAllRecentlyUploadedDrives, getAllRecentlyUploadedPrivateDrives
// Used in node.ts and gets all drives for a user that have been uploaded to the arweave network, but not confirmed yet (syncStatus = 2)
// Returns all Local Public/Private drives in an array
export const getAllUploadedDrivesFromDriveTable = () => {
	// should accept a user login
	return all(`SELECT * FROM Drive WHERE metaDataSyncStatus = 2`);
};

// YES
// getFilesToDownload, getPrivateFilesToDownload
// Used in download.ts gets all queued files for download for a user, using several parameters
// cloudOnly has to be false, or else we wouldnt download this file
// isLocal also has to be false, indicating that we have to download this file
// Returns all local Public/Private files to be downloaded in an array
export const getFilesToDownload = (login: string) => {
	return all(`SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 0 AND entityType = 'file' AND login = ?`, [login]);
};

// YES
// getFoldersToCreate, getPrivateFilesToCreate
// Used in download.ts gets all queued folders for creation for a user (since folders are just metadata and not downloaded), using several parameters
// cloudOnly has to be false, or else we wouldnt download this file
// isLocal also has to be false, indicating that we have to download this file
// Returns all local Public/Private folders to be created in an array
export const getFoldersToCreate = (login: string) => {
	return all(`SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 0 AND entityType = 'folder' AND login = ?`, [
		login
	]);
};

// YES
// getFilesFoldersByParent, getPrivateFilesFoldersByParent
// Used in common.ts to set the paths of all children in a folder
// returns all of the local files and folders that have the same parent folder id.
export const getFilesAndFoldersByParentFolderFromSyncTable = (parentFolderId: string) => {
	return all(`SELECT * FROM Sync WHERE isLocal = 1 AND parentFolderId = ?`, [parentFolderId]);
};

export const getNewDrivesFromDriveTable = (login: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND metaDataTxId = '0'`, [login]);
};

export const getAllFilesByLoginFromSyncTable = (login: string) => {
	return all(`SELECT * FROM Sync WHERE login = ? ORDER BY unixTime DESC`, [login]);
};

export const getFilesToUploadFromSyncTable = (login: string) => {
	return all(`SELECT * FROM Sync WHERE (login = ?) AND (fileDataSyncStatus = 1 OR fileMetaDataSyncStatus = 1)`, [
		login
	]);
};

export const getAllUploadedBundlesFromBundleTable = (login: string) => {
	return all(`SELECT * FROM Bundle WHERE (login = ?) AND (bundleSyncStatus = 2)`, [login]);
};

export const getAllUploadedDataItemsFromSyncTable = (login: string, bundleTxId: string) => {
	return all(`SELECT * FROM Sync WHERE login = ? AND bundleTxId = ?`, [login, bundleTxId]);
};

export const getAllUploadedFilesFromSyncTable = (login: string) => {
	return all(`SELECT * FROM Sync WHERE (login = ?) AND (fileDataSyncStatus = 2 OR fileMetaDataSyncStatus = 2)`, [
		login
	]);
};

export const getMyFileDownloadConflicts = (login: string) => {
	return all(`SELECT * FROM Sync WHERE isLocal = 2 AND login = ?`, [login]);
};

export const getAllMissingPathsFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE filePath = '' ORDER BY id DESC`);
};

export const getAllMissingParentFolderIdsFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE parentFolderId = ''`);
};

export const getAllLocalFoldersFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE entityType = 'folder' AND isLocal = 1`);
};

export const getAllLocalFilesFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE entityType = 'file' AND isLocal = 1`);
};

export const getAllLocalFilesAndFoldersFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE entityType = 'file' AND entityType = 'folder' AND isLocal = 1`);
};

export const getAllUnhashedLocalFilesFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE fileHash = '' AND entityType = 'file' AND isLocal = 1`);
};

// Gets all files that are not Cloud Only so they can be validated they still exist locally
export const getAllLatestFileAndFolderVersionsFromSyncTable = () => {
	return all(`SELECT * FROM Sync WHERE cloudOnly = 0 AND isLocal = 1`);
};

export const getAllFromProfile = () => {
	return all(`SELECT * FROM Profile`);
};

export const getAllDrivesFromDriveTable = () => {
	return all(`SELECT * FROM Drive`);
};

export const getAllDrivesByLoginFromDriveTable = (login: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND isLocal = 1`, [login]);
};

export const getAllUnSyncedPersonalDrivesByLoginFromDriveTable = (login: string, drivePrivacy: string) => {
	return all(
		`SELECT * FROM Drive WHERE login = ? AND drivePrivacy = ? AND driveSharing = 'personal' AND isLocal != 1 AND driveName != 'Invalid Drive Password'`,
		[login, drivePrivacy]
	);
};

export const getAllPersonalDrivesByLoginFromDriveTable = (login: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND driveSharing = 'personal' AND isLocal = 1`, [login]);
};

export const getAllDrivesByPrivacyFromDriveTable = (login: string, driveSharing: string, drivePrivacy: string) => {
	return all(`SELECT * FROM Drive WHERE login = ? AND driveSharing = ? AND drivePrivacy = ? AND isLocal = 1`, [
		login,
		driveSharing,
		drivePrivacy
	]);
};
