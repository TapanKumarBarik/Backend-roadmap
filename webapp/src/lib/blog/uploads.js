import site from '../../../../site.config.json' with { type: 'json' };

// Where the site's own uploads live (site.config.json -> uploads), as the address prefixes an article's pictures may come
// from. The API refuses a picture from anywhere else when it saves an article, and the studio's preview draws by the same
// rule, so what the author sees is what the reader will.
const prefix = (container) => `https://${site.uploads.account}.blob.core.windows.net/${container}/`;

export const UPLOAD_ORIGINS = [prefix(site.uploads.containers.feed), prefix(site.uploads.containers.images)];
