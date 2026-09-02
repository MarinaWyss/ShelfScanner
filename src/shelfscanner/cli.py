"""`shelfscanner` command-line entry point. Subcommands are added task by task."""

from __future__ import annotations

import argparse

from shelfscanner import storage


def _photos_sync(_: argparse.Namespace) -> None:
    for line in storage.sync_photos():
        print(line)


def _photos_list(_: argparse.Namespace) -> None:
    rows = storage.list_photos()
    if not rows:
        print("No photos synced yet.")
        return
    for r in rows:
        print(f"{r['id']:>3}  {r['storage_path']:<32} titles={len(r['titles']):<3} partial={len(r['partial_titles'])}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="shelfscanner")
    sub = parser.add_subparsers(dest="command", required=True)

    photos = sub.add_parser("photos", help="manage the test-set photos in Supabase")
    photos_sub = photos.add_subparsers(dest="photos_command", required=True)
    photos_sub.add_parser("sync", help="strip EXIF, upload photos, upsert label rows").set_defaults(func=_photos_sync)
    photos_sub.add_parser("list", help="list photo rows").set_defaults(func=_photos_list)

    return parser


def main() -> None:
    args = build_parser().parse_args()
    args.func(args)
