import { ArDriveUser } from './types/base_Types';
import { ArFSLocalFile, ArFSLocalDriveEntity } from './types/client_Types';
import { deriveDriveKey, deriveFileKey } from './crypto';

export const stagingAppUrl = 'https://staging.ardrive.io';

// Derives a file key from the drive key and formats it into a Private file sharing link using the file id
export async function createArFSPrivateFileSharingLink(user: ArDriveUser, fileToShare: ArFSLocalFile): Promise<string> {
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
export async function createArFSPublicFileSharingLink(fileToShare: ArFSLocalFile): Promise<string> {
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
export async function createArFSPublicDriveSharingLink(driveToShare: ArFSLocalDriveEntity): Promise<string> {
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
