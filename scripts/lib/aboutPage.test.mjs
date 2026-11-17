import test from 'node:test';
import assert from 'node:assert/strict';
import { bioHtml } from './aboutPage.mjs';

test('with no bio and no photo the about page invents nothing', () => {
  assert.equal(bioHtml({ name: 'A Person' }), '');
  assert.equal(bioHtml({ name: 'A Person', bio: '', photo: '' }), '');
});

test('a bio and a photo become a paragraph and a picture with the name as its text', () => {
  const html = bioHtml({ name: 'A Person', bio: 'Builds backends.', photo: '/images/author.jpg' });
  assert.match(html, /<img class="about__photo" src="\/images\/author\.jpg" alt="A Person" width="96" height="96" decoding="async">/);
  assert.match(html, /<p class="about__bio">Builds backends\.<\/p>/);
  assert.match(bioHtml({ name: 'A Person', bio: 'Only words.' }), /^<p class="about__bio">Only words\.<\/p>$/);
});

test('what the author writes is escaped, and has no raw percent sign for the build to mistake for a placeholder', () => {
  const html = bioHtml({ name: 'A <b>Person</b>', bio: 'Cut latency by 40% & "more" <script>' });
  assert.doesNotMatch(html, /<script>|<b>/);
  assert.match(html, /40&#37; &amp; &quot;more&quot; &lt;script&gt;/);
  assert.doesNotMatch(html, /%/);
});

test('a photo carries its own size, so the page does not jump when it loads, and a description of what it shows', () => {
  const html = bioHtml({ name: 'A Person', photo: '/p.jpg', photoWidth: 1470, photoHeight: 828, photoAlt: 'A Person on a park path' });
  assert.match(html, /alt="A Person on a park path" width="1470" height="828"/);
  assert.match(bioHtml({ name: 'A Person', photo: '/p.jpg', photoWidth: -5, photoHeight: 'x' }), /width="96" height="96"/, 'a size that is not a positive whole number is not used');
  assert.match(bioHtml({ name: 'A <b>', photo: '/p.jpg', photoAlt: 'say "hi" <script>' }), /alt="say &quot;hi&quot; &lt;script&gt;"/);
});
