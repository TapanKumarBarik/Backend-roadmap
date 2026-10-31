import test from 'node:test';
import assert from 'node:assert/strict';
import { youtubeId, renderVideos, videoCardHtml, thumbnailUrl, DEFAULT_VIDEO_LABEL } from './video.js';
import { createStash, restore } from './htmlStash.js';
import { renderMarkdownDoc } from './markdown.js';

const ID = 'jNQXAC9IVRw';

test('youtubeId reads a single video from the links people actually paste', () => {
  assert.equal(youtubeId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youtubeId(`https://youtube.com/watch?feature=share&v=${ID}&t=42s`), ID);
  assert.equal(youtubeId(`https://m.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youtubeId(`https://youtu.be/${ID}?si=abc`), ID);
  assert.equal(youtubeId(`https://www.youtube.com/shorts/${ID}`), ID);
  assert.equal(youtubeId(`https://www.youtube-nocookie.com/embed/${ID}`), ID);
});

test('youtubeId refuses anything that is not one video, or whose id could not be one', () => {
  assert.equal(youtubeId('https://www.youtube.com/@tapankumarbarik9454'), null);
  assert.equal(youtubeId('https://www.youtube.com/playlist?list=PL12345678901'), null);
  assert.equal(youtubeId('https://example.com/watch?v=' + ID), null);
  assert.equal(youtubeId('https://www.youtube.com/watch?v="><script>alert(1)</script>'), null);
  assert.equal(youtubeId('https://www.youtube.com/watch?v=short'), null);
  assert.equal(youtubeId('not a url'), null);
});

function render(md) {
  const store = createStash();
  return restore(renderVideos(md, store), store);
}

test('a lone YouTube link becomes a card that still links to the video', () => {
  const html = render(`Intro\n\n[Watch the walkthrough](https://youtu.be/${ID})\n\nOutro`);
  assert.match(html, /<figure class="video" data-video="jNQXAC9IVRw">/);
  assert.match(html, /href="https:\/\/www\.youtube\.com\/watch\?v=jNQXAC9IVRw"/);
  assert.match(html, /<span class="video-label">Watch the walkthrough<\/span>/);
  assert.ok(html.includes(thumbnailUrl(ID)));
  assert.ok(html.includes('Intro') && html.includes('Outro'));
});

test('a link without text gets the default label, and the label cannot inject markup', () => {
  assert.match(videoCardHtml(ID, ''), new RegExp(`<span class="video-label">${DEFAULT_VIDEO_LABEL}</span>`));
  const html = videoCardHtml(ID, '<img src=x onerror=alert(1)>');
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('links inside a sentence, other sites and code fences are left alone', () => {
  const inSentence = `See [the video](https://youtu.be/${ID}) for more.`;
  assert.equal(render(inSentence), inSentence);
  const other = '[docs](https://example.com/page)';
  assert.equal(render(other), other);
  const fenced = '```markdown\n[Watch](https://youtu.be/' + ID + ')\n```';
  assert.equal(render(fenced), fenced);
});

test('through the whole pipeline the card survives marked intact', () => {
  const html = renderMarkdownDoc(`# Title\n\n[Watch](https://www.youtube.com/watch?v=${ID})\n\nText after.\n`);
  assert.match(html, /<figure class="video"[^>]*>.*<\/figure>/s);
  assert.ok(!html.includes('data-html-slot'));
  assert.match(html, /<p>Text after\.<\/p>/);
});
