import { Chunk, Progress } from '../models';

export class HttpClient {
	private options: HttpClientOptions;
	private xhr?: XMLHttpRequest;

	onProgress: (progress: Chunk) => void;
	onComplete: (progress: Progress) => void;
	onError: (err: Error) => void;

	constructor(options?: HttpClientOptions) {
		this.onProgress = () => {};
		this.onComplete = () => {};
		this.onError = () => {};
		this.options = Object.assign({ chunkByteLimit: 3145728 }, options);

		// 👉 nur KaiOS 2 nutzt XHR legacy streaming
		if (!this.isKaiOS3()) {
			const xhr = new (XMLHttpRequest as any)({
				mozSystem: true
			});
			xhr.responseType = 'moz-chunked-arraybuffer';
			this.xhr = xhr;
		}
	}

	private isKaiOS3(): boolean {
		return !!(navigator as any).b2g;
	}

	// =========================
	// PUBLIC API
	// =========================

	download(url: string): void {
		if (this.isKaiOS3()) {
			this.downloadKaiOS3(url);
		} else {
			this.downloadKaiOS2(url);
		}
	}

	abort(): void {
		this.xhr?.abort();
	}

	// =========================
	// KAIOS 2 (LEGACY XHR)
	// =========================

	private downloadKaiOS2(url: string): void {
		let chunk: Chunk = {
			part: 1,
			startBytes: 0,
			endBytes: 0,
			bytes: 0,
			totalBytes: 0,
			data: new ArrayBuffer(0)
		};

		this.xhr!.addEventListener('progress', (ev: any) => {
			const response = this.xhr!.response as ArrayBuffer;
			const responseLength = response.byteLength;

			chunk.totalBytes = ev.total;

			let availableBytes = responseLength;

			while (availableBytes > 0) {
				const bytesNeeded =
					this.options.chunkByteLimit - chunk.data.byteLength;

				const bytesBefore = chunk.data.byteLength;

				chunk.data = this.appendChunk(
					chunk.data,
					response.slice(
						responseLength - availableBytes,
						responseLength - availableBytes + bytesNeeded
					)
				);

				chunk.bytes = chunk.data.byteLength;
				chunk.endBytes = chunk.startBytes + chunk.data.byteLength;

				availableBytes -= (chunk.data.byteLength - bytesBefore);

				if (
					chunk.data.byteLength >= this.options.chunkByteLimit ||
					ev.total === ev.loaded
				) {
					this.onProgress({ ...chunk });

					chunk = {
						part: chunk.part + 1,
						startBytes: chunk.endBytes,
						endBytes: chunk.endBytes,
						bytes: 0,
						totalBytes: ev.total,
						data: new ArrayBuffer(0)
					};
				}
			}
		});

		this.xhr!.addEventListener('error', () =>
			this.onError(new Error('File download failed'))
		);

		this.xhr!.open('GET', url, true);
		this.xhr!.send();
	}

	// =========================
	// KAIOS 3 (FETCH STREAMS)
	// =========================

	private async downloadKaiOS3(url: string): Promise<void> {
		try {
			const response = await fetch(url);

			if (!response.body) {
				throw new Error('ReadableStream not supported');
			}

			const reader = response.body.getReader();

			let part = 1;
			let receivedBytes = 0;

			// Buffer für Chunk-Splitting (wichtig für gleiche Logik wie KaiOS 2)
			let buffer = new Uint8Array(0);

			const totalBytes =
				Number(response.headers.get('Content-Length')) || 0;

			while (true) {
				const { done, value } = await reader.read();

				if (done) break;

				// append new data
				const newBuffer = new Uint8Array(
					buffer.length + value.length
				);
				newBuffer.set(buffer, 0);
				newBuffer.set(value, buffer.length);

				buffer = newBuffer;
				receivedBytes += value.length;

				// split into same chunk size as KaiOS 2
				while (buffer.length >= this.options.chunkByteLimit) {
					const chunkData = buffer.slice(
						0,
						this.options.chunkByteLimit
					);

					buffer = buffer.slice(this.options.chunkByteLimit);

					this.onProgress({
						part,
						startBytes: receivedBytes - buffer.length - chunkData.length,
						endBytes: receivedBytes - buffer.length,
						bytes: chunkData.length,
						totalBytes,
						data: chunkData.buffer
					});

					part++;
				}
			}

			// flush remaining buffer
			if (buffer.length > 0) {
				this.onProgress({
					part,
					startBytes: receivedBytes - buffer.length,
					endBytes: receivedBytes,
					bytes: buffer.length,
					totalBytes,
					data: buffer.buffer
				});
			}

			this.onComplete({
				totalBytes: receivedBytes
			} as Progress);

		} catch (err) {
			this.onError(err as Error);
		}
	}

	// =========================
	// HELPERS
	// =========================

	private appendChunk(source: ArrayBuffer, newData: ArrayBuffer) {
		if (!newData) return source;

		const tmp = new Uint8Array(source.byteLength + newData.byteLength);
		tmp.set(new Uint8Array(source), 0);
		tmp.set(new Uint8Array(newData), source.byteLength);
		return tmp.buffer;
	}
}

type HttpClientOptions = {
	chunkByteLimit: number;
};