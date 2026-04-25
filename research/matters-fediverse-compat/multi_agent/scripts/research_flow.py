#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKSPACE_ROOT = PROJECT_ROOT.parents[1]
MULTI_AGENT_ROOT = PROJECT_ROOT / "multi_agent"
CONFIG_PATH = MULTI_AGENT_ROOT / "config" / "pipeline.json"
STATE_PATH = MULTI_AGENT_ROOT / "state" / "current_run.json"
BOARD_PATH = MULTI_AGENT_ROOT / "state" / "delivery_board.md"
LEGACY_BOARD_PATH = MULTI_AGENT_ROOT / "state" / "research_board.md"
SOURCE_MANIFEST_PATH = MULTI_AGENT_ROOT / "state" / "source_manifest.json"
RUNS_DIR = MULTI_AGENT_ROOT / "runs"
STAGE_FILE_NAMES = ("brief.md", "spec.md", "review.md", "handoff.md")


def now_iso() -> str:
    return datetime.now().astimezone().replace(microsecond=0).isoformat()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def load_config() -> dict[str, Any]:
    return read_json(CONFIG_PATH)


def classify_suffix(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".md", ".txt"}:
        return "text"
    if suffix in {".pdf"}:
        return "pdf"
    if suffix in {".doc", ".docx"}:
        return "doc"
    return suffix.lstrip(".") or "unknown"


def should_skip(path: Path) -> bool:
    return any(part.startswith(".") for part in path.parts)


def resolve_source_root(source_dir: str) -> Path:
    return (PROJECT_ROOT / source_dir).resolve()


def display_rel_path(path: Path) -> str:
    for base in (PROJECT_ROOT, WORKSPACE_ROOT):
        try:
            return path.relative_to(base).as_posix()
        except ValueError:
            continue
    return path.as_posix()


def display_source_label(source_dir: str) -> str:
    return source_dir.strip("./") or "."


def scan_sources(config: dict[str, Any]) -> dict[str, Any]:
    directories: dict[str, list[dict[str, Any]]] = {}
    total = 0
    for source_dir in config["project"]["source_dirs"]:
        root = resolve_source_root(source_dir)
        entries: list[dict[str, Any]] = []
        if root.exists():
            for file_path in sorted(p for p in root.rglob("*") if p.is_file() and not should_skip(p)):
                entries.append(
                    {
                        "path": display_rel_path(file_path),
                        "kind": classify_suffix(file_path),
                        "size_bytes": file_path.stat().st_size,
                    }
                )
        directories[source_dir] = entries
        total += len(entries)

    return {
        "generated_at": now_iso(),
        "directories": directories,
        "counts": {
            **{name: len(items) for name, items in directories.items()},
            "total": total,
        },
    }


def load_state() -> dict[str, Any]:
    return read_json(STATE_PATH)


def save_state(state: dict[str, Any]) -> None:
    write_json(STATE_PATH, state)


def get_run_dir(run_id: str) -> Path:
    return RUNS_DIR / run_id


def get_run_path(run_id: str) -> Path:
    return get_run_dir(run_id) / "run.json"


def load_active_run() -> dict[str, Any] | None:
    state = load_state()
    run_id = state.get("active_run_id")
    if not run_id:
        return None
    run_path = get_run_path(run_id)
    if not run_path.exists():
        return None
    return read_json(run_path)


def save_run(run_payload: dict[str, Any]) -> None:
    run_path = get_run_path(run_payload["run_id"])
    write_json(run_path, run_payload)


def build_stage_packet(
    run_id: str,
    stage_index: int,
    stage: dict[str, Any],
    config: dict[str, Any],
    manifest: dict[str, Any],
) -> str:
    source_lines = [
        f"- 來源清單: `{SOURCE_MANIFEST_PATH.relative_to(PROJECT_ROOT).as_posix()}`",
    ]
    for source_dir in config["project"]["source_dirs"]:
        source_lines.append(
            f"- {display_source_label(source_dir)} 數量: {manifest['counts'].get(source_dir, 0)}"
        )
    source_lines.append(f"- 總數: {manifest['counts'].get('total', 0)}")

    lines = [
        f"# {stage['title']}",
        "",
        f"- Run ID: `{run_id}`",
        f"- Stage ID: `{stage['id']}`",
        f"- 目標: {stage['objective']}",
        f"- Stage 資料夾: `{stage.get('stage_dir') or 'pending'}`",
        "",
    ]

    if stage.get("brief_path"):
        lines.extend(
            [
                "## 固定 Brief",
                "",
                f"- `{stage['brief_path']}`",
                "",
            ]
        )

    lines.extend(
        [
            "## 交付項目",
            "",
        ]
    )
    for item in stage["deliverables"]:
        lines.append(f"- {item}")

    lines.extend(
        [
            "",
            "## 使用 Prompt",
            "",
            f"- 共用底稿: `{config['shared_prompt']}`",
            f"- 總編排: `{config['orchestrator_prompt']}`",
        ]
    )
    for agent in stage["agents"]:
        lines.append(f"- `{agent}`: `{config['agents'][agent]}`")

    lines.extend(
        [
            "",
            "## 輸出模板",
            "",
            f"- Agent 輸出: `{config['output_template']}`",
            f"- 交接模板: `{config['handoff_template']}`",
            "",
            "## Stage 文件",
            "",
            *[f"- `{name}`" for name in STAGE_FILE_NAMES],
            "",
            "## 可用來源",
            "",
            *source_lines,
            "",
            "## 備註",
            "",
            "- 完成本階段後，使用 `advance` 推進流程",
            "- 如資料夾新增檔案，先執行 `refresh-sources` 再繼續",
            "",
        ]
    )
    return "\n".join(lines)


def write_packets(run_payload: dict[str, Any], config: dict[str, Any], manifest: dict[str, Any]) -> None:
    packets_dir = get_run_dir(run_payload["run_id"]) / "packets"
    packets_dir.mkdir(parents=True, exist_ok=True)
    for index, stage in enumerate(run_payload["stages"], start=1):
        packet_path = packets_dir / f"{index:02d}_{stage['id']}.md"
        packet_text = build_stage_packet(run_payload["run_id"], index, stage, config, manifest)
        packet_path.write_text(packet_text + "\n", encoding="utf-8")
        stage["packet_path"] = packet_path.relative_to(PROJECT_ROOT).as_posix()


def build_stage_stub(kind: str, run_id: str, stage: dict[str, Any]) -> str:
    title_map = {
        "brief.md": "Stage Brief",
        "spec.md": "Stage Spec",
        "review.md": "Stage Review",
        "handoff.md": "Stage Handoff",
    }
    lines = [
        f"# {title_map[kind]}",
        "",
        f"- Run ID: `{run_id}`",
        f"- Stage ID: `{stage['id']}`",
        f"- Title: {stage['title']}",
        f"- Objective: {stage['objective']}",
        f"- Agents: {', '.join(stage['agents'])}",
        "",
    ]
    if kind == "brief.md":
        lines.extend(
            [
                "## Inputs",
                "",
                f"- 固定 brief 參考: `{stage.get('brief_path') or 'none'}`",
                "- 對應 task note、既有 research 與上一輪 handoff",
                "",
                "## Deliverables",
                "",
                *[f"- {item}" for item in stage["deliverables"]],
                "",
                "## Done When",
                "",
                "- 目標、邊界、owner 與驗收條件都已鎖定",
            ]
        )
    elif kind == "spec.md":
        lines.extend(
            [
                "## Decisions To Lock",
                "",
                "- 介面、ID 規則、狀態 owner、失敗情境",
                "",
                "## Acceptance",
                "",
                "- implementer 與 reviewer 可直接對齊",
            ]
        )
    elif kind == "review.md":
        lines.extend(
            [
                "## Checks",
                "",
                "- 協定相容性",
                "- 測試缺口",
                "- blocking gate 與可接受風險",
            ]
        )
    else:
        lines.extend(
            [
                "## Summary",
                "",
                "- 本階段最重要的結論與輸出",
                "",
                "## Next Owner",
                "",
                "- 建議下一棒角色與 verify command",
            ]
        )
    return "\n".join(lines) + "\n"


def write_stage_files(run_payload: dict[str, Any]) -> None:
    stages_root = get_run_dir(run_payload["run_id"]) / "stages"
    stages_root.mkdir(parents=True, exist_ok=True)
    for index, stage in enumerate(run_payload["stages"], start=1):
        stage_dir = stages_root / f"{index:02d}_{stage['id']}"
        stage_dir.mkdir(parents=True, exist_ok=True)
        artifacts: dict[str, str] = {}
        for filename in STAGE_FILE_NAMES:
            file_path = stage_dir / filename
            file_path.write_text(build_stage_stub(filename, run_payload["run_id"], stage), encoding="utf-8")
            artifacts[filename.removesuffix(".md")] = file_path.relative_to(PROJECT_ROOT).as_posix()
        stage["stage_dir"] = stage_dir.relative_to(PROJECT_ROOT).as_posix()
        stage["artifacts"] = artifacts


def build_run_payload(config: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    run_id = datetime.now().astimezone().strftime("%Y%m%d_%H%M%S")
    stages: list[dict[str, Any]] = []
    for index, stage in enumerate(config["stages"]):
        stages.append(
            {
                "id": stage["id"],
                "title": stage["title"],
                "objective": stage["objective"],
                "brief_path": stage.get("brief_path"),
                "agents": stage["agents"],
                "deliverables": stage["deliverables"],
                "status": "in_progress" if index == 0 else "pending",
                "packet_path": None,
                "stage_dir": None,
                "artifacts": {},
            }
        )

    return {
        "run_id": run_id,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "status": "active",
        "current_stage_index": 0,
        "stages": stages,
        "source_counts": manifest["counts"],
    }


def write_journal(run_id: str, line: str) -> None:
    journal_path = get_run_dir(run_id) / "journal.md"
    if not journal_path.exists():
        journal_path.write_text("# Journal\n\n", encoding="utf-8")
    with journal_path.open("a", encoding="utf-8") as handle:
        handle.write(f"- {now_iso()} {line}\n")


def sync_board(state: dict[str, Any], run_payload: dict[str, Any] | None, manifest: dict[str, Any]) -> None:
    current_stage = "無"
    open_questions = "- 尚待在各階段輸出中補上\n"
    pending_materials = "- 可先從 source manifest、stage briefs 與各輪 deliverables 補強\n"
    status_line = state.get("status", "idle")
    if run_payload:
        index = run_payload.get("current_stage_index")
        if isinstance(index, int) and 0 <= index < len(run_payload["stages"]):
            stage = run_payload["stages"][index]
            current_stage = f"{stage['title']} (`{stage['id']}`)"
        elif run_payload.get("status") == "completed":
            current_stage = "全部完成"

    config = load_config()
    lines = [
        "# Delivery Board",
        "",
        "## 目前狀態",
        "",
        f"- {status_line}",
        f"- Active run: `{state.get('active_run_id') or 'none'}`",
        f"- 最後更新: {state.get('last_updated') or 'none'}",
    ]
    for source_dir in config["project"]["source_dirs"]:
        lines.append(f"- {display_source_label(source_dir)} 檔案數: {manifest['counts'].get(source_dir, 0)}")
    lines.extend(
        [
            f"- 總來源數: {manifest['counts'].get('total', 0)}",
            "",
            "## 當前階段",
            "",
            f"- {current_stage}",
            "",
            "## 開放問題",
            "",
            open_questions.rstrip(),
            "",
            "## 待補材料",
            "",
            pending_materials.rstrip(),
            "",
            "## 備註",
            "",
            "- 每完成一輪，請更新對應封包與交接內容",
            "- 若新增材料，先執行 refresh-sources",
        ]
    )
    board_text = "\n".join(lines) + "\n"
    BOARD_PATH.write_text(board_text, encoding="utf-8")
    LEGACY_BOARD_PATH.write_text(board_text, encoding="utf-8")


def bootstrap(new_run: bool) -> None:
    config = load_config()
    manifest = scan_sources(config)
    write_json(SOURCE_MANIFEST_PATH, manifest)

    state = load_state()
    active_run = load_active_run()
    if active_run and active_run.get("status") == "active" and not new_run:
        active_run["updated_at"] = now_iso()
        active_run["source_counts"] = manifest["counts"]
        save_run(active_run)
        state["current_stage_id"] = active_run["stages"][active_run["current_stage_index"]]["id"]
        state["status"] = "active"
        state["last_updated"] = now_iso()
        save_state(state)
        sync_board(state, active_run, manifest)
        print(f"Reused active run {active_run['run_id']}")
        return

    run_payload = build_run_payload(config, manifest)
    run_dir = get_run_dir(run_payload["run_id"])
    run_dir.mkdir(parents=True, exist_ok=True)
    write_stage_files(run_payload)
    write_packets(run_payload, config, manifest)
    save_run(run_payload)
    write_journal(run_payload["run_id"], "bootstrap")

    state["active_run_id"] = run_payload["run_id"]
    state["current_stage_id"] = run_payload["stages"][0]["id"]
    state["status"] = "active"
    state["last_updated"] = now_iso()
    save_state(state)
    sync_board(state, run_payload, manifest)
    print(f"Created run {run_payload['run_id']}")


def status() -> None:
    state = load_state()
    run_payload = load_active_run()
    manifest = read_json(SOURCE_MANIFEST_PATH) if SOURCE_MANIFEST_PATH.exists() else {"counts": {"total": 0}}
    if not run_payload:
        print("No active run")
        return

    completed = sum(1 for stage in run_payload["stages"] if stage["status"] == "completed")
    total = len(run_payload["stages"])
    current_index = run_payload.get("current_stage_index")
    current_stage = "none"
    if isinstance(current_index, int) and 0 <= current_index < total:
        current_stage = run_payload["stages"][current_index]["title"]

    print(f"run_id={run_payload['run_id']}")
    print(f"status={state.get('status')}")
    print(f"current_stage={current_stage}")
    print(f"progress={completed}/{total}")
    print(f"source_total={manifest['counts'].get('total', 0)}")


def current_stage() -> None:
    run_payload = load_active_run()
    if not run_payload:
        print("No active run")
        return

    index = run_payload.get("current_stage_index")
    if not isinstance(index, int) or index >= len(run_payload["stages"]):
        print("Run is complete")
        return

    stage = run_payload["stages"][index]
    print(f"id={stage['id']}")
    print(f"title={stage['title']}")
    print(f"objective={stage['objective']}")
    print(f"agents={','.join(stage['agents'])}")
    print(f"packet={stage['packet_path']}")
    print(f"stage_dir={stage.get('stage_dir')}")


def refresh_sources() -> None:
    config = load_config()
    manifest = scan_sources(config)
    write_json(SOURCE_MANIFEST_PATH, manifest)

    state = load_state()
    run_payload = load_active_run()
    if run_payload:
        run_payload["updated_at"] = now_iso()
        run_payload["source_counts"] = manifest["counts"]
        save_run(run_payload)
    state["last_updated"] = now_iso()
    save_state(state)
    sync_board(state, run_payload, manifest)
    print("Source manifest refreshed")


def advance(note: str) -> None:
    config = load_config()
    manifest = read_json(SOURCE_MANIFEST_PATH) if SOURCE_MANIFEST_PATH.exists() else scan_sources(config)
    if not SOURCE_MANIFEST_PATH.exists():
        write_json(SOURCE_MANIFEST_PATH, manifest)

    state = load_state()
    run_payload = load_active_run()
    if not run_payload:
        raise SystemExit("No active run")

    index = run_payload.get("current_stage_index")
    if not isinstance(index, int) or index >= len(run_payload["stages"]):
        raise SystemExit("Run is already complete")

    run_payload["stages"][index]["status"] = "completed"
    next_index = index + 1
    if next_index < len(run_payload["stages"]):
        run_payload["current_stage_index"] = next_index
        run_payload["stages"][next_index]["status"] = "in_progress"
        state["current_stage_id"] = run_payload["stages"][next_index]["id"]
        state["status"] = "active"
        message = (
            f"completed {run_payload['stages'][index]['id']}; "
            f"moved to {run_payload['stages'][next_index]['id']}"
        )
    else:
        run_payload["current_stage_index"] = len(run_payload["stages"])
        run_payload["status"] = "completed"
        state["current_stage_id"] = None
        state["status"] = "completed"
        message = f"completed final stage {run_payload['stages'][index]['id']}"

    run_payload["updated_at"] = now_iso()
    save_run(run_payload)

    state["active_run_id"] = run_payload["run_id"]
    state["last_updated"] = now_iso()
    save_state(state)
    sync_board(state, run_payload, manifest)

    write_journal(run_payload["run_id"], f"{message} note={note or 'none'}")
    print(message)


def list_agents() -> None:
    config = load_config()
    for name, path in sorted(config["agents"].items()):
        print(f"{name}={path}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Manage the Matters instance interoperability multi-agent delivery workflow.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    bootstrap_parser = subparsers.add_parser("bootstrap", help="Create or reuse a run.")
    bootstrap_parser.add_argument("--new-run", action="store_true", help="Always create a new run.")

    subparsers.add_parser("status", help="Show current run status.")
    subparsers.add_parser("current-stage", help="Show the active stage.")
    subparsers.add_parser("refresh-sources", help="Rebuild the source manifest.")
    subparsers.add_parser("list-agents", help="List available agents.")

    advance_parser = subparsers.add_parser("advance", help="Move to the next stage.")
    advance_parser.add_argument("--note", default="", help="Optional note for the journal.")

    args = parser.parse_args()

    if args.command == "bootstrap":
        bootstrap(new_run=args.new_run)
    elif args.command == "status":
        status()
    elif args.command == "current-stage":
        current_stage()
    elif args.command == "refresh-sources":
        refresh_sources()
    elif args.command == "advance":
        advance(note=args.note)
    elif args.command == "list-agents":
        list_agents()


if __name__ == "__main__":
    main()
