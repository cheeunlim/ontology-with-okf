"""
EPIC-002 BigQuery Table OKF v0.2 Spec & Harvester Conversion Test Suite
Conforms to:
- EPIC-002 (BigQuery Physical Metadata & OKF v0.2 Spec Harvester)
- TASK-002 (BigQuery OKF v0.2 Harvester Implementation)
- references/knowledge-catalog/okf/SPEC.md (OKF v0.2 Official Spec)
"""
from __future__ import annotations

import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
import yaml

from reference_agent.bundle.document import (
    OKFDocument,
    OKFDocumentError,
    is_stale,
    normalize_verified,
    trust_tier,
)
from reference_agent.bundle.index import regenerate_indexes
from reference_agent.bundle.paths import concept_id_to_path
from reference_agent.sources.bigquery import BigQuerySource
from reference_agent.tools.bundle_tools import (
    read_existing_doc,
    write_concept_doc,
)
from reference_agent.tools.context import set_context


def _make_schema_field(name: str, type_: str, mode: str = "NULLABLE", description: str | None = None, fields=()):
    return SimpleNamespace(
        name=name,
        field_type=type_,
        mode=mode,
        description=description,
        fields=tuple(fields),
    )


class TestEpic002BigQueryHarvester:
    """1. BigQuery Metadata Harvester & Extraction Tests"""

    @patch("reference_agent.sources.bigquery.bigquery.Client")
    def test_harvest_regular_table_with_partition_clustering(self, client_cls):
        """Verify harvesting table schema, partitioning, clustering and labels."""
        client = MagicMock()
        client.list_tables.return_value = [SimpleNamespace(table_id="orders")]
        
        schema = [
            _make_schema_field("order_id", "INT64", mode="REQUIRED", description="Order primary key"),
            _make_schema_field("user_id", "INT64", mode="REQUIRED", description="User foreign key"),
            _make_schema_field("status", "STRING", description="Order status"),
            _make_schema_field("created_at", "TIMESTAMP", description="Order placement time"),
            _make_schema_field("num_items", "INT64", description="Total item count"),
        ]
        table_obj = SimpleNamespace(
            table_type="TABLE",
            friendly_name="Orders Table",
            description="TheLook eCommerce orders dimension.",
            labels={"domain": "sales", "env": "prod"},
            num_rows=150000,
            num_bytes=10485760,
            created=datetime(2026, 1, 1, tzinfo=timezone.utc),
            modified=datetime(2026, 8, 1, tzinfo=timezone.utc),
            schema=schema,
            time_partitioning=SimpleNamespace(type_="DAY", field="created_at", expiration_ms=None),
            range_partitioning=None,
            clustering_fields=["user_id", "status"],
        )
        client.get_table.return_value = table_obj
        client_cls.return_value = client

        src = BigQuerySource(dataset="seanjung-poc.thelook_ecommerce")
        concepts = src.list_concepts()
        table_concept = next(c for c in concepts if c.id == ("tables", "orders"))

        assert table_concept.type == "BigQuery Table"
        assert table_concept.id == ("tables", "orders")

        raw_data = src.read_concept(table_concept)
        assert raw_data["description"] == "TheLook eCommerce orders dimension."
        assert raw_data["labels"] == {"domain": "sales", "env": "prod"}
        assert raw_data["num_rows"] == 150000
        assert raw_data["time_partitioning"]["type"] == "DAY"
        assert raw_data["time_partitioning"]["field"] == "created_at"
        assert raw_data["clustering_fields"] == ["user_id", "status"]
        assert len(raw_data["schema"]) == 5

    @patch("reference_agent.sources.bigquery.bigquery.Client")
    def test_harvest_view_table_with_query_fallback(self, client_cls):
        """Verify VIEW table harvesting does not crash with 400 Bad Request and uses query fallback."""
        client = MagicMock()
        client.list_tables.return_value = [SimpleNamespace(table_id="daily_revenue_view")]
        
        view_obj = SimpleNamespace(
            table_type="VIEW",
            friendly_name="Daily Revenue View",
            description="Aggregated daily sales revenue view.",
            labels={"type": "view"},
            num_rows=None,
            num_bytes=None,
            created=datetime(2026, 3, 1, tzinfo=timezone.utc),
            modified=datetime(2026, 8, 1, tzinfo=timezone.utc),
            schema=[
                _make_schema_field("sale_date", "DATE"),
                _make_schema_field("total_revenue", "NUMERIC"),
            ],
            time_partitioning=None,
            range_partitioning=None,
            clustering_fields=None,
        )
        client.get_table.return_value = view_obj
        
        # Mock query fallback for view rows
        query_job = MagicMock()
        query_job.result.return_value = [
            SimpleNamespace(items=lambda: [("sale_date", "2026-08-01"), ("total_revenue", 99500.0)])
        ]
        client.query.return_value = query_job
        client_cls.return_value = client

        src = BigQuerySource(dataset="seanjung-poc.thelook_ecommerce")
        ref = next(c for c in src.list_concepts() if c.id == ("tables", "daily_revenue_view"))
        
        rows = src.sample_rows(ref, n=5)
        assert rows == [{"sale_date": "2026-08-01", "total_revenue": 99500.0}]
        client.list_rows.assert_not_called()
        client.query.assert_called_once()
        assert "`seanjung-poc.thelook_ecommerce.daily_revenue_view`" in client.query.call_args.args[0]

    @patch("reference_agent.sources.bigquery.bigquery.Client")
    def test_harvest_sharded_tables_collapse(self, client_cls):
        """Verify sharded daily tables (e.g. events_20260801, events_20260802) collapse to wildcard concept."""
        table_ids = ["events_20260801", "events_20260802", "events_20260803"]
        table_obj = SimpleNamespace(
            friendly_name=None,
            description="Daily event stream",
            labels={},
            num_rows=5000,
            num_bytes=204800,
            created=datetime(2026, 8, 1, tzinfo=timezone.utc),
            modified=datetime(2026, 8, 3, tzinfo=timezone.utc),
            schema=[_make_schema_field("event_id", "STRING"), _make_schema_field("user_id", "INT64")],
            time_partitioning=None,
            range_partitioning=None,
            clustering_fields=None,
        )
        client = MagicMock()
        client.list_tables.return_value = [SimpleNamespace(table_id=t) for t in table_ids]
        client.get_table.return_value = table_obj
        client_cls.return_value = client

        src = BigQuerySource(dataset="seanjung-poc.thelook_ecommerce")
        concepts = src.list_concepts()
        ids = [c.id for c in concepts]

        assert ("tables", "events_") in ids
        assert not any(c.id == ("tables", "events_20260801") for c in concepts)
        
        wildcard_concept = next(c for c in concepts if c.id == ("tables", "events_"))
        assert wildcard_concept.hint["wildcard"] is True
        assert wildcard_concept.hint["shard_count"] == 3
        assert wildcard_concept.hint["last_shard"] == "events_20260803"


class TestEpic002OkfV02DocumentFormat:
    """2. OKF v0.2 Spec Format, Provenance, Trust & Lifecycle Tests"""

    def test_okf_v02_frontmatter_and_body_structure(self):
        """Verify full OKF v0.2 document conforms to §4, §5, §11 requirements."""
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_root = Path(tmpdir)
            set_context(MagicMock(), bundle_root, model="gemini-3.5-flash")
            
            frontmatter = {
                "type": "BigQuery Table",
                "resource": "https://console.cloud.google.com/bigquery?p=seanjung-poc&d=thelook_ecommerce&t=orders",
                "title": "Customer Orders",
                "description": "One row per customer order in TheLook eCommerce platform.",
                "tags": ["ecommerce", "orders", "sales"],
                "status": "stable",
                "sources": [
                    {
                        "id": "bq-thelook-orders",
                        "resource": "https://console.cloud.google.com/bigquery?p=seanjung-poc&d=thelook_ecommerce&t=orders",
                        "title": "BigQuery Orders Physical Table",
                        "author": "team:data-platform",
                        "usage_count": 4820,
                        "last_modified": "2026-08-01",
                    },
                    {
                        "id": "return-policy-doc",
                        "resource": "references/wiki/return_policy.md",
                        "title": "eCommerce Order Return and Refund Policy",
                        "author": "human:compliance",
                        "last_modified": "2026-07-15",
                    }
                ],
                "usage_window": {"from": "2026-07-01", "to": "2026-07-31"},
                "verified": [
                    {"by": "human:seanjung", "at": "2026-08-02T01:00:00Z"},
                    {"by": "process:nightly-profiler", "at": "2026-08-02T02:00:00Z"}
                ],
                "stale_after": "2026-12-31",
            }
            body = (
                "The `orders` table tracks completed customer transactions across web and mobile.[^bq-thelook-orders]\n"
                "Orders can be cancelled or returned within 14 days per company policy.[^return-policy-doc]\n\n"
                "# Schema\n\n"
                "| Field | Type | Description |\n"
                "|---|---|---|\n"
                "| `order_id` | INT64 | Unique order identifier |\n"
                "| `user_id` | INT64 | Foreign key to [users](users.md) |\n"
                "| `status` | STRING | Order status (Shipped, Complete, Returned) |\n"
                "| `created_at` | TIMESTAMP | Order timestamp |\n\n"
                "# Common query patterns\n\n"
                "```sql\n"
                "SELECT status, COUNT(*) AS order_count\n"
                "FROM `seanjung-poc.thelook_ecommerce.orders`\n"
                "WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)\n"
                "GROUP BY status;\n"
                "```\n\n"
                "[^bq-thelook-orders]: BigQuery Orders Physical Table\n"
                "[^return-policy-doc]: eCommerce Order Return and Refund Policy\n"
            )

            res = write_concept_doc("tables/orders", frontmatter, body)
            assert "path" in res
            assert res["path"] == "tables/orders.md"

            # Read back and verify
            doc_path = bundle_root / "tables" / "orders.md"
            assert doc_path.exists()
            raw_text = doc_path.read_text(encoding="utf-8")
            
            doc = OKFDocument.parse(raw_text)
            doc.validate()

            # Check Breaking Change 1: `generated: { by, at }`
            assert "timestamp" not in doc.frontmatter
            assert "generated" in doc.frontmatter
            assert doc.frontmatter["generated"]["by"] == "reference_agent/gemini-3.5-flash"
            assert "at" in doc.frontmatter["generated"]

            # Check Breaking Change 2: `sources` in frontmatter, footnotes in body
            assert "sources" in doc.frontmatter
            assert len(doc.frontmatter["sources"]) == 2
            assert doc.frontmatter["sources"][0]["id"] == "bq-thelook-orders"
            assert "# Citations" not in doc.body
            assert "[^bq-thelook-orders]" in doc.body

            # Check Additive Changes: Trust and Lifecycle
            assert doc.frontmatter["status"] == "stable"
            assert trust_tier(doc.frontmatter) == "human-reviewed"
            assert is_stale(doc.frontmatter, today=date(2026, 8, 2)) is False
            assert is_stale(doc.frontmatter, today=date(2027, 1, 1)) is True

    def test_trust_tier_classifications(self):
        """Verify trust tiers per OKF v0.2 §5.3."""
        # Unverified
        assert trust_tier({}) == "unverified"
        assert trust_tier({"type": "BigQuery Table"}) == "unverified"

        # Machine-confirmed
        assert trust_tier({
            "verified": [{"by": "process:dataplex-scanner", "at": "2026-08-01T00:00:00Z"}]
        }) == "machine-confirmed"
        assert trust_tier({
            "verified": [{"by": "reference_agent/gemini-3.5-flash", "at": "2026-08-01T00:00:00Z"}]
        }) == "machine-confirmed"

        # Human-reviewed
        assert trust_tier({
            "verified": [{"by": "human:data_steward_kim", "at": "2026-08-01T00:00:00Z"}]
        }) == "human-reviewed"
        assert trust_tier({
            "verified": {"by": "human:lead_architect", "at": "2026-08-01T00:00:00Z"}
        }) == "human-reviewed"

    def test_backward_compatibility_v01_fallback(self):
        """Verify OKF v0.2 parser can gracefully parse legacy v0.1 documents with `timestamp` and `# Citations`."""
        legacy_v01_text = (
            "---\n"
            "type: BigQuery Table\n"
            "title: Legacy Products\n"
            "description: Products catalog.\n"
            "resource: https://console.cloud.google.com/bigquery?p=demo&d=ds&t=products\n"
            "timestamp: 2026-04-01T12:00:00Z\n"
            "---\n\n"
            "# Products\n\n"
            "Product catalog dimension.\n\n"
            "# Schema\n\n"
            "| id | STRING |\n\n"
            "# Citations\n\n"
            "* [Products Doc](https://example.com/products)\n"
        )
        doc = OKFDocument.parse(legacy_v01_text)
        doc.validate()
        assert doc.frontmatter["type"] == "BigQuery Table"
        assert "timestamp" in doc.frontmatter
        assert "# Citations" in doc.body
        # Unverified by default when no verified frontmatter exists
        assert trust_tier(doc.frontmatter) == "unverified"


class TestEpic002BundleIndexAndNavigation:
    """3. Bundle Index & Cross-linking Navigation Tests"""

    def test_bundle_index_regeneration(self):
        """Verify OKF v0.2 bundle index.md creation and concept grouping."""
        with tempfile.TemporaryDirectory() as tmpdir:
            bundle_root = Path(tmpdir)
            tables_dir = bundle_root / "tables"
            tables_dir.mkdir(parents=True)

            orders_doc = OKFDocument(
                frontmatter={
                    "type": "BigQuery Table",
                    "title": "Orders",
                    "description": "Order dimension table.",
                    "status": "stable",
                },
                body="# Schema\n\n| order_id | INT64 |\n"
            )
            (tables_dir / "orders.md").write_text(orders_doc.serialize(), encoding="utf-8")

            users_doc = OKFDocument(
                frontmatter={
                    "type": "BigQuery Table",
                    "title": "Users",
                    "description": "User master table.",
                    "status": "stable",
                },
                body="# Schema\n\n| id | INT64 |\n"
            )
            (tables_dir / "users.md").write_text(users_doc.serialize(), encoding="utf-8")

            written_indexes = regenerate_indexes(bundle_root, model="gemini-3.5-flash")
            assert len(written_indexes) > 0

            tables_index = tables_dir / "index.md"
            assert tables_index.exists()
            content = tables_index.read_text(encoding="utf-8")

            assert "# BigQuery Table" in content
            assert "[Orders](orders.md) - Order dimension table." in content
            assert "[Users](users.md) - User master table." in content
