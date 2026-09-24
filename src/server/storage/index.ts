import "server-only";
import { env } from "@/lib/env";
import { createLocalStorage } from "@/server/storage/local";
import { createS3Storage } from "@/server/storage/s3";
import type { StorageProvider } from "@/server/storage/types";

let provider: StorageProvider | null = null;

export function storage(): StorageProvider {
  provider ??=
    env.STORAGE_DRIVER === "local"
      ? createLocalStorage(env.LOCAL_STORAGE_DIR)
      : createS3Storage({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        });
  return provider;
}
