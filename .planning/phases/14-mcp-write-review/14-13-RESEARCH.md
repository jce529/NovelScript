# 14-13 패치 형식 — RESEARCH

작성: 2026-11-10. 근거는 병합 브랜치 코드를 직접 읽은 것과 공식 문서 두 곳이다. 코드를 실행해 확인한 항목은 따로 표시했다.

## 1. 현재 코드가 하는 일 (직접 읽음)
| 위치 | 사실 |
|---|---|
| `lib/mcp/tools/proposals.ts` | `saveDraftInputSchema = {workId, chapterId, content(1~100000)}`, `proposeKbDocumentInputSchema = discriminatedUnion('mode', create | edit)`. 둘 다 strictObject. 내부 `propose()`가 `mcp_propose_*` RPC를 부른다. RPC 반환은 `{id,status,expires_at,superseded_id}` |
| `0041`/`0043` `mcp_propose_chapter_draft`, `mcp_propose_kb_edit` | 소유권 확인 → `p_content` 정규화(`mcp_proposal_normalize`) → **같은 트랜잭션에서 원본을 읽어** `base_content`·`base_hash`(sha256 hex, UTF-8) 저장 → 원본과 같으면 `mcp_no_change` → 동일 텍스트 중복 제거 → 상한 확인 → INSERT |
| `0043` `mcp_proposal_normalize` | CRLF/CR → LF, 제어 문자·BOM·양방향 제어 문자 제거, 길이·공백 검사. TAB·LF·끝 공백 보존 |
| `0042` 수락 RPC | 전체 `content`를 저장. 현재 원본 해시가 서버 액션이 본 해시와 다르면 `mcp_stale`. 패치와 무관 |
| `lib/mcp/tools/kb.ts` `get_kb_document` | `document.content`를 `textPage(content, offset, maxChars)`로 잘라 돌려준다. 해시 필드 없음 |
| `lib/mcp/tools/works.ts` `get_chapter` | `mcp_read_owned_chapter_content` RPC로 본문을 읽는다. 해시 필드 없음 |
| `lib/mcp/tool-runtime.ts` | `mcpRpcError`가 RPC 오류 메시지를 고정 한국어 문구로 바꾼다(AI에게 새는 내부 문구 방지). 패치 오류의 "후보 위치·문맥"을 AI에게 돌려주려면 이 경계를 어떻게 지킬지 plan에서 정해야 한다 |

해시 규칙: `base_hash = sha256(UTF-8(원본 텍스트 그대로))`, 원본이 null이면 빈 문자열. 읽기 도구의 `contentHash`도 같은 규칙이어야 한다.

## 2. 공식 문서의 edit 도구 관행
- **Anthropic 텍스트 편집 도구**(`str_replace_based_edit_tool`, `str_replace`): `old_str`은 공백·들여쓰기까지 정확히 일치해야 하고, 문서에 "일치 없음"과 "여러 곳 일치" 오류 사례가 따로 있다(구현은 클라이언트 몫). 출처: platform.claude.com 텍스트 편집 도구 문서.
- **MCP 참조 filesystem 서버 `edit_file`**: `edits: [{oldText, newText}]` 배열 + `dryRun`. 하나라도 일치하지 않으면 **하나도 적용하지 않고**, 실패한 edit을 가리키며 가장 가까운 줄을 보여 준다. 줄 끝 차이는 무시하고, 못 찾으면 줄 단위로 앞뒤 공백을 제거해 비교하지만 줄 안쪽 공백은 엄격하다. 출처: github.com/modelcontextprotocol/servers `src/filesystem`.
- 시사점: (a) 정확 일치 + 유일성 + 전부 성공/전부 취소는 업계 관행과 같다. (b) 줄 끝 차이 처리는 우리 CRLF 사정과 직접 관련된다. (c) 유일성 실패 시 가까운 후보를 보여 주는 오류가 자가 복구의 핵심이다. (d) 두 도구 모두 `replace_range` 같은 시작·끝 앵커 연산은 없다 — 우리 쪽 신규 설계라 검증 부담이 크다.

## 3. 위험과 확인할 것 (research 결론)
1. **CRLF 원본.** 원본이 CRLF를 포함할 수 있다(DB 테스트에 실제 사례). AI가 읽은 텍스트에는 `\r\n`이 그대로 보이는데 JSON 인자의 `find`는 `\n`일 수 있다. 일치 판정을 "원본의 LF 사본"에서 하고 결과를 LF 제안본으로 만들 것인지, 원문 그대로에서 할 것인지 plan에서 결정해야 한다. 기존 전체 교체도 제안은 LF로 저장되고 원본(base_content)은 원문이라, 문단 비교 쪽 처리를 먼저 확인해야 한다.
2. **1회 일치 판정은 겹침을 포함해 세는가.** 문자열 `strpos` 반복 방식이 안전하다. 정규식에 `find`를 넣지 않는다(정규식 폭주·주입 방지). `find`는 리터럴로만 취급한다.
3. **대용량.** `edits` 개수·각 문자열 길이 상한, 결과 길이 상한을 RPC 안에서 먼저 검사한다. 원본 전체에 대해 `edits`마다 선형 검색이므로 곱이 작게 유지되는지 상한으로 확인한다.
4. **오류 문맥 노출.** 후보 위치의 앞뒤 20자는 작가 본인 문서의 일부이고 호출자도 같은 작가의 AI다. 새로 노출되는 정보가 아니지만, `mcpRpcError`의 고정 문구 경계와 충돌하므로 별도의 구조화된 오류 형식을 정해야 한다.
5. **읽기 도구 변경.** `contentHash` 추가는 기존 응답 필드를 건드리지 않는 추가다. 쪼개 읽기(offset)에서도 해시는 문서 전체의 해시여야 한다.
6. **수락 쪽 영향 없음.** 제안 시점에 전체 제안본으로 풀어 저장하므로 0042 수락·되돌리기와 덩어리 비교 UI는 그대로다. 단, 작가 리뷰 큐는 패치를 보여 줄 때 앞뒤 문맥을 함께 보이는 것이 자연스러운지(후속) 확인할 가치가 있다.
7. **토큰 절감 수치는 아직 가정치.** 실제 사용 로그가 없다. 측정 방법을 plan의 검증 항목에 넣는다.

## 4. 범위 밖
일괄 치환 연산, 범위 밖 변경 경고 UI(`anchor_meta` 소비), 실제 Claude 커넥터에서의 호출 품질 측정(14-09 수동 인수 이후).
