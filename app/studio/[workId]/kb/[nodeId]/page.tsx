'use client';

import { useState, useEffect, useReducer, useRef, use } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { saveNodeContentAction, getNodeContentAction } from './actions';
import { getNodeAiContextAction } from '../../chapters/[chapterId]/actions';
import { AiPanel, type MentionedNode } from '../../chapters/[chapterId]/ai-panel/AiPanel';
import { MentionAutocomplete, type MentionCandidate } from '../../chapters/[chapterId]/ai-panel/MentionAutocomplete';
import { StudioEditorPanels } from '@/components/studio/studio-panel-shell';
import { SaveStatusChip } from '@/components/studio/save-status-chip';
import { TemplateEditorToolbar } from '@/components/studio/template-editor-toolbar';
import { createEditorState, editorReducer, selectSaveStatus } from '@/lib/studio/editor-state';
import { applyEdit, performSave, spliceAtSelection } from '@/lib/studio/editor-session';
import type { DefaultFallback, ProviderModelPair } from '@/lib/ai/providers/settings';
import type { ByokModelMap } from '@/lib/ai/providers/selection';

type NodeMode = 'document' | 'user_template' | 'default_template';

interface AiContext {
  genre: string | null;
  defaultProviderModel: ProviderModelPair | null;
  defaultFallback: DefaultFallback | null;
  byokModels: ByokModelMap;
}

/** Result of the load for one resourceKey; a different key means "not loaded yet" (no reset effect). */
type LoadState =
  | { key: string; status: 'ok'; name: string; mode: NodeMode; templateCategory: string | null; ai: AiContext | null }
  | { key: string; status: 'error'; error: string };

export default function KbNodeEditorPage({
  params,
}: {
  params: Promise<{ workId: string; nodeId: string }>;
}) {
  const { workId, nodeId } = use(params);
  const resourceKey = `kb:${workId}:${nodeId}`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [editor, dispatch] = useReducer(editorReducer, undefined, createEditorState);
  const [loadState, setLoadState] = useState<LoadState | null>(null);
  const [mentionedNodes, setMentionedNodes] = useState<MentionedNode[]>([]);
  const editorRef = useRef(editor);
  const requestCounter = useRef(0);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    // A late answer for a previous node/work must never overwrite the new node's content.
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets mentions when the resource changes, before the async fetch below
    setMentionedNodes([]);
    (async () => {
      const result = await getNodeContentAction(nodeId, workId);
      if (cancelled) return;
      if (!result.ok) {
        setLoadState({ key: resourceKey, status: 'error', error: result.error ?? '문서를 불러오지 못했어요.' });
        return;
      }
      // The locked default template is only read: no AI context call, no AI panel.
      let ai: AiContext | null = null;
      if (result.mode !== 'default_template') {
        const context = await getNodeAiContextAction(workId, nodeId);
        if (cancelled) return;
        if (context) {
          ai = {
            genre: context.genre,
            defaultProviderModel: context.defaultProviderModel,
            defaultFallback: context.defaultFallback ?? null,
            byokModels: context.byokModels,
          };
        }
      }
      dispatch({ type: 'load', resourceKey, content: result.content });
      setLoadState({
        key: resourceKey,
        status: 'ok',
        name: result.name,
        mode: result.mode,
        templateCategory: result.templateCategory,
        ai,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [workId, nodeId, resourceKey]);

  const current = loadState?.key === resourceKey ? loadState : null;
  const loaded = current?.status === 'ok';
  const mode: NodeMode = current?.status === 'ok' ? current.mode : 'document';
  const readOnly = mode === 'default_template';
  const ai = current?.status === 'ok' ? current.ai : null;
  const synced = editor.resourceKey === resourceKey;

  function onEdit(content: string) {
    applyEdit(readOnly || !loaded, resourceKey, content, dispatch);
  }

  function addMention(candidate: MentionCandidate) {
    if (readOnly) return;
    setMentionedNodes((prev) => (prev.some((n) => n.id === candidate.id) ? prev : [...prev, candidate]));
  }

  function removeMention(id: string) {
    setMentionedNodes((prev) => prev.filter((n) => n.id !== id));
  }

  /** AI 초안을 문서의 현재 커서 위치에 넣는다 (회차 편집기와 동일). 읽기 전용이면 무시한다. */
  function insertTextAtCursor(text: string) {
    if (readOnly || !loaded) return;
    const textarea = textareaRef.current;
    const latest = editorRef.current.currentContent;
    const start = textarea ? textarea.selectionStart : null;
    const end = textarea ? textarea.selectionEnd : null;
    onEdit(spliceAtSelection(latest, text, start, end));
    if (textarea && start !== null) {
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + text.length;
        textarea.selectionStart = cursor;
        textarea.selectionEnd = cursor;
      });
    }
  }

  const saving = selectSaveStatus(editor) === 'saving';

  function save() {
    requestCounter.current += 1;
    void performSave({
      state: editorRef.current,
      readOnly,
      requestId: `${resourceKey}#${requestCounter.current}`,
      dispatch,
      save: (content) => saveNodeContentAction(workId, nodeId, content),
      onSuccess: () => toast.success('저장했어요.'),
      onFailure: (message) => toast.error(message),
    });
  }

  if (current?.status === 'error') {
    return (
      <p role="alert" className="text-sm text-destructive">
        {current.error}
      </p>
    );
  }

  const saveButton = (
    <Button size="sm" disabled={saving || !loaded || readOnly} onClick={save}>
      문서 저장
    </Button>
  );

  const statusChip = <SaveStatusChip state={editor} readOnly={readOnly} />;

  // Templates render the chip inside the toolbar's actions tier (BUG-02); documents keep the single row.
  const toolbar = current?.status === 'ok' ? (
    current.mode === 'document' ? (
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span className="min-w-0 truncate text-sm font-medium">{current.name}</span>
            <div className="ml-auto flex shrink-0 items-center gap-2">{saveButton}</div>
          </div>
        </div>
        {statusChip}
      </div>
    ) : (
      <TemplateEditorToolbar
        workId={workId}
        nodeId={nodeId}
        name={current.name}
        mode={current.mode}
        templateCategory={current.templateCategory}
        saveSlot={saveButton}
        statusSlot={statusChip}
      />
    )
  ) : null;

  return (
    <StudioEditorPanels
      resourceKey={resourceKey}
      toolbar={toolbar}
      editor={
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Textarea
            ref={textareaRef}
            value={synced ? editor.currentContent : ''}
            onChange={(e) => onEdit(e.target.value)}
            readOnly={readOnly}
            disabled={!loaded || !synced}
            className="min-h-[60vh] font-mono text-sm leading-[1.7]"
          />
          {readOnly ? null : (
            <MentionAutocomplete
              workId={workId}
              textareaRef={textareaRef}
              content={editor.currentContent}
              onContentChange={onEdit}
              onMention={addMention}
            />
          )}
        </div>
      }
      ai={
        loaded && !readOnly && ai?.defaultProviderModel ? (
          <AiPanel
            key={nodeId}
            defaultProviderId={ai.defaultProviderModel.providerId}
            defaultModel={ai.defaultProviderModel.model}
            defaultKeySource={ai.defaultProviderModel.keySource}
            defaultFallback={ai.defaultFallback}
            byokModels={ai.byokModels}
            workId={workId}
            nodeId={nodeId}
            content={editor.currentContent}
            defaultGenre={ai.genre}
            mentionedNodes={mentionedNodes}
            onRemoveMention={removeMention}
            onAddMention={addMention}
            onInsertText={insertTextAtCursor}
          />
        ) : undefined
      }
    />
  );
}
