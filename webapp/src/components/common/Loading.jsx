import { Skeleton } from '../ui/Skeleton.jsx';

// What a list shows while it is on its way: grey bars the shape of what will replace them, announced once as "Loading".
export default function Loading({ lines = 4 }) {
  return <div role="status" aria-label="Loading"><Skeleton lines={lines} /></div>;
}
