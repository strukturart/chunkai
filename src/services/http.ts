import { Chunk, Progress } from "../models";

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

    if (!this.isKaiOS3()) {
      const xhr = new (XMLHttpRequest as any)({
        mozSystem: true,
      });
      xhr.responseType = "moz-chunked-arraybuffer";
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
      data: new ArrayBuffer(0),
    };

    this.xhr!.addEventListener("progress", (ev: any) => {
      const response = this.xhr!.response as ArrayBuffer;
      const responseLength = response.byteLength;

      chunk.totalBytes = ev.total;

      let availableBytes = responseLength;

      while (availableBytes > 0) {
        const bytesNeeded = this.options.chunkByteLimit - chunk.data.byteLength;

        const bytesBefore = chunk.data.byteLength;

        chunk.data = this.appendChunk(
          chunk.data,
          response.slice(
            responseLength - availableBytes,
            responseLength - availableBytes + bytesNeeded,
          ),
        );

        chunk.bytes = chunk.data.byteLength;
        chunk.endBytes = chunk.startBytes + chunk.data.byteLength;

        availableBytes -= chunk.data.byteLength - bytesBefore;

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
            data: new ArrayBuffer(0),
          };
        }
      }
    });

    this.xhr!.addEventListener("error", () =>
      this.onError(new Error("File download failed")),
    );

    this.xhr!.open("GET", url, true);
    this.xhr!.send();
  }

  // =========================
  // KAIOS 3 (FETCH STREAMS)
  // =========================

 
private async downloadKaiOS3(url: string): Promise<void> {

		let loadedBytes = 0;
		let lastEmit = Date.now();
		let lastDataTime = Date.now();
	try {
		const response = await fetch(url);

		if (!response.body) {
			throw new Error("ReadableStream not supported");
		}

		const reader = response.body.getReader();
		const chunkLimit = this.options.chunkByteLimit;

		
		let chunk: Chunk = {
			part: 1,
			startBytes: 0,
			endBytes: 0,
			bytes: 0,
			totalBytes: Number(response.headers.get("Content-Length")) || 0,
			data: new ArrayBuffer(0),
		};

		while (true) {
			if (Date.now() - lastDataTime > 10000) {
				break;
			}

			const { done, value } = await reader.read();

			if (done) break;

			if (!value) continue;

			lastDataTime = Date.now();

			let availableBytes = value.length;
			let offset = 0;

			loadedBytes += value.length;

			const now = Date.now();
			if (now - lastEmit > 3000) {
				this.onProgress({
					...chunk,
					bytes: loadedBytes,
					totalBytes: chunk.totalBytes,
				});
				lastEmit = now;
			}

			while (availableBytes > 0) {
				const bytesNeeded = chunkLimit - chunk.data.byteLength;

				const bytesBefore = chunk.data.byteLength;

				const slice = value.slice(offset, offset + bytesNeeded);

				chunk.data = this.appendChunk(chunk.data, slice.buffer);

				chunk.bytes = chunk.data.byteLength;
				chunk.endBytes = chunk.startBytes + chunk.data.byteLength;

				const consumed = chunk.data.byteLength - bytesBefore;

				offset += consumed;
				availableBytes -= consumed;

				if (chunk.data.byteLength >= chunkLimit) {
					this.onProgress({
						...chunk,
						bytes: loadedBytes,
						totalBytes: chunk.totalBytes,
					});

					chunk = {
						part: chunk.part + 1,
						startBytes: chunk.endBytes,
						endBytes: chunk.endBytes,
						bytes: 0,
						totalBytes: chunk.totalBytes,
						data: new ArrayBuffer(0),
					};
				}
			}
		}

		if (chunk.data.byteLength > 0) {
			this.onProgress({
				...chunk,
				bytes: loadedBytes,
				totalBytes: chunk.totalBytes,
			});
		}

		this.onProgress({
			...chunk,
			bytes: loadedBytes,
			totalBytes: chunk.totalBytes,
		});

		this.onComplete({
			totalBytes: chunk.totalBytes,
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
