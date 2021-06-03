import { arFSVersion } from '../common';
import * as arfsTpes from '../types/arfs_Types';
import { ArFSRootFolderMetaData } from '../types/base_Types';
import { GQLEdgeInterface } from '../types/gql_Types';
import { PrivacyToDriveEntity } from '../types/type_conditionals';
import { cipherType, drivePrivacy } from '../types/type_guards';
import { EntityQuery } from './EntityQuery';
import { NODE_ID_AND_TAGS_PARAMETERS, Query } from './Query';

const entityType = 'drive';

export const getPrivateDriveEntity = getDriveEntity.bind(this, drivePrivacy.PRIVATE);

export const getPublicDriveEntity = getDriveEntity.bind(this, drivePrivacy.PUBLIC);

export const getSharedPublicDrive = getDriveEntity.bind(this, drivePrivacy.PUBLIC);

export const getAllPrivateDriveEntities = getAllDriveEntities.bind(this, drivePrivacy.PRIVATE);

export const getAllPublicDriveEntities = getAllDriveEntities.bind(this, drivePrivacy.PUBLIC);

async function getDriveEntity<P extends drivePrivacy>(privacy: P, driveId: string): Promise<PrivacyToDriveEntity<P>> {
	const query = new EntityQuery<PrivacyToDriveEntity<P>>({
		entityType,
		entityId: driveId,
		privacy
	});
	const drive = (await query.get())[0];
	return drive;
}

export async function getPublicDriveRootFolderTxId<P extends drivePrivacy>(
	driveId: string,
	folderId: string
): Promise<string> {
	const query = getDriveRootFolderQuery(driveId, folderId);
	const transaction = (await query.getRaw())[0];
	const metaDataTxId = getMetaDataTxIdFrom(transaction);
	return metaDataTxId;
}

export async function getPrivateDriveRootFolderTxId(
	driveId: string,
	folderId: string
): Promise<ArFSRootFolderMetaData> {
	const query = getDriveRootFolderQuery(driveId, folderId);
	query.parameters = NODE_ID_AND_TAGS_PARAMETERS;
	const transaction = (await query.getRaw())[0];
	const tags = transaction.node.tags;
	const cipher = tags.find((tag) => tag.name === 'Cipher')?.value as cipherType;
	const cipherIV = tags.find((tag) => tag.name === 'CipherIV')?.value;
	const metaDataTxId = getMetaDataTxIdFrom(transaction);
	const folderMetadata = new ArFSRootFolderMetaData({
		metaDataTxId,
		cipher,
		cipherIV
	});
	return folderMetadata;
}

function getMetaDataTxIdFrom(transaction: GQLEdgeInterface): string {
	let metaDataTxId = '0';
	if (transaction) {
		metaDataTxId = transaction.node.id;
	}
	return metaDataTxId;
}

function getDriveRootFolderQuery(driveId: string, folderId: string): Query {
	const query = new Query();
	query.first = 1;
	query.tags = [
		{ name: 'ArFS', values: arFSVersion },
		{ name: 'Drive-Id', values: driveId },
		{ name: 'Folder-Id', values: folderId }
	];
	return query;
}

async function getAllDriveEntities<P extends drivePrivacy>(
	privacy: P,
	owner: string,
	lastBlockHeight: number
): Promise<PrivacyToDriveEntity<P>[]> {
	const query = new EntityQuery<arfsTpes.IDriveEntity>({ entityType, owner, privacy, lastBlockHeight });
	const privateDrives = await query.get();
	return privateDrives.map((e) => new arfsTpes.ArFSDriveEntity(e));
}