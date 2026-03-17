FROM oven/bun:1 AS app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json bun.lock tsconfig.json ./
RUN bun install --frozen-lockfile

COPY opentimestamps-client ./opentimestamps-client
RUN python3 -m venv /opt/ots-venv \
  && /opt/ots-venv/bin/pip install --no-cache-dir -r opentimestamps-client/requirements.txt \
  && /opt/ots-venv/bin/pip install --no-cache-dir -e ./opentimestamps-client

COPY src ./src
COPY README.md ./README.md

RUN mkdir -p /app/data/ots

ENV PATH="/opt/ots-venv/bin:${PATH}"

CMD ["bun", "run", "src/index.ts"]
