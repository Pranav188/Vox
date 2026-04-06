from __future__ import annotations

import argparse
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
    "o": "urn:schemas-microsoft-com:office:office",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "v": "urn:schemas-microsoft-com:vml",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
    "w10": "urn:schemas-microsoft-com:office:word",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wne": "http://schemas.microsoft.com/office/word/2006/wordml",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "pic": "http://schemas.openxmlformats.org/drawingml/2006/picture",
    "wpg": "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup",
    "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
    "w14": "http://schemas.microsoft.com/office/word/2010/wordml",
}


for prefix, uri in NS.items():
    ET.register_namespace(prefix, uri)


def qn(tag: str) -> str:
    prefix, name = tag.split(":")
    return f"{{{NS[prefix]}}}{name}"


def read_markdown(path: Path) -> dict:
    lines = path.read_text(encoding="utf-8").splitlines()
    data = {
        "title": "",
        "author": "",
        "affiliation": "",
        "email": "",
        "abstract": "",
        "keywords": "",
        "sections": [],
    }

    current_section = None
    current_paragraph: list[str] = []

    def flush_paragraph() -> None:
        nonlocal current_paragraph, current_section
        if not current_paragraph or current_section is None:
            current_paragraph = []
            return
        text = " ".join(part.strip() for part in current_paragraph).strip()
        if text:
            current_section["content"].append({"type": "paragraph", "text": text})
        current_paragraph = []

    for raw_line in lines:
        line = raw_line.rstrip()

        if line.startswith("# "):
            data["title"] = line[2:].strip()
            continue
        if line.startswith("Author: "):
            data["author"] = line[len("Author: ") :].strip()
            continue
        if line.startswith("Affiliation: "):
            data["affiliation"] = line[len("Affiliation: ") :].strip()
            continue
        if line.startswith("Email: "):
            data["email"] = line[len("Email: ") :].strip()
            continue
        if line.startswith("## Abstract"):
            flush_paragraph()
            current_section = {"heading": "Abstract", "content": []}
            data["sections"].append(current_section)
            continue
        if line.startswith("## Keywords"):
            flush_paragraph()
            current_section = {"heading": "Keywords", "content": []}
            data["sections"].append(current_section)
            continue
        if line.startswith("## "):
            flush_paragraph()
            current_section = {"heading": line[3:].strip(), "content": []}
            data["sections"].append(current_section)
            continue
        if line.startswith("### "):
            flush_paragraph()
            if current_section is None:
                raise ValueError("Encountered subsection before section.")
            current_section["content"].append({"type": "subheading", "text": line[4:].strip()})
            continue
        if not line.strip():
            flush_paragraph()
            continue

        current_paragraph.append(line)

    flush_paragraph()

    for section in data["sections"]:
        if section["heading"] == "Abstract" and section["content"]:
            data["abstract"] = " ".join(item["text"] for item in section["content"] if item["type"] == "paragraph")
        elif section["heading"] == "Keywords" and section["content"]:
            data["keywords"] = " ".join(item["text"] for item in section["content"] if item["type"] == "paragraph")

    data["sections"] = [
        section for section in data["sections"] if section["heading"] not in {"Abstract", "Keywords"}
    ]
    return data


def make_text_run(paragraph: ET.Element, text: str, *, bold: bool = False, italic: bool = False, size: int | None = None) -> None:
    run = ET.SubElement(paragraph, qn("w:r"))
    run_pr = ET.SubElement(run, qn("w:rPr"))
    if bold:
        ET.SubElement(run_pr, qn("w:b"))
    if italic:
        ET.SubElement(run_pr, qn("w:i"))
    if size is not None:
        ET.SubElement(run_pr, qn("w:sz"), {qn("w:val"): str(size)})
        ET.SubElement(run_pr, qn("w:szCs"), {qn("w:val"): str(size)})
    text_el = ET.SubElement(run, qn("w:t"))
    if text.startswith(" ") or text.endswith(" ") or "  " in text:
        text_el.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    text_el.text = text


def add_column_break_run(paragraph: ET.Element) -> None:
    run = ET.SubElement(paragraph, qn("w:r"))
    ET.SubElement(run, qn("w:br"), {qn("w:type"): "column"})


def add_paragraph(
    body: ET.Element,
    text: str = "",
    *,
    style: str = "BodyText",
    align: str | None = None,
    first_line: int | None = None,
    left: int | None = None,
    right: int | None = None,
    spacing_before: int | None = None,
    spacing_after: int | None = None,
    line: int | None = None,
    size: int | None = None,
    bold: bool = False,
    italic: bool = False,
) -> ET.Element:
    paragraph = ET.SubElement(body, qn("w:p"))
    p_pr = ET.SubElement(paragraph, qn("w:pPr"))
    if style:
        ET.SubElement(p_pr, qn("w:pStyle"), {qn("w:val"): style})
    spacing_attrs = {}
    if spacing_before is not None:
        spacing_attrs[qn("w:before")] = str(spacing_before)
    if spacing_after is not None:
        spacing_attrs[qn("w:after")] = str(spacing_after)
    if line is not None:
        spacing_attrs[qn("w:line")] = str(line)
        spacing_attrs[qn("w:lineRule")] = "auto"
    if spacing_attrs:
        ET.SubElement(p_pr, qn("w:spacing"), spacing_attrs)
    ind_attrs = {}
    if left is not None:
        ind_attrs[qn("w:left")] = str(left)
    if right is not None:
        ind_attrs[qn("w:right")] = str(right)
    if first_line is not None:
        ind_attrs[qn("w:firstLine")] = str(first_line)
    if ind_attrs:
        ET.SubElement(p_pr, qn("w:ind"), ind_attrs)
    if align:
        ET.SubElement(p_pr, qn("w:jc"), {qn("w:val"): align})
    if text:
        make_text_run(paragraph, text, bold=bold, italic=italic, size=size)
    return paragraph


def add_labelled_paragraph(body: ET.Element, label: str, content: str) -> None:
    paragraph = ET.SubElement(body, qn("w:p"))
    p_pr = ET.SubElement(paragraph, qn("w:pPr"))
    ET.SubElement(p_pr, qn("w:pStyle"), {qn("w:val"): "BodyText"})
    ET.SubElement(
        p_pr,
        qn("w:spacing"),
        {
            qn("w:before"): "90",
            qn("w:after"): "0",
            qn("w:line"): "230",
            qn("w:lineRule"): "auto",
        },
    )
    ET.SubElement(p_pr, qn("w:ind"), {qn("w:left"): "259", qn("w:firstLine"): "199"})
    ET.SubElement(p_pr, qn("w:jc"), {qn("w:val"): "both"})
    make_text_run(paragraph, label, bold=True, italic=label.startswith("Abstract"), size=18)
    make_text_run(paragraph, content, size=18, bold=True)


def add_section_heading(body: ET.Element, text: str) -> None:
    add_paragraph(
        body,
        text,
        style="BodyText",
        align="center",
        spacing_before=140,
        spacing_after=30,
        line=220,
        size=20,
        bold=True,
    )


def add_subheading(body: ET.Element, text: str) -> None:
    add_paragraph(
        body,
        text,
        style="BodyText",
        align="left",
        spacing_before=100,
        spacing_after=25,
        line=220,
        size=20,
        italic=True,
    )


def add_body_paragraph(body: ET.Element, text: str) -> None:
    add_paragraph(
        body,
        text,
        style="BodyText",
        align="both",
        spacing_before=70,
        spacing_after=0,
        first_line=199,
        left=259,
        line=230,
        size=20,
    )


def add_reference_paragraph(body: ET.Element, text: str) -> None:
    add_paragraph(
        body,
        text,
        style="ListParagraph",
        align="both",
        spacing_before=35,
        spacing_after=0,
        left=564,
        right=257,
        line=230,
        size=16,
    )


def add_section_properties(
    paragraph: ET.Element,
    *,
    columns: int | None = None,
    equal_width: bool = False,
    top: str = "900",
    bottom: str = "280",
    left: str = "720",
    right: str = "720",
) -> None:
    p_pr = paragraph.find(qn("w:pPr"))
    if p_pr is None:
        p_pr = ET.SubElement(paragraph, qn("w:pPr"))
    sect_pr = ET.SubElement(p_pr, qn("w:sectPr"))
    ET.SubElement(sect_pr, qn("w:type"), {qn("w:val"): "continuous"})
    ET.SubElement(sect_pr, qn("w:pgSz"), {qn("w:w"): "12240", qn("w:h"): "15840"})
    ET.SubElement(
        sect_pr,
        qn("w:pgMar"),
        {
            qn("w:top"): top,
            qn("w:bottom"): bottom,
            qn("w:left"): left,
            qn("w:right"): right,
        },
    )
    if columns is not None:
        ET.SubElement(
            sect_pr,
            qn("w:cols"),
            {
                qn("w:num"): str(columns),
                qn("w:equalWidth"): "1" if equal_width else "0",
            },
        )


def author_blocks(manuscript: dict) -> list[dict]:
    return [
        {
            "prefix": "1st",
            "name": "Hetanshi Shah",
            "affiliation": "dept. name of organization (of Aff.) name of organization (of Aff.)",
            "location": "City, Country",
            "email": "email address or ORCID",
        },
        {
            "prefix": "2nd",
            "name": "Sambit Mazumder",
            "affiliation": "dept. name of organization (of Aff.) name of organization (of Aff.)",
            "location": "City, Country",
            "email": "email address or ORCID",
        },
        {
            "prefix": "3rd",
            "name": "Ashirwad Kathavate",
            "affiliation": "dept. name of organization (of Aff.) name of organization (of Aff.)",
            "location": "City, Country",
            "email": "email address or ORCID",
        },
        {
            "prefix": "4th",
            "name": "Vishal Mane",
            "affiliation": "dept. name of organization (of Aff.) name of organization (of Aff.)",
            "location": "City, Country",
            "email": "email address or ORCID",
        },
        {
            "prefix": "5th",
            "name": "Mrs. Soniya Khatu",
            "affiliation": "dept. name of organization (of Aff.) name of organization (of Aff.)",
            "location": "City, Country",
            "email": "email address or ORCID",
        },
    ]


def add_author_block(
    body: ET.Element,
    author: dict,
    *,
    column_break: bool = False,
) -> None:
    name_p = add_paragraph(body, "", style="", align="center", spacing_before=115, spacing_after=0, size=22)
    if column_break:
        add_column_break_run(name_p)
    # Match template ordinal styling, e.g., "1st" with superscript suffix.
    ordinal = author["prefix"]
    number = "".join(ch for ch in ordinal if ch.isdigit())
    suffix = ordinal[len(number) :]
    make_text_run(name_p, number, size=22)
    if suffix:
        run = ET.SubElement(name_p, qn("w:r"))
        run_pr = ET.SubElement(run, qn("w:rPr"))
        ET.SubElement(run_pr, qn("w:sz"), {qn("w:val"): "22"})
        ET.SubElement(run_pr, qn("w:szCs"), {qn("w:val"): "22"})
        ET.SubElement(run_pr, qn("w:vertAlign"), {qn("w:val"): "superscript"})
        t = ET.SubElement(run, qn("w:t"))
        t.text = suffix
    make_text_run(name_p, f" {author['name']}", size=22)

    aff_p = add_paragraph(body, "", style="", align="center", spacing_before=15, spacing_after=0, size=20, italic=True)
    make_text_run(aff_p, author["affiliation"], italic=True, size=20)

    city_p = add_paragraph(body, author["location"], style="BodyText", align="center", spacing_before=1, spacing_after=0, size=20)
    add_paragraph(body, author["email"], style="BodyText", align="center", spacing_before=16, spacing_after=0, size=20)


def build_document(manuscript: dict) -> ET.ElementTree:
    root = ET.Element(
        qn("w:document"),
        {
            qn("mc:Ignorable"): "w14",
        },
    )

    body = ET.SubElement(root, qn("w:body"))

    title_p = add_paragraph(
        body,
        manuscript["title"],
        style="Title",
        align="center",
        line=242,
    )

    add_paragraph(body, "", style="BodyText", spacing_before=3, spacing_after=0, left=0, align="left", size=17)
    title_section_end = add_paragraph(body, "", style="BodyText", spacing_before=0, spacing_after=0, align="left", size=17)
    add_section_properties(title_section_end, columns=None)

    authors = author_blocks(manuscript)
    add_author_block(body, authors[0], column_break=False)
    add_author_block(body, authors[1], column_break=True)
    add_author_block(body, authors[2], column_break=True)
    first_row_end = add_paragraph(body, "", style="BodyText", spacing_before=0, spacing_after=0, align="center", size=12)
    add_section_properties(first_row_end, columns=3)

    add_paragraph(body, "", style="BodyText", spacing_before=0, spacing_after=0, align="left", size=12)
    second_row_prelude = add_paragraph(body, "", style="BodyText", spacing_before=0, spacing_after=0, align="left", size=12)
    add_section_properties(second_row_prelude, columns=None)

    add_author_block(body, authors[3], column_break=False)
    add_author_block(body, authors[4], column_break=True)
    second_row_end = add_paragraph(body, "", style="BodyText", spacing_before=0, spacing_after=0, align="center", size=12)
    add_section_properties(second_row_end, columns=2)

    add_paragraph(body, "", style="BodyText", spacing_before=0, spacing_after=0, align="left", size=12)
    add_paragraph(body, "", style="BodyText", spacing_before=171, spacing_after=0, align="left", size=12)
    abstract_prelude = add_paragraph(body, "", style="BodyText", spacing_before=0, spacing_after=0, align="left", size=12)
    add_section_properties(abstract_prelude, columns=None)

    add_labelled_paragraph(body, "Abstract—", manuscript["abstract"])
    add_labelled_paragraph(body, "Index Terms—", manuscript["keywords"])

    for section in manuscript["sections"]:
        heading = section["heading"]
        if heading == "References":
            add_section_heading(body, "REFERENCES")
            for item in section["content"]:
                if item["type"] == "paragraph":
                    add_reference_paragraph(body, item["text"])
            continue

        add_section_heading(body, heading)
        for item in section["content"]:
            if item["type"] == "subheading":
                add_subheading(body, item["text"])
            elif item["type"] == "paragraph":
                add_body_paragraph(body, item["text"])

    final_sect = ET.SubElement(body, qn("w:sectPr"))
    ET.SubElement(final_sect, qn("w:pgSz"), {qn("w:w"): "12240", qn("w:h"): "15840"})
    ET.SubElement(
        final_sect,
        qn("w:pgMar"),
        {
            qn("w:top"): "920",
            qn("w:bottom"): "280",
            qn("w:left"): "720",
            qn("w:right"): "720",
        },
    )
    ET.SubElement(
        final_sect,
        qn("w:cols"),
        {
            qn("w:num"): "2",
            qn("w:equalWidth"): "0",
        },
    )

    return ET.ElementTree(root)


def generate_docx(template_path: Path, manuscript_path: Path, output_path: Path) -> None:
    manuscript = read_markdown(manuscript_path)
    document_tree = build_document(manuscript)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(template_path, "r") as src, zipfile.ZipFile(output_path, "w", compression=zipfile.ZIP_DEFLATED) as dst:
        for item in src.infolist():
            if item.filename == "word/document.xml":
                xml_bytes = ET.tostring(document_tree.getroot(), encoding="utf-8", xml_declaration=True)
                dst.writestr(item, xml_bytes)
            else:
                dst.writestr(item, src.read(item.filename))


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate a DOCX paper from a markdown manuscript and IEEE template.")
    parser.add_argument("--template", required=True, type=Path)
    parser.add_argument("--manuscript", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    generate_docx(args.template, args.manuscript, args.output)


if __name__ == "__main__":
    main()
