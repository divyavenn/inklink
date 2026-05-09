import { Suspense } from 'react';
import ReaderView from '@/components/ReaderView';

export default function ChapterPage() {
  return (
    <Suspense>
      <ReaderView />
    </Suspense>
  );
}
