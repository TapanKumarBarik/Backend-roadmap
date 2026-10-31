import { Component } from 'react';
import LoadError from './LoadError.jsx';
import { LOAD_WHAT } from '../../config/messages.js';

// Around the screens that are downloaded when they are first opened (see App.jsx). Like any request, that download
// can fail: no connection, a flaky one, or a deploy that has replaced the file since the page was loaded. It then
// says so in the same words as every other load failure, and reloads when asked, or by itself when the connection
// returns (LoadError does that), instead of ending in the crash screen. An error that is not a failed download is
// a bug in the screen, and goes on to the crash screen as before.
const FAILED_DOWNLOAD = /dynamically imported module|importing a module script|loading chunk|ChunkLoadError/i;

export default class ScreenBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (!FAILED_DOWNLOAD.test(`${error.name} ${error.message}`)) throw error;
    // A reload is the retry: a download that failed once is remembered as failed until the page is loaded again.
    const reload = () => { window.location.reload(); return new Promise(() => {}); };
    return <LoadError error={error} what={LOAD_WHAT.screen} onRetry={reload} devHint={false} />;
  }
}
