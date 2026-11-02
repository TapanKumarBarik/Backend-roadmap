// File storage stays on Azure Blob Storage after the migration (explicit
// decision). It was always plain fetch() against a container-scoped SAS URL,
// never the @azure/storage-blob SDK, so nothing about it had to change — this
// module just gathers the shared constants and the base64→bytes helper the
// upload handlers need.

import site from '../../site.config.json' with { type: 'json' };

// Which storage account and containers hold the uploads is site.config.json -> uploads (the content security policy in
// webapp/public/_headers and the preconnect in webapp/index.html name the same host: a test keeps the three in step).
export const STORAGE_ACCOUNT = site.uploads.account;
export const FEED_CONTAINER = site.uploads.containers.feed;
export const IMAGE_CONTAINER = site.uploads.containers.images;
export const BACKUPS_CONTAINER = site.uploads.containers.backups;

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
