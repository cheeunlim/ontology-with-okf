#!/usr/bin/env bash
# ==============================================================================
# 🚀 OKF Omni - Brand-New Google Cloud Project Bootstrap Script
# Usage:
#   bash scripts/setup_new_gcp_project.sh <YOUR_PROJECT_ID> [DATASET_ID] [REGION]
# Example:
#   bash scripts/setup_new_gcp_project.sh okf-graph-demo thelook_ecommerce us-central1
# ==============================================================================

set -euo pipefail

PROJECT_ID="${1:-}"
DATASET_ID="${2:-thelook_ecommerce}"
REGION="${3:-us-central1}"
BUCKET_NAME="okf-omni-${PROJECT_ID}"

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Usage: bash scripts/setup_new_gcp_project.sh <YOUR_GCP_PROJECT_ID> [DATASET_ID] [REGION]"
  exit 1
fi

export CLOUDSDK_METRICS_ENVIRONMENT="${CLOUDSDK_METRICS_ENVIRONMENT:+$CLOUDSDK_METRICS_ENVIRONMENT }datacloud.jetski"

echo "=================================================================="
echo "🌐 Bootstrapping OKF Omni in GCP Project: ${PROJECT_ID}"
echo "   • BigQuery Dataset : ${DATASET_ID} (Location: US)"
echo "   • GCS Bucket       : gs://${BUCKET_NAME}"
echo "   • Region           : ${REGION}"
echo "=================================================================="

# 1. Set active project & ADC quota project
gcloud config set project "${PROJECT_ID}"
gcloud auth application-default set-quota-project "${PROJECT_ID}" 2>/dev/null || true

# 2. Enable required GCP APIs
echo "▶ [1/5] Enabling Google Cloud APIs (BigQuery, Storage, Dataplex, Spanner, Vertex AI, Cloud Run, Artifact Registry)..."
gcloud services enable \
  bigquery.googleapis.com \
  storage.googleapis.com \
  dataplex.googleapis.com \
  datacatalog.googleapis.com \
  spanner.googleapis.com \
  aiplatform.googleapis.com \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com

# 3. Create BigQuery Dataset & Seed Sample E-Commerce Tables from Public Dataset
echo "▶ [2/5] Creating BigQuery dataset '${DATASET_ID}' (location=US) and seeding sample tables..."
bq --location=US query --use_legacy_sql=false --project_id="${PROJECT_ID}" --label datacloud:jetski \
  "CREATE SCHEMA IF NOT EXISTS \`${PROJECT_ID}.${DATASET_ID}\` OPTIONS(location='US', description='OKF Omni Enterprise Ontology Dataset');"

for TABLE in users orders order_items products events distribution_centers inventory_items; do
  echo "   • Copying table: ${TABLE}..."
  bq --location=US query --use_legacy_sql=false --project_id="${PROJECT_ID}" --label datacloud:jetski \
    "CREATE OR REPLACE TABLE \`${PROJECT_ID}.${DATASET_ID}.${TABLE}\` AS SELECT * FROM \`bigquery-public-data.thelook_ecommerce.${TABLE}\` LIMIT 5000;"
done

# 4. Create Default BigQuery Property Graph
echo "▶ [3/5] Creating initial BigQuery Property Graph (${DATASET_ID}.thelookgraph)..."
bq --location=US query --use_legacy_sql=false --project_id="${PROJECT_ID}" --label datacloud:jetski "
CREATE OR REPLACE PROPERTY GRAPH \`${PROJECT_ID}.${DATASET_ID}.thelookgraph\`
  NODE TABLES (
    \`${PROJECT_ID}.${DATASET_ID}.users\` AS \`User\`
      KEY (id) PROPERTIES (id, first_name, last_name, email, city, country),
    \`${PROJECT_ID}.${DATASET_ID}.orders\` AS \`Order\`
      KEY (order_id) PROPERTIES (order_id, user_id, status, created_at),
    \`${PROJECT_ID}.${DATASET_ID}.products\` AS \`Product\`
      KEY (id) PROPERTIES (id, name, category, retail_price, brand),
    \`${PROJECT_ID}.${DATASET_ID}.events\` AS \`Event\`
      KEY (id) PROPERTIES (id, user_id, event_type, created_at)
  )
  EDGE TABLES (
    \`${PROJECT_ID}.${DATASET_ID}.orders\` AS \`Placed\`
      KEY (order_id)
      SOURCE KEY (user_id) REFERENCES \`User\` (id)
      DESTINATION KEY (order_id) REFERENCES \`Order\` (order_id)
      PROPERTIES (status, created_at),
    \`${PROJECT_ID}.${DATASET_ID}.order_items\` AS \`OrderedItem\`
      KEY (id)
      SOURCE KEY (order_id) REFERENCES \`Order\` (order_id)
      DESTINATION KEY (product_id) REFERENCES \`Product\` (id)
      PROPERTIES (sale_price, status),
    \`${PROJECT_ID}.${DATASET_ID}.events\` AS \`Triggered\`
      KEY (id)
      SOURCE KEY (user_id) REFERENCES \`User\` (id)
      DESTINATION KEY (id) REFERENCES \`Event\` (id)
      PROPERTIES (event_type, created_at)
  );
" || echo "   (Note: Property Graph creation skipped or requires preview entitlement)"

# 5. Create GCS Bucket, Dataplex Custom Governance Aspect Type & Spanner Graph DB
echo "▶ [4/5] Creating GCS Bucket gs://${BUCKET_NAME}, Dataplex Aspect Type 'okf-governance', and Spanner Graph DB..."
gcloud storage buckets create "gs://${BUCKET_NAME}" --project="${PROJECT_ID}" --location=US --uniform-bucket-level-access 2>/dev/null || echo "   (Bucket gs://${BUCKET_NAME} already exists)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
gcloud dataplex aspect-types create okf-governance \
  --location=us \
  --project="${PROJECT_ID}" \
  --display-name="OKF v0.2 Governance Aspect" \
  --description="Open Knowledge Format (OKF v0.2) AI & Data Governance Attestation Metadata" \
  --metadata-template-file-name="${SCRIPT_DIR}/okf_governance_aspect_template.json" 2>/dev/null || echo "   (Dataplex Aspect Type 'okf-governance' already exists)"

gcloud spanner instances create okf-spanner-instance \
  --project="${PROJECT_ID}" \
  --config="regional-${REGION}" \
  --description="OKF Spanner Graph Demo" \
  --processing-units=100 \
  --edition=ENTERPRISE 2>/dev/null || echo "   (Spanner Instance 'okf-spanner-instance' already exists)"

gcloud spanner databases create okf-commerce-graph-db \
  --instance=okf-spanner-instance \
  --project="${PROJECT_ID}" \
  --ddl-file="${SCRIPT_DIR}/spanner_schema.ddl" 2>/dev/null || echo "   (Spanner Database 'okf-commerce-graph-db' already exists)"

# 6. Write local srcs/.env file
ENV_FILE="$(dirname "$0")/../.env"
echo "▶ [5/5] Writing environment configuration to ${ENV_FILE}..."
cat <<EOF > "${ENV_FILE}"
PORT=3003
GCP_PROJECT_ID="${PROJECT_ID}"
BIGQUERY_DATASET="${DATASET_ID}"
# Optional: Add your AI Studio key below, or rely on 'gcloud auth application-default login' (Vertex AI fallback)
GEMINI_API_KEY=""
EOF

echo "=================================================================="
echo "✅ Bootstrap Complete for Project: ${PROJECT_ID}"
echo "   • Main Studio     : http://localhost:3003/"
echo "   • Korean Showcase : http://localhost:3003/ko"
echo "   • English Showcase: http://localhost:3003/kc-spanner"
echo "=================================================================="
