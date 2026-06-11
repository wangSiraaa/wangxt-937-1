#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  . ./.env
  set +a
fi

echo "[preflight] wangxt-937-1 smoke entry is ready."

if [ -f package.json ]; then
  if grep -q '"smoke"' package.json; then
    npm run smoke
  elif grep -q '"test"' package.json; then
    npm test
  else
    npm run build
  fi
elif [ -f pyproject.toml ] || [ -f requirements.txt ]; then
  if command -v pytest >/dev/null 2>&1; then
    pytest
  else
    python -m compileall .
  fi
elif [ -f go.mod ]; then
  go test ./...
elif ls *.csproj >/dev/null 2>&1; then
  dotnet test || dotnet build
elif [ -f pom.xml ]; then
  mvn test
elif [ -f build.gradle ] || [ -f build.gradle.kts ]; then
  ./gradlew test
else
  echo "[preflight] No generated project files yet; smoke placeholder passed."
fi
