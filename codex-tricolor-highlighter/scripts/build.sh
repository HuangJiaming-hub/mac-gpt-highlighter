#!/bin/sh
set -eu
root=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
app='build/三色荧光笔.app'
archive='build/codex-tricolor-highlighter-mac.zip'
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp src/Info.plist "$app/Contents/Info.plist"
cp src/pen.js "$app/Contents/Resources/pen.js"
xcrun clang -fobjc-arc -fblocks -framework Cocoa -Wno-incompatible-pointer-types src/Launcher.m -o "$app/Contents/MacOS/ReadingPen"
codesign --force --sign - "$app"
codesign --verify --strict "$app"
ditto -c -k --norsrc --noextattr --keepParent "$app" "$archive"
unzip -tq "$archive"
printf '%s\n' "应用：$root/$app" "压缩包：$root/$archive"
