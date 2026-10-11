"""Structural and live-database tests for the campus graph schema."""

from pathlib import Path

import psycopg
import pytest
from psycopg import errors

from app.core.config import settings

TABLES = (
    "campuses",
    "buildings",
    "floors",
    "graph_nodes",
    "graph_edges",
    "exits",
    "assembly_points",
    "emergencies",
    "emergency_affected_nodes",
    "emergency_affected_edges",
    "node_conditions",
    "edge_conditions",
)

DEMO_CAMPUS_ID = "10000000-0000-4000-8000-000000000001"
DEMO_BUILDING_ID = "11000000-0000-4000-8000-000000000001"
DEMO_FLOOR_ID = "12000000-0000-4000-8000-000000000001"
DEMO_NODE_ID = "20000000-0000-4000-8000-000000000001"


@pytest.fixture
def database():
    if not settings.SUPABASE_DB_URL:
        pytest.skip("SUPABASE_DB_URL is not configured")
    connection = psycopg.connect(settings.SUPABASE_DB_URL, connect_timeout=8)
    try:
        yield connection
    finally:
        connection.rollback()
        connection.close()


def test_migration_declares_all_tables_and_rls():
    repository_root = Path(__file__).resolve().parents[2]
    migration_path = repository_root / "supabase/migrations/202610090001_initial_campus_schema.sql"
    migration = migration_path.read_text(encoding="utf-8").lower()

    for table in TABLES:
        assert f"create table if not exists public.{table}" in migration
        assert f"alter table public.{table} enable row level security" in migration


def test_tables_columns_foreign_keys_and_rls_exist(database):
    required_columns = {
        "campuses": {"id", "name", "created_at", "updated_at"},
        "buildings": {"campus_id", "code"},
        "floors": {"building_id", "floor_number"},
        "graph_nodes": {"floor_id", "node_type", "x_coordinate", "is_exit"},
        "graph_edges": {"from_node_id", "to_node_id", "distance", "bidirectional"},
        "exits": {"node_id", "exit_type", "is_active"},
        "assembly_points": {"node_id", "capacity"},
        "emergencies": {"emergency_type", "severity", "status"},
        "emergency_affected_nodes": {"emergency_id", "node_id", "risk_score", "blocked"},
        "emergency_affected_edges": {"emergency_id", "edge_id", "risk_score", "blocked"},
        "node_conditions": {"node_id", "emergency_id", "people_count", "crowd_density"},
        "edge_conditions": {"edge_id", "emergency_id", "effective_speed"},
    }

    with database.cursor() as cursor:
        for table, expected in required_columns.items():
            cursor.execute(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = %s",
                (table,),
            )
            columns = {row[0] for row in cursor.fetchall()}
            assert expected <= columns, f"Missing columns from {table}: {expected - columns}"

        cursor.execute(
            "SELECT c.relname, c.relrowsecurity "
            "FROM pg_class AS c JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relname = ANY(%s)",
            (list(TABLES),),
        )
        rls_state = dict(cursor.fetchall())
        assert set(rls_state) == set(TABLES)
        assert all(rls_state.values())

        cursor.execute(
            "SELECT count(*) FROM pg_policies "
            "WHERE schemaname = 'public' AND tablename = ANY(%s)",
            (list(TABLES),),
        )
        assert cursor.fetchone()[0] == 0

        cursor.execute(
            "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' "
            "AND indexname = ANY(%s)",
            ([
                "buildings_campus_idx",
                "floors_building_idx",
                "graph_nodes_floor_idx",
                "graph_edges_from_node_idx",
                "graph_edges_to_node_idx",
                "exits_node_idx",
                "assembly_points_node_idx",
                "emergencies_campus_status_idx",
                "emergency_affected_nodes_node_idx",
                "emergency_affected_edges_edge_idx",
                "node_conditions_lookup_idx",
                "edge_conditions_lookup_idx",
                "node_conditions_current_unique",
                "node_conditions_emergency_unique",
                "edge_conditions_current_unique",
                "edge_conditions_emergency_unique",
            ],),
        )
        index_names = {row[0] for row in cursor.fetchall()}
        assert len(index_names) == 16

        cursor.execute(
            "SELECT count(*) FROM pg_trigger AS t "
            "JOIN pg_class AS c ON c.oid = t.tgrelid "
            "JOIN pg_namespace AS n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND t.tgname = 'set_updated_at' "
            "AND NOT t.tgisinternal"
        )
        assert cursor.fetchone()[0] == 10

        cursor.execute(
            "SELECT conrelid::regclass::text, confrelid::regclass::text "
            "FROM pg_constraint WHERE contype = 'f' "
            "AND connamespace = 'public'::regnamespace"
        )
        foreign_keys = {(row[0].split(".")[-1], row[1].split(".")[-1]) for row in cursor.fetchall()}

    expected_relationships = {
        ("buildings", "campuses"),
        ("floors", "buildings"),
        ("graph_nodes", "floors"),
        ("graph_edges", "graph_nodes"),
        ("exits", "graph_nodes"),
        ("assembly_points", "graph_nodes"),
        ("emergencies", "campuses"),
        ("emergency_affected_nodes", "emergencies"),
        ("emergency_affected_nodes", "graph_nodes"),
        ("emergency_affected_edges", "emergencies"),
        ("emergency_affected_edges", "graph_edges"),
        ("node_conditions", "graph_nodes"),
        ("node_conditions", "emergencies"),
        ("edge_conditions", "graph_edges"),
        ("edge_conditions", "emergencies"),
    }
    assert expected_relationships <= foreign_keys


def test_demo_campus_has_representative_graph_data(database):
    with database.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM public.campuses WHERE id = %s", (DEMO_CAMPUS_ID,))
        assert cursor.fetchone()[0] == 1

        for table, minimum in (
            ("buildings", 2),
            ("floors", 4),
            ("graph_nodes", 20),
            ("graph_edges", 20),
            ("exits", 2),
            ("assembly_points", 1),
        ):
            cursor.execute(
                f"SELECT count(*) FROM public.{table} WHERE campus_id = %s",
                (DEMO_CAMPUS_ID,),
            )
            assert cursor.fetchone()[0] >= minimum

        cursor.execute(
            "SELECT count(DISTINCT node_type) FROM public.graph_nodes "
            "WHERE campus_id = %s AND node_type IN ('room', 'corridor', 'junction', 'staircase', 'entrance')",
            (DEMO_CAMPUS_ID,),
        )
        assert cursor.fetchone()[0] == 5


def _assert_rejected(cursor, statement, parameters, error_type):
    cursor.execute("SAVEPOINT invalid_relationship_check")
    with pytest.raises(error_type):
        cursor.execute(statement, parameters)
    cursor.execute("ROLLBACK TO SAVEPOINT invalid_relationship_check")
    cursor.execute("RELEASE SAVEPOINT invalid_relationship_check")


def test_invalid_relationships_and_self_loops_are_rejected(database):
    missing_id = "ffffffff-ffff-4fff-8fff-ffffffffffff"

    with database.cursor() as cursor:
        cursor.execute("SAVEPOINT schema_constraint_checks")

        _assert_rejected(
            cursor,
            "INSERT INTO public.buildings (campus_id, name, code) VALUES (%s, 'Invalid', 'INVALID')",
            (missing_id,),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.floors (campus_id, building_id, floor_number, name) VALUES (%s, %s, 99, 'Invalid')",
            (DEMO_CAMPUS_ID, missing_id),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.graph_nodes (campus_id, floor_id, node_type, name) VALUES (%s, %s, 'room', 'Invalid')",
            (DEMO_CAMPUS_ID, missing_id),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.graph_edges (campus_id, from_node_id, to_node_id, distance, base_capacity, base_speed) VALUES (%s, %s, %s, 1, 1, 1)",
            (DEMO_CAMPUS_ID, missing_id, DEMO_NODE_ID),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.graph_edges (campus_id, from_node_id, to_node_id, distance, base_capacity, base_speed) VALUES (%s, %s, %s, 1, 1, 1)",
            (DEMO_CAMPUS_ID, DEMO_NODE_ID, DEMO_NODE_ID),
            errors.CheckViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.graph_nodes (campus_id, node_type, name) VALUES (%s, 'teleporter', 'Invalid')",
            (DEMO_CAMPUS_ID,),
            errors.CheckViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.exits (campus_id, node_id, name, exit_type, capacity) VALUES (%s, %s, 'Invalid', 'emergency', 1)",
            (DEMO_CAMPUS_ID, missing_id),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.assembly_points (campus_id, node_id, name, capacity) VALUES (%s, %s, 'Invalid', 1)",
            (DEMO_CAMPUS_ID, missing_id),
            errors.ForeignKeyViolation,
        )

        cursor.execute(
            "INSERT INTO public.emergencies (campus_id, emergency_type, severity, title) "
            "VALUES (%s, 'other', 'low', 'Temporary schema test') RETURNING id",
            (DEMO_CAMPUS_ID,),
        )
        emergency_id = cursor.fetchone()[0]

        _assert_rejected(
            cursor,
            "INSERT INTO public.emergencies (campus_id, emergency_type, severity, title) VALUES (%s, 'other', 'extreme', 'Invalid')",
            (DEMO_CAMPUS_ID,),
            errors.CheckViolation,
        )

        _assert_rejected(
            cursor,
            "INSERT INTO public.emergency_affected_nodes (campus_id, emergency_id, node_id) VALUES (%s, %s, %s)",
            (DEMO_CAMPUS_ID, emergency_id, missing_id),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.emergency_affected_edges (campus_id, emergency_id, edge_id) VALUES (%s, %s, %s)",
            (DEMO_CAMPUS_ID, emergency_id, missing_id),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.node_conditions (campus_id, node_id) VALUES (%s, %s)",
            (DEMO_CAMPUS_ID, missing_id),
            errors.ForeignKeyViolation,
        )
        _assert_rejected(
            cursor,
            "INSERT INTO public.edge_conditions (campus_id, edge_id) VALUES (%s, %s)",
            (DEMO_CAMPUS_ID, missing_id),
            errors.ForeignKeyViolation,
        )

        cursor.execute("ROLLBACK TO SAVEPOINT schema_constraint_checks")
        cursor.execute("RELEASE SAVEPOINT schema_constraint_checks")