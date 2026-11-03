// The community area: one place with four tabs (docs/MODERNIZATION.md, D9). Each tab is a screen with an address of its own (the
// hash), so a link made before the tabs existed still opens the tab it always did.
//
//   id      the tab; the activity dots and the tests name it
//   route   its address: /#<route>
//   label   what the tab says
//   words   what finds it in the command palette, besides its label
export const COMMUNITY = {
  title: 'Community',
  intro: 'Questions, posts, books and ideas from the people learning here. Everything is public.',
  newLabel: 'new',
  tabs: [
    { id: 'questions', route: '__community', label: 'Questions', words: 'community discussion questions ask answer modules' },
    { id: 'posts', route: '__feed', label: 'Posts', words: 'community feed posts share' },
    { id: 'resources', route: '__books', label: 'Resources', words: 'community books pdf library shelf resources' },
    { id: 'ideas', route: '__suggestions', label: 'Ideas', words: 'community suggestions feedback ideas vote feature request' }
  ]
};

/** The tab whose address is `route` (a hash screen such as '__feed'), or null for any other screen. */
export const communityTab = (route) => COMMUNITY.tabs.find((tab) => tab.route === route) || null;

/** The address of the tab with this id. */
export const tabRoute = (id) => COMMUNITY.tabs.find((tab) => tab.id === id).route;

/** Where "Community" leads: its first tab. */
export const COMMUNITY_HOME = COMMUNITY.tabs[0].route;

// "From the community" on the landing page and the dashboard: the newest articles, and a way to write one.
export const STRIP = {
  heading: 'From the community',
  items: 3,
  all: 'All articles',
  write: 'Write an article',
  invitation: 'No one has written here yet. The first article is yours to write.'
};
