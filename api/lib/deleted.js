// What stands in for a person who is gone (they deleted their account), and for a comment that was deleted while replies hang
// off it: the row stays so a thread somebody else is part of keeps its shape, without the name and, for a comment, the text.
// A comment whose user is `userId` is drawn as deleted (routes/comments.js says so to the app); nobody is mentioned in it any more.
export const DELETED = { userId: 'deleted', name: '[deleted user]', text: '[deleted]', mentions: '[]' };
