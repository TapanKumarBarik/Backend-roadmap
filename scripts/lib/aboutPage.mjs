// What the about page says about its author, in the author's own words: site.config.json -> developer.bio (a few sentences) and developer.photo (an address on the
// site, such as /about-photo.jpg), with developer.photoWidth, photoHeight (the picture's own size, so the page does not jump when it loads) and photoAlt (what it shows,
// for someone who cannot see it; the author's name when there is none). All are optional: nothing is invented, so a page with none says only the name and the links, and
// grows when they are added.

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/%/g, '&#37;');
const size = (value) => (Number.isInteger(value) && value > 0 ? value : 96);

/** The bio and photo of the developer as HTML, or an empty string when neither is set. */
export function bioHtml(developer) {
  const parts = [];
  if (developer.photo) {
    parts.push(`<img class="about__photo" src="${esc(developer.photo)}" alt="${esc(developer.photoAlt || developer.name)}" width="${size(developer.photoWidth)}" height="${size(developer.photoHeight)}" decoding="async">`);
  }
  if (developer.bio) parts.push(`<p class="about__bio">${esc(developer.bio)}</p>`);
  return parts.join('\n      ');
}
