import { useEffect, useMemo, useState } from 'react';
import { POST_CATEGORIES, POST_KINDS, isPostCategory, isPostKind } from '../../lib/blog/kinds.js';
import { fetchBlogTags } from '../../lib/blogApi.js';
import { useBlogList } from '../../hooks/useBlogList.js';
import { useLoader } from '../../hooks/useLoader.js';
import { followInApp } from '../../lib/linkClick.js';
import { writeUrl } from '../../lib/appPages.js';
import { SITE } from '../../config/index.js';
import { LOAD_WHAT } from '../../config/messages.js';
import { Button } from '../ui/Button.jsx';
import { ChoiceChip } from '../ui/Chip.jsx';
import { EmptyState } from '../ui/EmptyState.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';
import LoadError from '../common/LoadError.jsx';
import { ArticleIcon, PenIcon, SearchIcon } from '../common/icons.jsx';
import PostCard from './PostCard.jsx';
import '../../styles/blog.css';

// Explore Blogs: what the community has written, newest first or most liked first, narrowed by a topic or by words. The
// filters live in the address (/blog/?tag=reliability&q=retry), so a filtered list can be shared and survives a reload
// and the Back button.
const SORTS = [
  { id: 'new', label: 'Newest' },
  { id: 'popular', label: 'Most liked' }
];
const SEARCH_PAUSE_MS = 300;

function filtersFromAddress() {
  const query = new URLSearchParams(location.search);
  const kind = query.get('kind') || '';
  const category = query.get('category') || '';
  return { q: query.get('q') || '', tag: query.get('tag') || '', kind: isPostKind(kind) ? kind : '', category: isPostCategory(category) ? category : '', sort: query.get('sort') === 'popular' ? 'popular' : 'new' };
}

function writeFiltersToAddress({ q, tag, kind, category, sort }) {
  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (tag) query.set('tag', tag);
  if (kind) query.set('kind', kind);
  if (category) query.set('category', category);
  if (sort === 'popular') query.set('sort', sort);
  const search = query.toString() ? `?${query}` : '';
  if (search !== location.search) history.replaceState(null, '', location.pathname + search + location.hash);
}

export default function BlogsView({ onOpenPost, onOpenAuthor, onOpenWrite }) {
  const initial = useMemo(filtersFromAddress, []);
  const [typed, setTyped] = useState(initial.q);
  const [q, setQ] = useState(initial.q);
  const [tag, setTag] = useState(initial.tag);
  const [kind, setKind] = useState(initial.kind);
  const [category, setCategory] = useState(initial.category);
  const [sort, setSort] = useState(initial.sort);
  const list = useBlogList({ q, tag, kind, category, sort });
  const { data: topicData } = useLoader(fetchBlogTags);

  useEffect(() => { document.title = `Blogs · ${SITE.name}`; }, []);
  // The list follows the search box a moment after the typing stops, not on every key.
  useEffect(() => {
    const timer = setTimeout(() => setQ(typed.trim()), SEARCH_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed]);
  useEffect(() => writeFiltersToAddress({ q, tag, kind, category, sort }), [q, tag, kind, category, sort]);

  // The most written-about topics, and the one being looked at even when it is not among them.
  const topics = useMemo(() => {
    const known = topicData ? topicData.tags : [];
    return tag && !known.some((t) => t.tag === tag) ? [{ tag, posts: null }, ...known] : known;
  }, [topicData, tag]);

  const filtered = !!(q || tag || kind || category);
  const clearFilters = () => { setTyped(''); setQ(''); setTag(''); setKind(''); setCategory(''); };
  const pickTag = (t) => { setTag(t); window.scrollTo?.(0, 0); };
  const writeLink = { href: writeUrl(), onClick: followInApp(onOpenWrite) };

  return (
    <div className="blog-screen">
      <header className="blog-head">
        <div>
          <p className="blog-kicker">Community writing</p>
          <h1 className="blog-h1">Blogs</h1>
          <p className="blog-lede">Notes, deep dives and postmortems from people learning and building backend systems.</p>
        </div>
        <Button as="a" variant="primary" icon={<PenIcon />} {...writeLink}>Write an article</Button>
      </header>

      <div className="blog-tools">
        <label className="blog-search">
          <SearchIcon aria-hidden="true" />
          <input type="search" aria-label="Search articles" placeholder="Search articles" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <div className="blog-sort" role="group" aria-label="Sort by">
          {SORTS.map((option) => (
            <ChoiceChip key={option.id} selected={sort === option.id} onClick={() => setSort(option.id)}>{option.label}</ChoiceChip>
          ))}
        </div>
      </div>

      <div className="blog-topics" role="group" aria-label="Kind of contribution">
        <ChoiceChip selected={!kind} onClick={() => setKind('')}>All kinds</ChoiceChip>
        {POST_KINDS.map((k) => <ChoiceChip key={k.id} selected={kind === k.id} onClick={() => setKind(kind === k.id ? '' : k.id)}>{k.label}</ChoiceChip>)}
      </div>
      <div className="blog-topics" role="group" aria-label="Category">
        <ChoiceChip selected={!category} onClick={() => setCategory('')}>All categories</ChoiceChip>
        {POST_CATEGORIES.map((c) => <ChoiceChip key={c.id} selected={category === c.id} onClick={() => setCategory(category === c.id ? '' : c.id)}>{c.label}</ChoiceChip>)}
      </div>

      {topics.length > 0 && (
        <div className="blog-topics" role="group" aria-label="Topics">
          <ChoiceChip selected={!tag} onClick={() => setTag('')}>All topics</ChoiceChip>
          {topics.map((t) => (
            <ChoiceChip key={t.tag} selected={tag === t.tag} onClick={() => setTag(tag === t.tag ? '' : t.tag)}>
              {t.tag}{t.posts != null && <span className="blog-topics__n">{t.posts}</span>}
            </ChoiceChip>
          ))}
        </div>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {list.loading ? 'Loading articles' : `${list.posts.length} article${list.posts.length === 1 ? '' : 's'}${list.next ? ' so far' : ''}`}
      </p>

      {list.error && !list.posts.length && <LoadError error={list.error} what={LOAD_WHAT.articles} onRetry={list.reload} />}
      {list.loading && <div className="blog-skeleton"><Skeleton lines={4} /><Skeleton lines={4} /><Skeleton lines={4} /></div>}

      {!list.loading && !list.error && list.posts.length === 0 && (
        <EmptyState
          icon={<ArticleIcon />}
          title={filtered ? 'Nothing matches that' : 'No articles yet'}
          action={filtered
            ? <Button onClick={clearFilters}>Show everything</Button>
            : <Button as="a" variant="primary" icon={<PenIcon />} {...writeLink}>Write the first one</Button>}
        >
          {filtered ? 'Try a different word, or another topic.' : 'This is where articles from the community will appear.'}
        </EmptyState>
      )}

      {list.posts.length > 0 && (
        <div className="blog-list">
          {list.posts.map((post, i) => (
            <PostCard
              key={post.id}
              post={post}
              lead={i === 0 && !filtered && sort === 'new' && !!post.coverUrl}
              onOpenPost={onOpenPost}
              onOpenAuthor={onOpenAuthor}
              onPickTag={pickTag}
            />
          ))}
        </div>
      )}

      {list.error && list.posts.length > 0 && <LoadError error={list.error} what={LOAD_WHAT.articles} onRetry={list.more} compact />}
      {list.next && !list.error && (
        <div className="blog-more"><Button onClick={list.more} loading={list.loadingMore}>Show more articles</Button></div>
      )}
    </div>
  );
}
