export interface ManualFileRead {
  readonly file: File;
  succeed(result?: string | ArrayBuffer | null): void;
  fail(): void;
}

/** Drive the real emitted reader's browser callbacks without mocking its async routine. */
export function controlledManualFileReader(automatic = true) {
  const reads: ManualFileRead[] = [];
  class TestFileReader {
    result: string | ArrayBuffer | null = null;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL(file: File): void {
      const read: ManualFileRead = {
        file,
        succeed: (result = "data:" + file.type + ";base64,cHJvb2Y=") => {
          this.result = result;
          this.onload?.();
        },
        fail: () => this.onerror?.(),
      };
      reads.push(read);
      if (automatic) queueMicrotask(() => read.succeed());
    }
  }
  return { FileReader: TestFileReader, reads };
}
