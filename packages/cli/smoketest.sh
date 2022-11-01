#!/bin/sh -ex

PKGDIR="$PWD"
TESTDIR="`mktemp -d`"

OS="`uname -s | tr '[:upper:]' '[:lower:]'`"
[ "${OS}" == "darwin" ] && OS="macos"

ARCH="`uname -m | sed 's/86_//'`"
BIN_NAME="appmap-${OS}-${ARCH}"

yarn build-native

cp "release/${BIN_NAME}" "${TESTDIR}"
cp -r "tests/unit/fixtures/ruby" "${TESTDIR}"

cd "${TESTDIR}"

"./${BIN_NAME}" index --appmap-dir ruby
"./${BIN_NAME}" depends --appmap-dir ruby
"./${BIN_NAME}" inventory --appmap-dir ruby
"./${BIN_NAME}" openapi -d ruby -o /dev/null

cd "$PKGDIR"
rm -rf "$TESTDIR"
