import loki from 'lokijs';
import { ArFSLocalDriveEntity } from '../types/client_Types';

let db: loki | null;

////////////////////////
// DB SETUP FUNCTIONS //
////////////////////////
// Main entrypoint for database. MUST call this before anything else can happen
export const setupDatabase = async (dbName: string): Promise<Error | null> => {
	try {
		db = new loki(dbName, {
			autoload: true,
			autoloadCallback: createTablesInDB,
			autosave: true,
			autosaveInterval: 4000
		});
	} catch (err) {
		return err;
	}
	return null;
};

// Sets up each table needed for ArDrive.  All file metadata is stored in the sync table.
const createTablesInDB = () => {
	if (db.getCollection('drives') != null) db.addCollection('drives', { indices: ['id'] });
};

export const drivesCollection = db.getCollection('drives');
export const sync = db.getCollection('sync');

export function saveDrivesToDB(drives: ArFSLocalDriveEntity[]) {
	return drivesCollection.insert(drives);
}

export function getDrivesFromDB(owner: string): ArFSLocalDriveEntity[] {
	return drivesCollection.where((drive: ArFSLocalDriveEntity) => drive.owner == owner);
}
