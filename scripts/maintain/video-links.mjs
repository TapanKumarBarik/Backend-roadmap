#!/usr/bin/env node
// Prints each video with the address of its module on the site and the link that opens it in YouTube Studio, so the
// address can be pasted into the first line of the video's description (docs/VIDEOS.md: that is how a viewer finds the
// written version). Reads content/videos.json; changes nothing.
//
//   npm run videos:links
import { SITE_URL } from '../lib/config.mjs';
import { loadRegistry, videoLinks } from '../lib/videos.mjs';

const links = videoLinks(loadRegistry(), SITE_URL);
if (!links.length) {
  console.log('No video is attached to a module yet (see docs/VIDEOS.md).');
} else {
  let playlist = '';
  for (const v of links) {
    if (v.playlist !== playlist) {
      playlist = v.playlist;
      console.log(`\n${playlist}\n`);
    }
    console.log(`#${v.number}  ${v.title}\n    ${v.url}\n    edit: ${v.edit}`);
  }
  console.log(`\n${links.length} video(s). Paste the address on the first line of each description, and pin it as a comment.`);
}
