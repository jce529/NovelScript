#!/usr/bin/env python3
"""요구사항 ID 노드를 graphify-out/graph.json에 추가하고 코드·테스트·문서와 잇는다.

`graphify update .` 직후 실행한다 (update가 graph.json을 다시 만들면 이 노드가 사라진다).
여러 번 실행해도 결과가 같다(이전에 추가한 노드·간선은 먼저 지운다).

소스
- .planning/REQUIREMENTS.md  : 대상 ID, 설명, 상태(traceability 표)
- .planning/phases/**/*-PLAN.md    : requirements + files_modified  -> implemented_in / verified_by (plan 단위라 INFERRED)
- .planning/phases/**/*-SUMMARY.md : requirements(-completed)       -> evidenced_by
- .planning/req-map.json     : GSD 밖 구현(Phase 16) 수동 매핑      -> EXTRACTED
- docs/SSOT-PLANNING-IMPLEMENTATION.md : ID가 언급된 줄            -> tracked_in_ssot
- .planning/ROADMAP.md       : ID가 언급된 줄                        -> scheduled_in

범위: v1.1 접두사(PROV BYOK COST MCP AIDOC STUDIO BUGFIX). LEGAL은 phase가 아니므로 제외.
"""
import glob, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
GRAPH = "graphify-out/graph.json"
PREFIXES = ["PROV", "BYOK", "COST", "MCP", "AIDOC", "STUDIO", "BUGFIX"]
ORIGIN = "req-link"
SSOT = "docs/SSOT-PLANNING-IMPLEMENTATION.md"
ROADMAP = ".planning/ROADMAP.md"
REQS = ".planning/REQUIREMENTS.md"


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def frontmatter(p):
    m = re.match(r"---\n(.*?)\n---", read(p), re.S)
    return m.group(1) if m else ""


def fm_list(block, key):
    # 한 줄 인라인 목록. 경로에 [workId] 같은 대괄호가 있으므로 줄 끝의 ]까지 탐욕적으로 잡는다.
    m = re.search(r"^%s:[ \t]*\[(.*)\][ \t]*$" % re.escape(key), block, re.M)
    if m:
        return [x.strip().strip("\"'") for x in m.group(1).split(",") if x.strip()]
    m = re.search(r"^%s:\s*\n((?:\s+-.*\n?)+)" % re.escape(key), block, re.M)
    if m:
        return [re.sub(r"^\s*-\s*", "", l).strip().strip("\"'") for l in m.group(1).splitlines()]
    m = re.search(r"^%s:\s*(\S.*)$" % re.escape(key), block, re.M)
    return [x.strip() for x in m.group(1).split(",")] if m else []


def fm_summary_files(block):
    out = []
    for sub in ("created", "modified"):
        m = re.search(r"^\s+%s:\s*(.*)" % sub, block, re.M)
        if not m:
            continue
        if m.group(1).startswith("["):
            out += [x.strip().strip("\"'") for x in m.group(1).strip("[]").split(",") if x.strip()]
        else:
            idx = block.index(m.group(0)) + len(m.group(0))
            for l in block[idx:].splitlines()[1:]:
                if re.match(r"\s+-\s", l):
                    out.append(re.sub(r"^\s*-\s*", "", l).strip().strip("\"'"))
                else:
                    break
    return out


def expand_ids(line):
    """'BYOK-05~09', 'PROV-01~05, 07', 'MCP-01' 같은 표기를 ID 목록으로 펼친다."""
    ids = []
    pat = r"\b(%s)-(\d\d)(?:~(\d\d))?((?:,\s*\d\d(?!\d))*)" % "|".join(PREFIXES)
    for m in re.finditer(pat, line):
        p, a, b, rest = m.groups()
        nums = [int(a)] if not b else list(range(int(a), int(b) + 1))
        nums += [int(x) for x in re.findall(r"\d\d", rest or "")]
        ids += ["%s-%02d" % (p, n) for n in nums]
    return ids


def main():
    g = json.load(open(GRAPH, encoding="utf-8"))
    g["nodes"] = [n for n in g["nodes"] if n.get("_origin") != ORIGIN]
    g["links"] = [l for l in g["links"] if l.get("_origin") != ORIGIN]

    by_file = {}
    for n in g["nodes"]:
        by_file.setdefault(n.get("source_file", ""), []).append(n)

    def file_node(path):
        ns = by_file.get(path)
        if not ns:
            return None
        base = os.path.basename(path)
        for n in ns:
            if n.get("label") == base:
                return n["id"]
        for n in ns:
            if n.get("source_location") in (None, "L1"):
                return n["id"]
        return ns[0]["id"]

    warnings = []
    not_in_graph = set()

    # 1) 대상 ID, 설명, 상태
    req_text = read(REQS)
    status, phase = {}, {}
    for m in re.finditer(r"^\|\s*((?:%s)-\d\d)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$" % "|".join(PREFIXES), req_text, re.M):
        phase[m.group(1)], status[m.group(1)] = m.group(2), m.group(3)
    desc = {m.group(1): m.group(2).strip() for m in re.finditer(r"^- \[[ x]\] \*\*([A-Z]+-\d\d)\*\*:\s*(.+)$", req_text, re.M)}
    ids = sorted(status)
    if not ids:
        sys.exit("traceability 표에서 대상 ID를 찾지 못했다")

    edges = {}  # (req, relation, target_path) -> attrs

    def add(req, rel, path, conf, score, basis, **extra):
        if not path:
            return
        if file_node(path) is None:
            not_in_graph.add(path)
            return
        key = (req, rel, path)
        cur = edges.get(key)
        if cur and cur["confidence_score"] >= score:
            return
        edges[key] = dict(confidence=conf, confidence_score=score, basis=basis, **extra)

    # 2) PLAN: requirements + files_modified
    for f in sorted(glob.glob(".planning/phases/**/*-PLAN.md", recursive=True)):
        b = frontmatter(f)
        reqs = [r for r in fm_list(b, "requirements") if r in status]
        if not reqs:
            continue
        for x in fm_list(b, "files_modified"):
            if x.startswith(".planning/"):
                continue
            if not os.path.exists(x):
                warnings.append("사라진 파일: %s (%s)" % (x, os.path.basename(f)))
                continue
            rel = "verified_by" if x.startswith("tests/") else "implemented_in"
            for r in reqs:
                add(r, rel, x, "INFERRED", 0.6, "plan-files-modified:" + os.path.basename(f)[:5])

    # 3) SUMMARY: 완료 증거
    for f in sorted(glob.glob(".planning/phases/**/*-SUMMARY.md", recursive=True)):
        b = frontmatter(f)
        for r in fm_list(b, "requirements-completed") or fm_list(b, "requirements"):
            if r in status:
                add(r, "evidenced_by", f, "EXTRACTED", 1.0, "summary-frontmatter")

    # 4) 수동 매핑 (PLAN 없는 phase)
    mp = ".planning/req-map.json"
    if os.path.exists(mp):
        for r, v in json.load(open(mp, encoding="utf-8")).items():
            if r.startswith("_"):
                continue
            if r not in status:
                warnings.append("req-map.json의 알 수 없는 ID: " + r)
                continue
            for rel in ("implemented_in", "verified_by", "evidenced_by"):
                for p in v.get(rel, []):
                    if not os.path.exists(p):
                        warnings.append("req-map.json의 없는 파일: %s (%s)" % (p, r))
                        continue
                    add(r, rel, p, "EXTRACTED", 1.0, "req-map.json")

    # 5) SSOT·ROADMAP·REQUIREMENTS 언급
    for path, rel in ((SSOT, "tracked_in_ssot"), (ROADMAP, "scheduled_in")):
        seen = {}
        for i, line in enumerate(read(path).splitlines(), 1):
            for r in expand_ids(line):
                if r in status and r not in seen:
                    seen[r] = i
        for r, i in seen.items():
            add(r, rel, path, "EXTRACTED", 1.0, "mention", line=i)
    for r in ids:
        add(r, "defined_in", REQS, "EXTRACTED", 1.0, "traceability")

    # 6) 그래프에 반영
    def nid(r):
        return "req_" + r.lower().replace("-", "_")

    for r in ids:
        g["nodes"].append({
            "id": nid(r), "label": r, "norm_label": r.lower(), "file_type": "concept",
            "source_file": REQS, "source_location": None, "_origin": ORIGIN,
            "requirement_status": status[r], "requirement_phase": phase[r],
            "description": desc.get(r, ""),
        })
    for (r, rel, path), a in sorted(edges.items()):
        g["links"].append({
            "source": nid(r), "target": file_node(path), "relation": rel, "_origin": ORIGIN,
            "source_file": REQS, "weight": a["confidence_score"], **a,
        })
    json.dump(g, open(GRAPH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # 리포트
    print("요구사항 노드 %d개, 간선 %d개" % (len(ids), len(edges)))
    print("%-10s %5s %5s %5s %5s %5s" % ("ID", "impl", "test", "evid", "ssot", "road"))
    gaps = []
    for r in ids:
        c = {k: sum(1 for (rr, rel, _) in edges if rr == r and rel == k) for k in
             ("implemented_in", "verified_by", "evidenced_by", "tracked_in_ssot", "scheduled_in")}
        print("%-10s %5d %5d %5d %5d %5d  %s" % (r, *c.values(), status[r][:40]))
        if not c["implemented_in"]:
            gaps.append(r)
    print("\nimplemented_in 없음(%d): %s" % (len(gaps), " ".join(gaps)))
    if not_in_graph:
        print("\n그래프에 노드가 없는 파일(간선 생략, %d): %s" % (len(not_in_graph), ", ".join(sorted(not_in_graph))))
    for w in sorted(set(warnings)):
        print("경고:", w)


if __name__ == "__main__":
    main()
