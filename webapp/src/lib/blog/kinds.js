// What a community contribution can be, and where it belongs. Both are chosen by the author when they write or publish, kept with
// the post (api/migrations/0005_community_workflow.sql) and offered as filters on the articles' list. One list, read by the API
// (to check what it is given) and by the studio and the list (to draw the choices).

export const POST_KINDS = [
  { id: 'article', label: 'Article', help: 'An essay, an explanation, an opinion.' },
  { id: 'study-note', label: 'Study notes', help: 'What you learned, written so that others can learn it too.' },
  { id: 'tutorial', label: 'Tutorial', help: 'A step-by-step guide to doing something.' },
  { id: 'project', label: 'Project showcase', help: 'Something you built: what it does and how it is put together.' },
  { id: 'lld-design', label: 'LLD design', help: 'A low-level design: classes, responsibilities and the reasons for them.' },
  { id: 'hld-design', label: 'HLD design', help: 'An architecture, with its trade-offs.' },
  { id: 'quiz', label: 'Quiz', help: 'Questions with explanations, for others to try.' }
];

export const POST_CATEGORIES = [
  { id: 'general', label: 'General' },
  { id: 'backend', label: 'Backend engineering' },
  { id: 'cloud-devops', label: 'Cloud and DevOps' },
  { id: 'genai', label: 'GenAI' },
  { id: 'system-design', label: 'System design' },
  { id: 'learning-questions', label: 'Learning questions' },
  { id: 'design-reviews', label: 'Design reviews' },
  { id: 'resources', label: 'Resources' }
];

export const DEFAULT_KIND = POST_KINDS[0].id;
export const DEFAULT_CATEGORY = POST_CATEGORIES[0].id;

export const isPostKind = (value) => POST_KINDS.some((k) => k.id === value);
export const isPostCategory = (value) => POST_CATEGORIES.some((c) => c.id === value);
export const kindLabel = (id) => (POST_KINDS.find((k) => k.id === id) || POST_KINDS[0]).label;
export const categoryLabel = (id) => (POST_CATEGORIES.find((c) => c.id === id) || POST_CATEGORIES[0]).label;

/**
 * Where a post is in its life, for its author and for the moderators: draft, scheduled, pending (live but not yet approved for
 * search engines), approved, or rejected (taken down by a moderator, with the reason they gave when they gave one).
 */
export function postState(post) {
  if (post.hidden) return 'rejected';
  if (post.status === 'draft') return 'draft';
  if (post.status === 'scheduled') return 'scheduled';
  return post.approved ? 'approved' : 'pending';
}
