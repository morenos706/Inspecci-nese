/**
 * Abstracción de almacenamiento de archivos. Los servicios solo conocen esta
 * interfaz; el proveedor se elige con STORAGE_DRIVER (s3 | local).
 */
export interface StoredObject {
  body: ReadableStream<Uint8Array>;
  contentType?: string;
  contentLength?: number;
}

export interface StorageProvider {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<StoredObject | null>;
  delete(key: string): Promise<void>;
}
