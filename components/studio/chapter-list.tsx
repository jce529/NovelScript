'use client';

import { useState } from 'react';
import Link from 'next/link';
import { GripVertical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { reorderChaptersAction } from '@/app/studio/[workId]/chapters/actions';

export interface ChapterListItem {
  id: string;
  title: string;
  is_published: boolean;
  price_tier: number | null;
}

function ChapterRow({ workId, chapter }: { workId: string; chapter: ChapterListItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chapter.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 h-11 px-3 border-b bg-secondary"
    >
      <span {...attributes} {...listeners} className={`cursor-grab ${isDragging ? 'text-primary' : 'text-muted-foreground hover:text-primary'}`}>
        <GripVertical size={18} />
      </span>
      <Link href={`/studio/${workId}/chapters/${chapter.id}`} className="flex-1 truncate">{chapter.title}</Link>
      <Badge variant={chapter.is_published ? 'default' : 'outline'}>
        {chapter.is_published ? (chapter.price_tier ? `${chapter.price_tier} 토큰` : '무료') : '미발행'}
      </Badge>
    </li>
  );
}

export function ChapterList({ workId, chapters }: { workId: string; chapters: ChapterListItem[] }) {
  const [items, setItems] = useState(chapters);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIndex = items.findIndex((c) => c.id === active.id);
        const newIndex = items.findIndex((c) => c.id === over.id);
        const reordered = arrayMove(items, oldIndex, newIndex);
        setItems(reordered);
        reorderChaptersAction(workId, reordered.map((c) => c.id));
      }}
    >
      <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul className="rounded border overflow-hidden">
          {items.map((chapter) => (
            <ChapterRow key={chapter.id} workId={workId} chapter={chapter} />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
