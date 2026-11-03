// The main navigation: the six places the product is built around, as links in the top bar on a wide screen. Below the width (a narrow
// window, a tablet, a phone) the same places are in the destination rail, which is the bottom bar on a phone; on a wide screen the rail
// keeps the others (videos, articles, saved, workspace, admin). Where each one goes is decided in App.jsx; the words and the width are here.

export const MAIN_NAV = {
  label: 'Main',
  minWidth: 1280, // px: the top bar has room for the six links from here up
  newActivity: 'new activity',
  items: [
    { id: 'learn', label: 'Learn' },
    { id: 'explore', label: 'Explore' },
    { id: 'practice', label: 'Practice' },
    { id: 'design-lab', label: 'Design Lab' },
    { id: 'community', label: 'Community' },
    { id: 'my-learning', label: 'My Learning' }
  ]
};
