#!/bin/sh -ex

PKGDIR="$PWD"
TESTDIR="`mktemp -d`"

yarn --version
yarn pack --out "$TESTDIR"/package.tgz

cp -r tests/unit/fixtures/ruby "$TESTDIR"

cd "$TESTDIR"
echo '{}' > package.json
echo 'nodeLinker: node-modules' > .yarnrc.yml

yarn add ./package.tgz


yarn run appmap index --appmap-dir ruby
yarn run appmap depends --appmap-dir ruby
yarn run appmap inventory --appmap-dir ruby
yarn run appmap openapi -d ruby -o /dev/null


cd "$PKGDIR"
rm -rf "$TESTDIR"
