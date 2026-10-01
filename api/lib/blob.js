// File storage stays on Azure Blob Storage after the migration (explicit
// decision). It was always plain fetch() against a container-scoped SAS URL,
// never the @azure/storage-blob SDK, so nothing about it had to change — this
// module just gathers the shared constants and the base64→bytes helper the
// upload handlers need.

export const STORAGE_ACCOUNT = 'stroadmapprogress';
export const FEED_CONTAINER = 'feed-uploads';
export const IMAGE_CONTAINER = 'images';
export const BACKUPS_CONTAINER = 'backups';

export function blobBase(container) {
  return `https://${STORAGE_ACCOUNT}.blob.core.windows.net/${container}`;
}

export function bytesFromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function bytesMatch(buffer, sig) {
  if (buffer.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (buffer[i] !== sig[i]) return false;
  return true;
}

// PUT bytes to a blob via the container SAS. Returns the fetch Response so the
// caller can surface a useful error.
export function putBlob(container, blobName, bytes, sas, extraHeaders = {}) {
  return fetch(`${blobBase(container)}/${blobName}?${sas}`, {
    method: 'PUT',
    headers: {
      'x-ms-blob-type': 'BlockBlob',
      'x-ms-version': '2021-08-06',
      'Content-Length': String(bytes.length),
      ...extraHeaders
    },
    body: bytes
  });
}
