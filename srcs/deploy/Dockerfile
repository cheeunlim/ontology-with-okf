# Multi-stage Dockerfile for Node.js + Python reference_agent
FROM python:3.11-slim as python-base

# System dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Google Cloud CLI for Dataplex/BigQuery operations via shell
RUN apt-get update && apt-get install -y apt-transport-https gnupg \
    && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | tee -a /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update && apt-get install -y google-cloud-cli \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy project files
COPY . .

# Remove host .venv if copied and create Linux x86_64 python venv
RUN rm -rf /app/references/knowledge-catalog/okf/.venv /app/knowledge-catalog/okf/.venv 2>/dev/null || true \
    && python3 -m venv /app/references/knowledge-catalog/okf/.venv \
    && /app/references/knowledge-catalog/okf/.venv/bin/pip install --upgrade pip \
    && /app/references/knowledge-catalog/okf/.venv/bin/pip install -e /app/references/knowledge-catalog/okf

# Install Node dependencies and build frontend
RUN npm install
RUN npm run build

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
