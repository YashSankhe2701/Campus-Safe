-- Migration: Add missing walkway-to-academic entrance connection in synthetic demo topology
BEGIN;

INSERT INTO public.graph_edges (
    id, campus_id, from_node_id, to_node_id, distance, base_capacity,
    base_speed, bidirectional, edge_type, metadata
)
VALUES (
    '30000000-0000-4000-8000-000000000021',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000021',
    '20000000-0000-4000-8000-000000000011',
    12,
    50,
    1.2,
    true,
    'outdoor',
    '{"synthetic": true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

COMMIT;
