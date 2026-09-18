#!/usr/bin/env python3
"""Extract one Sketchfab inner Raptor into a theater-space GLB (meters × U).

Source: Ijsz23 "SpaceX Starship Superheavy V3" (CC BY 4.0).
Reads the Sketchfab zip, takes RAPTOR inner 1 (meshes 6+7), recenters,
maps Y-up −Y-nozzle onto theater −Z, and writes an uncompressed GLB.
Decimate / resize with gltf-transform afterwards.

Axis remap matches src/scene/craft/raptorGltf.ts sketchfabRaptorToTheater.
"""
from __future__ import annotations

import json
import struct
import sys
import zipfile
from pathlib import Path

U = 1 / 40  # src/scene/craft/dimensions.ts
INNER_NODE = "RAPTOR inner 1_3"
TEX_FILES = [
    "textures/RAPTOR_-_inner_3_baseColor.png",
    "textures/RAPTOR_-_inner_3_metallicRoughness.png",
    "textures/RAPTOR_-_inner_3_emissive.png",
    "textures/RAPTOR_-_inner_3_normal.png",
]


def _bv_off(acc: dict, views: list) -> tuple[dict, int]:
    view = views[acc["bufferView"]]
    return view, view.get("byteOffset", 0) + acc.get("byteOffset", 0)


def read_vec(buf: bytes, acc: dict, views: list, ncomp: int) -> list[tuple[float, ...]]:
    view, off = _bv_off(acc, views)
    stride = view.get("byteStride") or ncomp * 4
    out = []
    for i in range(acc["count"]):
        o = off + i * stride
        out.append(struct.unpack_from("<" + "f" * ncomp, buf, o))
    return out


def read_u32(buf: bytes, acc: dict, views: list) -> list[int]:
    view, off = _bv_off(acc, views)
    stride = view.get("byteStride") or 4
    return [struct.unpack_from("<I", buf, off + i * stride)[0] for i in range(acc["count"])]


def remap_pos(x: float, y: float, z: float, c: tuple[float, float, float]) -> tuple[float, float, float]:
    return ((x - c[0]) * U, (z - c[2]) * U, (y - c[1]) * U)


def remap_nrm(x: float, y: float, z: float) -> tuple[float, float, float]:
    return (x, z, y)


def pack_f32(vals: list[tuple[float, ...]]) -> bytes:
    flat = [c for v in vals for c in v]
    return struct.pack("<" + "f" * len(flat), *flat)


def pack_u32(vals: list[int]) -> bytes:
    return struct.pack("<" + "I" * len(vals), *vals)


def pad4(b: bytes, fill: bytes = b"\x00") -> bytes:
    n = (4 - (len(b) % 4)) % 4
    return b + (fill * n)


def write_glb(path: Path, doc: dict, blob: bytes) -> None:
    js = pad4(json.dumps(doc, separators=(",", ":")).encode("utf-8"), b" ")
    raw = pad4(blob, b"\x00")
    length = 12 + 8 + len(js) + 8 + len(raw)
    with path.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, length))
        f.write(struct.pack("<II", len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack("<II", len(raw), 0x004E4942))
        f.write(raw)


def prim_geom(gltf: dict, buf: bytes, mesh_i: int) -> dict:
    views = gltf["bufferViews"]
    accs = gltf["accessors"]
    prim = gltf["meshes"][mesh_i]["primitives"][0]
    attrs = prim["attributes"]
    pos = read_vec(buf, accs[attrs["POSITION"]], views, 3)
    nrm = read_vec(buf, accs[attrs["NORMAL"]], views, 3)
    uvs = [read_vec(buf, accs[attrs[f"TEXCOORD_{k}"]], views, 2) for k in range(4)]
    idx = read_u32(buf, accs[prim["indices"]], views)
    return {"pos": pos, "nrm": nrm, "uvs": uvs, "idx": idx}


def extract(zip_path: Path, out_path: Path) -> None:
    with zipfile.ZipFile(zip_path) as z:
        gltf = json.loads(z.read("scene.gltf"))
        buf = z.read("scene.bin")
        tex_blobs = [z.read(name) for name in TEX_FILES]
    node = next(n for n in gltf["nodes"] if n.get("name") == INNER_NODE)
    mesh_ids = [gltf["nodes"][c]["mesh"] for c in node["children"]]
    parts = [prim_geom(gltf, buf, m) for m in mesh_ids]
    all_pos = [p for part in parts for p in part["pos"]]
    cx = sum(p[0] for p in all_pos) / len(all_pos)
    cy = sum(p[1] for p in all_pos) / len(all_pos)
    cz = sum(p[2] for p in all_pos) / len(all_pos)
    centroid = (cx, cy, cz)

    blob = b""
    views = []
    accessors = []
    primitives = []

    def push_view(data: bytes, stride: int | None, target: int) -> int:
        nonlocal blob
        off = len(blob)
        blob += pad4(data)
        view: dict = {
            "buffer": 0,
            "byteOffset": off,
            "byteLength": len(data),
        }
        if stride:
            view["byteStride"] = stride
        if target is not None:
            view["target"] = target
        views.append(view)
        return len(views) - 1

    for part in parts:
        pos_t = [remap_pos(*p, centroid) for p in part["pos"]]
        nrm_t = [remap_nrm(*n) for n in part["nrm"]]
        idx = part["idx"]
        flipped = []
        for i in range(0, len(idx), 3):
            flipped.extend((idx[i], idx[i + 2], idx[i + 1]))
        pos_b = pack_f32(pos_t)
        nrm_b = pack_f32(nrm_t)
        vmin = [min(p[k] for p in pos_t) for k in range(3)]
        vmax = [max(p[k] for p in pos_t) for k in range(3)]
        pv = push_view(pos_b, 12, 34962)
        nv = push_view(nrm_b, 12, 34962)
        accessors.append(
            {
                "bufferView": pv,
                "componentType": 5126,
                "count": len(pos_t),
                "type": "VEC3",
                "min": vmin,
                "max": vmax,
            }
        )
        pi = len(accessors) - 1
        accessors.append(
            {
                "bufferView": nv,
                "componentType": 5126,
                "count": len(nrm_t),
                "type": "VEC3",
            }
        )
        ni = len(accessors) - 1
        attrs = {"POSITION": pi, "NORMAL": ni}
        for k, uv in enumerate(part["uvs"]):
            uv_b = pack_f32(uv)
            uvv = push_view(uv_b, 8, 34962)
            accessors.append(
                {
                    "bufferView": uvv,
                    "componentType": 5126,
                    "count": len(uv),
                    "type": "VEC2",
                }
            )
            attrs[f"TEXCOORD_{k}"] = len(accessors) - 1
        iv = push_view(pack_u32(flipped), None, 34963)
        accessors.append(
            {
                "bufferView": iv,
                "componentType": 5125,
                "count": len(flipped),
                "type": "SCALAR",
            }
        )
        primitives.append(
            {
                "attributes": attrs,
                "indices": len(accessors) - 1,
                "material": 0,
                "mode": 4,
            }
        )

    images = []
    textures = []
    for i, raw in enumerate(tex_blobs):
        vi = push_view(raw, None, None)  # type: ignore[arg-type]
        # PNG buffer views must not set ARRAY_BUFFER target
        views[vi].pop("target", None)
        images.append({"bufferView": vi, "mimeType": "image/png"})
        textures.append({"source": i, "sampler": 0})

    doc = {
        "asset": {
            "version": "2.0",
            "generator": "tothemoon extract-sketchfab-raptor",
            "extras": {
                "title": "SpaceX Starship Superheavy V3 — inner Raptor",
                "author": "Ijsz23",
                "license": "CC-BY-4.0",
                "source": "https://skfb.ly/pyZBo",
            },
        },
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": views,
        "accessors": accessors,
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "images": images,
        "textures": textures,
        "materials": [
            {
                "name": "RAPTOR_SL",
                "doubleSided": False,
                "emissiveFactor": [0.22, 0.16, 0.12],
                "emissiveTexture": {"index": 2, "texCoord": 2},
                "normalTexture": {"index": 3, "texCoord": 3, "scale": 1},
                "pbrMetallicRoughness": {
                    "baseColorTexture": {"index": 0, "texCoord": 0},
                    "metallicRoughnessTexture": {"index": 1, "texCoord": 1},
                },
            }
        ],
        "meshes": [{"name": "raptor-sl", "primitives": primitives}],
        "nodes": [{"name": "raptor", "mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    write_glb(out_path, doc, blob)
    tris = sum(len(p["idx"]) // 3 for p in parts)
    print(f"wrote {out_path}  verts={len(all_pos)} tris={tris}  centroid_m={centroid}")


def main() -> None:
    zip_path = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / "Downloads/spacex_starship_superheavy_v3.zip")
    out_path = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/raptor-sl-raw.glb")
    if not zip_path.is_file():
        raise SystemExit(f"missing Sketchfab zip: {zip_path}")
    extract(zip_path, out_path)


if __name__ == "__main__":
    main()
