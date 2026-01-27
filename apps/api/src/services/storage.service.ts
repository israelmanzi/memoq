import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

const s3Client = new S3Client({
  endpoint: `http${env.MINIO_USE_SSL ? 's' : ''}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: 'us-east-1', // Required but ignored by MinIO
  credentials: {
    accessKeyId: env.MINIO_ROOT_USER,
    secretAccessKey: env.MINIO_ROOT_PASSWORD,
  },
  forcePathStyle: true, // Required for MinIO
});

const BUCKET = env.MINIO_BUCKET;

/**
 * Ensure the bucket exists, create if not
 */
export async function ensureBucket(): Promise<void> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
  } catch (error: any) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log(`Creating bucket: ${BUCKET}`);
      await s3Client.send(new CreateBucketCommand({ Bucket: BUCKET }));
    } else {
      // If it's a connection error, log but don't throw (dev mode without MinIO)
      if (error.code === 'ECONNREFUSED') {
        console.warn('MinIO not available - file storage will be disabled');
        return;
      }
      throw error;
    }
  }
}

/**
 * Upload a file to storage
 */
export async function uploadFile(
  key: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

/**
 * Get a file from storage
 */
export async function getFile(key: string): Promise<Buffer> {
  const response = await s3Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`File not found: ${key}`);
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

/**
 * Delete a file from storage
 */
export async function deleteFile(key: string): Promise<void> {
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    })
  );
}

/**
 * Generate a storage key for a document file
 */
export function generateStorageKey(documentId: string, filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || 'bin';
  return `documents/${documentId}/original.${ext}`;
}

/**
 * Get MIME type for a file extension
 */
export function getMimeType(fileType: string): string {
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    txt: 'text/plain',
    xliff: 'application/xliff+xml',
    xlf: 'application/xliff+xml',
  };
  return mimeTypes[fileType.toLowerCase()] || 'application/octet-stream';
}

/**
 * Check if storage is available
 */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return true;
  } catch {
    return false;
  }
}
