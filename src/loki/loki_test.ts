import loki from 'lokijs';
import { ArFSLocalDriveEntity } from '../types/client_Types';

let db: loki | null;

////////////////////////
// DB SETUP FUNCTIONS //
////////////////////////
// Main entrypoint for database. MUST call this before anything else can happen
export const setupLoki = async (dbName: string): Promise<Error | null> => {
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
enum Collections {
	drives
}
// Sets up each table needed for ArDrive.  All file metadata is stored in the sync table.
const createTablesInDB = () => {
	if (db != null) if (db.getCollection('drives') != null) db.addCollection('drives', { indices: ['id'] });
};

export function saveDrivesToDB(drives: ArFSLocalDriveEntity[]) {
	return db?.getCollection(Collections.drives.toString()).insert(drives);
}

export function getDrivesFromDB(owner: string): ArFSLocalDriveEntity[] {
	return (
		db?.getCollection(Collections.drives.toString()).where((drive: ArFSLocalDriveEntity) => drive.owner == owner) ??
		[]
	);
}
