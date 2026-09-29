'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CHAT_COPY } from '@/lib/ai/chat-result';
import type { DocumentProposal, PresetLevel, StylePresetId } from '@/lib/ai/prompt';
import type { ModelTier } from '@/lib/ai/providers/types';
import { FOLDER_COPY } from '@/lib/kb/folder-copy';
import type { FolderCandidate } from '@/lib/kb/actions';
import {
  loadSavePlanAction, regenerateDocumentWithTemplateAction, saveDocumentProposalAction,
  type SaveRecommendation,
} from '../actions';

type TemplateChoice = { id: string | null; name: string; scope: 'work' | 'account_template' | 'canonical'; isDefault: boolean };
type GenerationSettings = { modelTier: ModelTier; presetLevel: PresetLevel; styleId: StylePresetId; genre: string };

export interface SaveDocumentPlanModalProps {
  workId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: DocumentProposal;
  generation: GenerationSettings;
  onSaved: (nodeId: string, content: string) => void;
}

const LOAD_FAILED = '저장 위치를 불러오지 못했어요. 다시 시도해주세요.';
const REGENERATION_FAILED = '문서를 다시 생성하지 못했어요. 다시 시도해주세요.';
const CANONICAL_TEMPLATE_VALUE = '__canonical__';
const TEMPLATE_GROUPS = [
  { scope: 'work', label: '작품 템플릿' },
  { scope: 'account_template', label: '계정 템플릿' },
  { scope: 'canonical', label: '기본 템플릿' },
] as const;

export function SaveDocumentPlanModal({ workId, open, onOpenChange, proposal, generation, onSaved }: SaveDocumentPlanModalProps) {
  const [recommended, setRecommended] = useState<SaveRecommendation | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedFolderVersion, setSelectedFolderVersion] = useState<string | undefined>();
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [folders, setFolders] = useState<FolderCandidate[]>([]);
  const [templates, setTemplates] = useState<TemplateChoice[]>([]);
  const [loadedRequest, setLoadedRequest] = useState<{ key: string; state: 'ready' | 'error' } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenConfirmOpen, setRegenConfirmOpen] = useState(false);
  const [regenerated, setRegenerated] = useState<{ content: string; name: string; templateId: string | null } | null>(null);
  const regenKeyRef = useRef<{ templateId: string | null; key: string } | null>(null);
  const requestKey = JSON.stringify([workId, proposal]);
  const loadState = loadedRequest?.key === requestKey ? loadedRequest.state : 'loading';

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    regenKeyRef.current = null;
    loadSavePlanAction(workId, proposal.category, {
      folderId: proposal.recommendedFolderId,
      folderVersion: proposal.recommendedFolderVersion,
      templateId: proposal.recommendedTemplateId,
    }).then((result) => {
      if (cancelled) return;
      if (result.status !== 'ok') {
        setLoadedRequest({ key: requestKey, state: 'error' });
        setBanner(result.status === 'root_duplicate' || result.status === 'root_missing' ? FOLDER_COPY[result.status] : LOAD_FAILED);
        return;
      }
      setRecommended(result.recommended);
      setFolders(result.folders);
      setTemplates(result.templates);
      setSelectedFolderId(result.recommended.folderId);
      setSelectedFolderVersion(result.recommended.folderVersion);
      setSelectedTemplateId(result.recommended.templateId);
      setLoadedRequest({ key: requestKey, state: 'ready' });
    }).catch(() => {
      if (!cancelled) {
        setLoadedRequest({ key: requestKey, state: 'error' });
        setBanner(LOAD_FAILED);
      }
    });
    return () => { cancelled = true; };
  }, [open, workId, proposal, requestKey]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setLoadedRequest(null);
      setRecommended(null);
      setFolders([]);
      setTemplates([]);
      setRegenerated(null);
      regenKeyRef.current = null;
    }
    onOpenChange(nextOpen);
  }

  async function doSave(override?: { content: string; name: string; templateId: string | null }) {
    if (!recommended) return;
    setSaving(true);
    setBanner(null);
    const savedContent = override?.content ?? proposal.content;
    try {
      const result = await saveDocumentProposalAction({
        workId,
        proposal: override ? { ...proposal, name: override.name || proposal.name, content: override.content } : proposal,
        targetFolderId: selectedFolderId,
        folderVersion: selectedFolderVersion,
        templateId: selectedTemplateId,
        regenerated: Boolean(override),
      });
      if (!result.ok) {
        if (result.reason === 'folder_changed') {
          setBanner(FOLDER_COPY.folder_changed);
          const refreshed = await loadSavePlanAction(workId, proposal.category);
          if (refreshed.status === 'ok') {
            setFolders(refreshed.folders);
            setSelectedFolderId(refreshed.recommended.folderId);
            setSelectedFolderVersion(refreshed.recommended.folderVersion);
          }
        } else if (result.reason === 'template_changed') {
          setBanner('저장 템플릿이 변경되었어요. 다시 선택해주세요.');
          setSelectedTemplateId(templates.find((item) => item.isDefault)?.id ?? null);
        } else {
          setBanner(result.error);
        }
        return;
      }
      onSaved(result.nodeId, savedContent);
      onOpenChange(false);
    } catch {
      setBanner('문서를 저장하지 못했어요. 다시 시도해주세요.');
    } finally {
      setSaving(false);
    }
  }

  function handleConfirm() {
    if (selectedTemplateId !== recommended?.templateId && regenerated?.templateId !== selectedTemplateId) {
      setRegenConfirmOpen(true);
      return;
    }
    void doSave(regenerated?.templateId === selectedTemplateId ? regenerated : undefined);
  }

  async function handleRegenConfirm() {
    if (!recommended) return;
    const key = regenKeyRef.current?.templateId === selectedTemplateId
      ? regenKeyRef.current.key
      : crypto.randomUUID();
    regenKeyRef.current = { templateId: selectedTemplateId, key };
    setRegenerating(true);
    setBanner(null);
    try {
      const result = await regenerateDocumentWithTemplateAction({
        workId, proposal, templateId: selectedTemplateId,
        targetFolderId: selectedFolderId, folderVersion: selectedFolderVersion,
        ...generation, idempotencyKey: key,
      });
      setRegenConfirmOpen(false);
      if (!result.ok) {
        if (result.status === 'already_processed') regenKeyRef.current = null;
        setBanner(result.status === 'already_processed' ? CHAT_COPY.processedBody : result.error ?? REGENERATION_FAILED);
        setSelectedTemplateId(recommended.templateId);
        return;
      }
      const value = { content: result.content, name: result.name, templateId: selectedTemplateId };
      setRegenerated(value);
      await doSave(value);
    } catch {
      setRegenConfirmOpen(false);
      setBanner(REGENERATION_FAILED);
      setSelectedTemplateId(recommended.templateId);
    } finally {
      setRegenerating(false);
    }
  }

  function handleRegenCancel() {
    setRegenConfirmOpen(false);
    if (recommended) setSelectedTemplateId(recommended.templateId);
  }

  const busy = saving || regenerating;
  const folderLabel = (folder: FolderCandidate) => folder.isRoot ? `${proposal.category} (최상위)` : folder.path;
  const templateLabel = (template: TemplateChoice) => `${template.name}${template.isDefault ? ' (기본)' : ''}`;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>저장 위치 확인</DialogTitle></DialogHeader>
          {loadState === 'loading' ? (
            <p className="text-sm text-muted-foreground">Jev가 저장 위치를 고르는 중...</p>
          ) : loadState === 'ready' && recommended ? (
            <div className="flex flex-col gap-4">
              {regenerating && <p className="text-sm text-muted-foreground">템플릿에 맞춰 문서를 다시 생성하는 중...</p>}
              {banner && <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-muted p-3 text-sm"><AlertCircle className="size-4 shrink-0" />{banner}</div>}
              <div>
                <p className="text-sm font-semibold">추천 폴더: {recommended.folderPath}</p>
                <p className="text-xs text-muted-foreground">추천 템플릿: {recommended.templateName}</p>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm">저장 폴더 변경</label>
                <Select value={selectedFolderId} onValueChange={(value) => {
                  const folder = folders.find((item) => item.id === value);
                  if (!folder) return;
                  setSelectedFolderId(folder.id);
                  setSelectedFolderVersion(folder.version);
                  setBanner(null);
                }}>
                  <SelectTrigger className="w-full"><SelectValue>{(value: string) => {
                    const folder = folders.find((item) => item.id === value);
                    return folder ? folderLabel(folder) : '폴더를 선택해주세요';
                  }}</SelectValue></SelectTrigger>
                  <SelectContent>{folders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>{folderLabel(folder)}</SelectItem>
                  ))}</SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm">템플릿 변경</label>
                <Select value={selectedTemplateId ?? CANONICAL_TEMPLATE_VALUE} onValueChange={(value) => {
                  const templateId = value === CANONICAL_TEMPLATE_VALUE ? null : value;
                  setSelectedTemplateId(templateId);
                  setBanner(null);
                  if (regenerated?.templateId !== templateId) setRegenerated(null);
                }}>
                  <SelectTrigger className="w-full"><SelectValue>{(value: string) => {
                    const template = templates.find((item) => (item.id ?? CANONICAL_TEMPLATE_VALUE) === value);
                    return template ? templateLabel(template) : '템플릿을 선택해주세요';
                  }}</SelectValue></SelectTrigger>
                  <SelectContent>{TEMPLATE_GROUPS.map(({ scope, label }) => {
                    const options = templates.filter((template) => template.scope === scope);
                    return options.length > 0 && (
                      <SelectGroup key={scope}>
                        <SelectLabel>{label}</SelectLabel>
                        {options.map((template) => (
                          <SelectItem key={template.id ?? 'canonical'} value={template.id ?? CANONICAL_TEMPLATE_VALUE}>{templateLabel(template)}</SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}</SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div role="alert" className="flex gap-2 rounded-md border border-destructive/30 bg-muted p-3 text-sm"><AlertCircle className="size-4 shrink-0" />{banner ?? LOAD_FAILED}</div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>저장하지 않고 닫기</Button>
            <Button disabled={loadState !== 'ready' || busy || !selectedFolderId} onClick={handleConfirm}>{saving ? '저장 중...' : '이 위치에 저장하기'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={regenConfirmOpen} onOpenChange={(next) => { if (!next) handleRegenCancel(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>템플릿을 바꾸면 문서를 다시 생성해야 해요</DialogTitle></DialogHeader>
          <p>다시 생성할까요? 저장 위치는 그대로 유지돼요.</p>
          <DialogFooter>
            <Button variant="outline" disabled={regenerating} onClick={handleRegenCancel}>취소</Button>
            <Button disabled={regenerating} onClick={() => void handleRegenConfirm()}>다시 생성하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
