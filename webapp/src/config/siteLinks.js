// The small pages of the site that are not lessons or screens of the app, as the footer links to them: the Network Lab (/tools/), the Prep Tracker (/tracker/) and the Azure study
// packs (/study-packs/). Addresses and labels in one place, so the footer says what the sitemap lists. The pages themselves are listed in site.config.json -> tools and pages.
// Plain JS, loadable from Node.
export const SITE_LINKS = {
  tracker: { url: '/tracker/', label: 'Prep tracker' },
  tools: { url: '/tools/', label: 'Network Lab', short: 'Lab' }, // `short` is what fits under an icon in the narrow left rail
  studyPacks: { url: '/study-packs/', label: 'Study packs', short: 'Packs' }
};
