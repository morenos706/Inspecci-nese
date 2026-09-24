import "server-only";
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { StorageProvider } from "@/server/storage/types";

/**
 * Proveedor S3-compatible: AWS S3, Cloudflare R2, Wasabi, MinIO…
 * El bucket debe ser PRIVADO: los archivos se sirven a través de la app,
 * que verifica permisos en cada descarga.
 */
export function createS3Storage(config: {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}): StorageProvider {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint || undefined,
    forcePathStyle: config.forcePathStyle,
    // Sin llaves: cadena de credenciales de AWS (rol IAM de la instancia, variables AWS_*…).
    credentials:
      config.accessKeyId && config.secretAccessKey
        ? { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }
        : undefined,
  });

  return {
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async get(key) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (!res.Body) return null;
        return {
          body: res.Body.transformToWebStream() as ReadableStream<Uint8Array>,
          contentType: res.ContentType,
          contentLength: res.ContentLength,
        };
      } catch (error) {
        if (error instanceof NoSuchKey || (error as { name?: string }).name === "NoSuchKey") return null;
        throw error;
      }
    },
    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    },
  };
}
