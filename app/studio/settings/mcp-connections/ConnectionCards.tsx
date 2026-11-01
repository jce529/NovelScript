'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { disconnectMcpConnectionAction } from './actions';

export type ConnectionCard = { clientId: string; clientName: string; redirectHost: string; connectedAt: string; lastUsedAt: string | null };
type Props = { initialConnections: ConnectionCard[]; loadError: boolean; connectorUrl: string };

function formatDate(value: string, includeTime = false) {
  return new Intl.DateTimeFormat('ko-KR', includeTime
    ? { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric' },
  ).format(new Date(value));
}

function lastUsedLabel(value: string) {
  return Date.now() - new Date(value).getTime() <= 60_000 ? '방금 전' : formatDate(value, true);
}

function ConnectorAddress({ connectorUrl, primary = false }: { connectorUrl: string; primary?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  async function copyAddress() {
    if (!connectorUrl) return;
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(connectorUrl);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      inputRef.current?.select();
      setCopyError(true);
    }
  }

  return <>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input ref={inputRef} aria-label="커넥터 주소" value={connectorUrl} readOnly className="min-w-0 break-all" />
      <Button type="button" variant={primary ? 'default' : 'outline'} className="min-h-11 w-full sm:w-auto" onClick={copyAddress} disabled={!connectorUrl}>
        {copied ? <><Check aria-hidden="true" /> 복사했어요</> : '주소 복사'}
      </Button>
    </div>
    {copied && <p role="status" className="sr-only">복사했어요</p>}
    {copyError && <p role="alert" className="text-sm text-destructive">복사하지 못했어요. 주소를 직접 선택해 복사해 주세요.</p>}
  </>;
}

function ConnectionItem({ connection, onDisconnected, successRef, success }: { connection: ConnectionCard; onDisconnected: (clientId: string) => void; successRef: React.RefObject<HTMLParagraphElement | null>; success: boolean }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const nameId = useId();

  async function disconnect() {
    setDisconnecting(true);
    setError('');
    try {
      const result = await disconnectMcpConnectionAction(connection.clientId);
      if (result.ok || result.status === 'partial') {
        setDialogOpen(false);
        onDisconnected(connection.clientId);
        return;
      }
      setError('연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } catch {
      setError('연결을 해제하지 못했어요. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setDisconnecting(false);
    }
  }

  return <li aria-labelledby={nameId} className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 id={nameId} className="break-all text-lg font-semibold">{connection.clientName}</h3>
        <p className="break-all text-xs text-muted-foreground">{connection.redirectHost}</p>
      </div>
      <dl className="flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:gap-6">
        <div className="flex gap-2"><dt>연결일</dt><dd>{formatDate(connection.connectedAt)}</dd></div>
        {connection.lastUsedAt ? <div className="flex gap-2"><dt>마지막 사용</dt><dd>{lastUsedLabel(connection.lastUsedAt)}</dd></div> : <div><dt className="sr-only">마지막 사용</dt><dd><Badge variant="secondary">아직 사용 안 함</Badge></dd></div>}
      </dl>
    </div>
    <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setError(''); }}>
      <DialogTrigger render={<Button ref={triggerRef} type="button" variant="outline" className="min-h-11 w-full sm:w-auto" aria-label={`${connection.clientName} 연결 해제`} disabled={disconnecting}>연결 해제</Button>} />
      <DialogContent initialFocus={cancelRef} finalFocus={success ? successRef : triggerRef}>
        <DialogHeader><DialogTitle>{connection.clientName} 연결 해제</DialogTitle></DialogHeader>
        <DialogDescription className="space-y-2">
          <span className="block">연결을 해제하면 다음 호출부터 이 커넥터의 접근이 차단돼요.</span>
          <span className="block">다시 사용하려면 Claude에서 커넥터를 새로 연결해야 해요.</span>
          <span className="block text-xs">이미 Claude에 보낸 내용은 NovelScript에서 되돌릴 수 없어요.</span>
        </DialogDescription>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button ref={cancelRef} type="button" variant="outline" disabled={disconnecting}>취소</Button>} />
          <Button type="button" variant="destructive" aria-label={`${connection.clientName} 연결 해제 확인`} disabled={disconnecting} onClick={disconnect}>
            {disconnecting ? <span role="status">해제하는 중…</span> : '연결 해제'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </li>;
}

export default function ConnectionCards({ initialConnections, loadError, connectorUrl }: Props) {
  const [connections, setConnections] = useState(initialConnections);
  const [success, setSuccess] = useState(false);
  const [successTick, setSuccessTick] = useState(0);
  const successRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (successTick > 0) successRef.current?.focus(); }, [successTick]);
  function removeConnection(clientId: string) { setConnections((current) => current.filter((connection) => connection.clientId !== clientId)); setSuccess(true); setSuccessTick((current) => current + 1); }

  if (loadError) return <section className="flex flex-col gap-3" aria-labelledby="connections-heading">
    <h2 id="connections-heading" className="text-lg font-semibold">연결된 커넥터</h2>
    <p role="alert" className="text-sm text-destructive">연결 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">커넥터 주소</h2><p className="text-sm text-muted-foreground">Claude의 설정 &gt; 커넥터에서 커스텀 커넥터를 추가할 때 이 주소를 입력해요.</p><ConnectorAddress connectorUrl={connectorUrl} />
    </section>
  </section>;

  if (connections.length === 0) return <section className="flex flex-col gap-4 rounded-lg border border-border p-4 sm:p-6">
    {success && <p ref={successRef} tabIndex={-1} role="status" className="text-sm">연결을 해제했어요. 다음 호출부터 차단돼요.</p>}
    <h2 className="text-lg font-semibold">연결된 커넥터가 없어요</h2>
    <p className="text-sm text-muted-foreground">Claude에서 NovelScript를 커스텀 커넥터로 추가하면 이곳에 표시돼요. 아래 순서를 따라 해보세요.</p>
    <ol className="list-decimal space-y-2 pl-5 text-sm"><li>Claude에서 설정 &gt; 커넥터를 열어요.</li><li>커스텀 커넥터 추가를 선택하고 아래 주소를 붙여넣어요.</li><li>NovelScript 승인 화면이 열리면 승인하고 연결을 눌러요.</li></ol>
    <ConnectorAddress connectorUrl={connectorUrl} primary />
    <p className="text-xs text-muted-foreground">Claude 웹·데스크톱·모바일에서 연결할 수 있어요. ChatGPT 등 다른 앱은 아직 공식 지원하지 않아요.</p>
  </section>;

  return <>
    <section className="flex flex-col gap-3" aria-labelledby="connections-heading">
      <h2 id="connections-heading" className="text-lg font-semibold">연결된 커넥터</h2>
      {success && <p ref={successRef} tabIndex={-1} role="status" className="text-sm">연결을 해제했어요. 다음 호출부터 차단돼요.</p>}
      <ul className="flex flex-col gap-3">{connections.map((connection) => <ConnectionItem key={connection.clientId} connection={connection} onDisconnected={removeConnection} successRef={successRef} success={success} />)}</ul>
    </section>
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:p-6">
      <h2 className="text-lg font-semibold">커넥터 주소</h2><p className="text-sm text-muted-foreground">Claude의 설정 &gt; 커넥터에서 커스텀 커넥터를 추가할 때 이 주소를 입력해요.</p><ConnectorAddress connectorUrl={connectorUrl} />
    </section>
  </>;
}
