# -*- coding: utf-8 -*-
"""
LH-EVT-HIRE07（職業安定法以外）および LH-EVT-HIRE08〜14 の根拠別ページを生成するスクリプト
"""
import csv
import hashlib
import html
import os
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
PAGES_DIR = BASE / "docs" / "labor-hr" / "pages"
CSV_DIR = BASE / "docs" / "download" / "labor-hr" / "events" / "csv"
TEMPLATE_PATH = BASE / "docs" / "labor-hr" / "pages" / "LH-EVT-CONS01__57fd71d406.html"

# HIRE07: 職業安定法（第5条の3）は既存のためスキップ
HIRE07_SKIP_HASH = "9786f3ee36"


def compute_hash(basis_name: str, basis_locator: str, basis_url: str) -> str:
    s = basis_name + "||" + basis_locator + "||" + (basis_url or "")
    return hashlib.md5(s.encode("utf-8")).hexdigest()[:10]


def load_csv(event_id: str) -> list[dict]:
    path = CSV_DIR / f"labor-hr_audit_checklist_{event_id}_v0_1.generated.csv"
    if not path.exists():
        return []
    rows = []
    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)
    return rows


def group_by_basis(rows: list[dict]) -> dict[tuple, list[dict]]:
    groups = {}
    for r in rows:
        key = (r.get("basis_name", ""), r.get("basis_locator", ""), r.get("basis_url", ""))
        if key not in groups:
            groups[key] = []
        groups[key].append(r)
    return groups


def sort_by_requirement_id(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda x: x.get("requirement_id", ""))


def generate_html(
    event_id: str,
    event_name: str,
    basis_name: str,
    basis_locator: str,
    basis_url: str,
    rows: list[dict],
    template_html: str,
) -> str:
    basis_display = basis_name + " / " + basis_locator
    title = f"{event_name}｜{basis_name}｜労務・人事制度 要件DB"
    intro = f"本ページは、{event_name}に関して、{basis_name}を根拠として制度上確認が求められる事項を整理した要件一覧です。"

    # 戻るリンク
    back_href = f"../nav/evt/{event_id}.html"

    # テーブル行生成
    url_cell = '-'
    if basis_url:
        url_cell = f'<a class="btn-link" href="{html.escape(basis_url)}" target="_blank">一次情報を開く</a>'

    tbody_rows = []
    for r in sort_by_requirement_id(rows):
        req_id = html.escape(r.get("requirement_id", ""))
        req_text = html.escape(r.get("requirement_text", ""))
        row_html = f'''        <tr data-req-id="{req_id}">
          <td class="req-cell"><span id="{req_id}" class="req-anchor"></span>{req_text}</td>
          <td>{html.escape(basis_display)}</td>
          <td>{url_cell}</td>
        </tr>'''
        tbody_rows.append(row_html)

    tbody_html = "\n".join(tbody_rows)

    # 置換
    out = template_html
    out = out.replace("<title>ハラスメント事案の発生｜労働契約法｜労務・人事制度 要件DB</title>", f"<title>{html.escape(title)}</title>")
    out = out.replace('<a class="back" href="../nav/evt/LH-EVT-CONS01.html">← 根拠一覧に戻る</a>', f'<a class="back" href="{html.escape(back_href)}">← 根拠一覧に戻る</a>')
    out = out.replace("<h1>ハラスメント事案の発生</h1>", f"<h1>{html.escape(event_name)}</h1>")
    out = out.replace(
        "本ページは、ハラスメント事案の発生に関して、労働契約法を根拠として制度上確認が求められる事項を整理した要件一覧です。",
        intro,
    )

    # tbody 部分を置換（正規表現的には独特なので、開始・終了タグで囲まれた部分を特定）
    import re
    tbody_pattern = re.compile(r"<tbody>[\s\S]*?</tbody>", re.DOTALL)
    new_tbody = f"<tbody>\n{tbody_html}\n      </tbody>"
    out = re.sub(tbody_pattern, new_tbody, out)
    # ただしテンプレの根拠列「労働契約法 / 第5条」は各行に含まれているため、tbody 置換で上書きされる

    return out


def main():
    with open(TEMPLATE_PATH, encoding="utf-8") as f:
        template_html = f.read()

    events = [
        "LH-EVT-HIRE07",
        "LH-EVT-HIRE08",
        "LH-EVT-HIRE09",
        "LH-EVT-HIRE10",
        "LH-EVT-HIRE11",
        "LH-EVT-HIRE12",
        "LH-EVT-HIRE13",
        "LH-EVT-HIRE14",
    ]

    created = []
    skipped_existing = []

    for event_id in events:
        rows = load_csv(event_id)
        if not rows:
            continue
        event_name = rows[0].get("event_name", event_id)
        groups = group_by_basis(rows)

        for (basis_name, basis_locator, basis_url), group_rows in groups.items():
            h = compute_hash(basis_name, basis_locator, basis_url)

            # HIRE07: 職業安定法（既存）はスキップ
            if event_id == "LH-EVT-HIRE07" and h == HIRE07_SKIP_HASH:
                skipped_existing.append(f"{event_id}__{h}.html (職業安定法)")
                continue

            filename = f"{event_id}__{h}.html"
            out_path = PAGES_DIR / filename
            if out_path.exists():
                skipped_existing.append(filename)
                continue

            html_content = generate_html(
                event_id=event_id,
                event_name=event_name,
                basis_name=basis_name,
                basis_locator=basis_locator,
                basis_url=basis_url,
                rows=group_rows,
                template_html=template_html,
            )
            with open(out_path, "w", encoding="utf-8") as f:
                f.write(html_content)
            created.append({
                "path": str(out_path),
                "basis_name": basis_name,
                "basis_locator": basis_locator,
                "basis_url": basis_url,
            })

    print("=== 作成したファイル ===")
    for c in created:
        print(f"{c['path']}")
        print(f"  basis_name: {c['basis_name']}, basis_locator: {c['basis_locator']}, basis_url: {c['basis_url']}")

    print("\n=== スキップしたファイル（既存） ===")
    for s in skipped_existing:
        print(s)

    return created


if __name__ == "__main__":
    main()
