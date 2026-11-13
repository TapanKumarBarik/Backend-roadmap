// What the about page says about its author, in the author's own words: site.config.json -> developer.bio (a few sentences) and developer.photo (an address on the
// site, such as /images/author.jpg). Both are optional: nothing is invented, so a page with neither says only the name and the links, and grows when they are added.

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/%/g, '&#37;');

/** The bio and photo of the developer as HTML, or an empty string when neither is set. */
export function bioHtml(developer) {
  const parts = [];
  if (developer.photo) parts.push(`<img class="about__photo" src="${esc(developer.photo)}" alt="${esc(developer.name)}" width="96" height="96">`);
  if (developer.bio) parts.push(`<p class="about__bio">${esc(developer.bio)}</p>`);
  return parts.join('\n      ');
}
