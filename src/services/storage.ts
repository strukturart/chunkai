import { StorageName } from '../enums';

type Request<T> = {
	error?: Error;
	result: T;
	onsuccess: () => void;
	onerror: () => void;
};

type DeviceStorage = {
	storageName: string;
	get: (filePath: string) => Request<File>;
	addNamed: (file: File | Blob, filePath: string) => Request<File>;
	appendNamed: (file: File | Blob, filePath: string) => Request<File>;
	delete: (filePath: string) => Request<void>;
	enumerate: any;
};

type KaiNavigator = Navigator & {
	getDeviceStorage?: (name: StorageName) => DeviceStorage;
	b2g?: {
		getDeviceStorage: (name: StorageName) => DeviceStorage;
	};
};

export class Storage {
	private static navigator: KaiNavigator = window.navigator as KaiNavigator;

	
	private static getStorage(storageName: StorageName): DeviceStorage {
		if (this.navigator.b2g?.getDeviceStorage) {
			// KaiOS 3.0
			return this.navigator.b2g.getDeviceStorage(storageName);
		}

		if (this.navigator.getDeviceStorage) {
			// KaiOS 2.5
			return this.navigator.getDeviceStorage(storageName);
		}

		throw new Error('DeviceStorage API not supported');
	}

	static get(storageName: StorageName, filePath: string): Promise<File> {
		return new Promise((resolve, reject) => {
			const request = this.getStorage(storageName).get(filePath);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	static getAsFileUrl(storageName: StorageName, filePathAndName: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const request = this.getStorage(storageName).get(filePathAndName);
			request.onsuccess = () => resolve(URL.createObjectURL(request.result));
			request.onerror = () => reject(request.error);
		});
	}

	static addNamed(
		storageName: StorageName,
		file: Blob | File,
		filePathAndName: string
	): Promise<File> {
		return new Promise((resolve, reject) => {
			const request = this.getStorage(storageName).addNamed(file, filePathAndName);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	static appendNamed(
		storageName: StorageName,
		file: Blob | File,
		filePathAndName: string
	): Promise<File> {
		return new Promise((resolve, reject) => {
			const request = this.getStorage(storageName).appendNamed(file, filePathAndName);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
	}

	static delete(storageName: StorageName, filePathAndName: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = this.getStorage(storageName).delete(filePathAndName);
			request.onsuccess = () => resolve();
			request.onerror = () => reject(request.error);
		});
	}

	static getActualStorageName(storageName: StorageName): string {
		return this.getStorage(storageName)?.storageName;
	}
}