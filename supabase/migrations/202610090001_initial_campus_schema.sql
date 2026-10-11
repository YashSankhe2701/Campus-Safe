BEGIN;

CREATE TABLE IF NOT EXISTS public.campuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    description text,
    address text,
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE TABLE IF NOT EXISTS public.buildings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES public.campuses(id),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    code text NOT NULL CHECK (length(btrim(code)) > 0),
    description text,
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campus_id, code),
    UNIQUE (campus_id, id),
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE TABLE IF NOT EXISTS public.floors (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL,
    building_id uuid NOT NULL,
    floor_number integer NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (building_id, floor_number),
    UNIQUE (campus_id, id),
    FOREIGN KEY (campus_id, building_id)
        REFERENCES public.buildings (campus_id, id)
);

CREATE TABLE IF NOT EXISTS public.graph_nodes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES public.campuses(id),
    floor_id uuid,
    node_type text NOT NULL CHECK (node_type IN (
        'room', 'corridor', 'junction', 'staircase', 'elevator',
        'entrance', 'exit', 'assembly_point'
    )),
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    code text,
    x_coordinate double precision,
    y_coordinate double precision,
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    capacity integer CHECK (capacity IS NULL OR capacity >= 0),
    is_exit boolean NOT NULL DEFAULT false,
    is_assembly_point boolean NOT NULL DEFAULT false,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campus_id, id),
    FOREIGN KEY (campus_id, floor_id)
        REFERENCES public.floors (campus_id, id),
    CHECK ((x_coordinate IS NULL) = (y_coordinate IS NULL)),
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS graph_nodes_campus_code_unique
    ON public.graph_nodes (campus_id, code) WHERE code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.graph_edges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES public.campuses(id),
    from_node_id uuid NOT NULL,
    to_node_id uuid NOT NULL,
    distance double precision NOT NULL CHECK (distance > 0 AND distance < 'Infinity'::float8),
    base_capacity integer NOT NULL CHECK (base_capacity > 0),
    base_speed double precision NOT NULL CHECK (base_speed > 0 AND base_speed < 'Infinity'::float8),
    bidirectional boolean NOT NULL DEFAULT true,
    edge_type text NOT NULL DEFAULT 'hallway' CHECK (edge_type IN (
        'hallway', 'door', 'staircase', 'elevator', 'ramp', 'outdoor', 'other'
    )),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campus_id, id),
    FOREIGN KEY (campus_id, from_node_id)
        REFERENCES public.graph_nodes (campus_id, id),
    FOREIGN KEY (campus_id, to_node_id)
        REFERENCES public.graph_nodes (campus_id, id),
    CHECK (from_node_id <> to_node_id)
);

CREATE TABLE IF NOT EXISTS public.exits (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES public.campuses(id),
    node_id uuid NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    exit_type text NOT NULL CHECK (exit_type IN ('main', 'emergency', 'fire_escape', 'other')),
    capacity integer NOT NULL CHECK (capacity > 0),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campus_id, id),
    FOREIGN KEY (campus_id, node_id)
        REFERENCES public.graph_nodes (campus_id, id)
);

CREATE TABLE IF NOT EXISTS public.assembly_points (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES public.campuses(id),
    node_id uuid NOT NULL,
    name text NOT NULL CHECK (length(btrim(name)) > 0),
    capacity integer NOT NULL CHECK (capacity > 0),
    latitude double precision CHECK (latitude BETWEEN -90 AND 90),
    longitude double precision CHECK (longitude BETWEEN -180 AND 180),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campus_id, id),
    FOREIGN KEY (campus_id, node_id)
        REFERENCES public.graph_nodes (campus_id, id),
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

CREATE TABLE IF NOT EXISTS public.emergencies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL REFERENCES public.campuses(id),
    emergency_type text NOT NULL CHECK (emergency_type IN (
        'fire', 'earthquake', 'gas_chemical_leak', 'security_threat',
        'flood_waterlogging', 'other'
    )),
    severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title text NOT NULL CHECK (length(btrim(title)) > 0),
    description text,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'cancelled')),
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (campus_id, id),
    CHECK (ended_at IS NULL OR ended_at >= started_at),
    CHECK ((status = 'active') OR ended_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.emergency_affected_nodes (
    campus_id uuid NOT NULL,
    emergency_id uuid NOT NULL,
    node_id uuid NOT NULL,
    risk_score numeric(6, 5) NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 1),
    blocked boolean NOT NULL DEFAULT false,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (emergency_id, node_id),
    FOREIGN KEY (campus_id, emergency_id)
        REFERENCES public.emergencies (campus_id, id),
    FOREIGN KEY (campus_id, node_id)
        REFERENCES public.graph_nodes (campus_id, id)
);

CREATE TABLE IF NOT EXISTS public.emergency_affected_edges (
    campus_id uuid NOT NULL,
    emergency_id uuid NOT NULL,
    edge_id uuid NOT NULL,
    risk_score numeric(6, 5) NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 1),
    blocked boolean NOT NULL DEFAULT false,
    reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (emergency_id, edge_id),
    FOREIGN KEY (campus_id, emergency_id)
        REFERENCES public.emergencies (campus_id, id),
    FOREIGN KEY (campus_id, edge_id)
        REFERENCES public.graph_edges (campus_id, id)
);

CREATE TABLE IF NOT EXISTS public.node_conditions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL,
    node_id uuid NOT NULL,
    emergency_id uuid,
    people_count integer NOT NULL DEFAULT 0 CHECK (people_count >= 0),
    crowd_density numeric(8, 3) CHECK (crowd_density IS NULL OR crowd_density >= 0),
    risk_score numeric(6, 5) NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 1),
    congestion_score numeric(6, 5) NOT NULL DEFAULT 0 CHECK (congestion_score BETWEEN 0 AND 1),
    blocked boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (campus_id, node_id)
        REFERENCES public.graph_nodes (campus_id, id),
    FOREIGN KEY (campus_id, emergency_id)
        REFERENCES public.emergencies (campus_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS node_conditions_current_unique
    ON public.node_conditions (node_id) WHERE emergency_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS node_conditions_emergency_unique
    ON public.node_conditions (node_id, emergency_id) WHERE emergency_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.edge_conditions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    campus_id uuid NOT NULL,
    edge_id uuid NOT NULL,
    emergency_id uuid,
    people_count integer NOT NULL DEFAULT 0 CHECK (people_count >= 0),
    crowd_density numeric(8, 3) CHECK (crowd_density IS NULL OR crowd_density >= 0),
    congestion_score numeric(6, 5) NOT NULL DEFAULT 0 CHECK (congestion_score BETWEEN 0 AND 1),
    risk_score numeric(6, 5) NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 1),
    blocked boolean NOT NULL DEFAULT false,
    effective_speed double precision CHECK (
        effective_speed IS NULL OR (effective_speed > 0 AND effective_speed < 'Infinity'::float8)
    ),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (campus_id, edge_id)
        REFERENCES public.graph_edges (campus_id, id),
    FOREIGN KEY (campus_id, emergency_id)
        REFERENCES public.emergencies (campus_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS edge_conditions_current_unique
    ON public.edge_conditions (edge_id) WHERE emergency_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS edge_conditions_emergency_unique
    ON public.edge_conditions (edge_id, emergency_id) WHERE emergency_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS buildings_campus_idx ON public.buildings (campus_id);
CREATE INDEX IF NOT EXISTS floors_building_idx ON public.floors (campus_id, building_id);
CREATE INDEX IF NOT EXISTS graph_nodes_floor_idx ON public.graph_nodes (campus_id, floor_id);
CREATE INDEX IF NOT EXISTS graph_edges_from_node_idx ON public.graph_edges (campus_id, from_node_id);
CREATE INDEX IF NOT EXISTS graph_edges_to_node_idx ON public.graph_edges (campus_id, to_node_id);
CREATE INDEX IF NOT EXISTS exits_node_idx ON public.exits (campus_id, node_id);
CREATE INDEX IF NOT EXISTS assembly_points_node_idx ON public.assembly_points (campus_id, node_id);
CREATE INDEX IF NOT EXISTS emergencies_campus_status_idx ON public.emergencies (campus_id, status, started_at DESC);
CREATE INDEX IF NOT EXISTS emergency_affected_nodes_node_idx ON public.emergency_affected_nodes (campus_id, node_id);
CREATE INDEX IF NOT EXISTS emergency_affected_edges_edge_idx ON public.emergency_affected_edges (campus_id, edge_id);
CREATE INDEX IF NOT EXISTS node_conditions_lookup_idx ON public.node_conditions (campus_id, node_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS edge_conditions_lookup_idx ON public.edge_conditions (campus_id, edge_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
END;
$function$;

DO $triggers$
DECLARE
    target_table text;
BEGIN
    FOREACH target_table IN ARRAY ARRAY[
        'campuses', 'buildings', 'floors', 'graph_nodes', 'graph_edges',
        'exits', 'assembly_points', 'emergencies', 'node_conditions', 'edge_conditions'
    ] LOOP
        EXECUTE pg_catalog.format(
            'DROP TRIGGER IF EXISTS set_updated_at ON public.%I', target_table
        );
        EXECUTE pg_catalog.format(
            'CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I '
            'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', target_table
        );
    END LOOP;
END;
$triggers$;

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.floors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assembly_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_affected_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_affected_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.node_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.edge_conditions ENABLE ROW LEVEL SECURITY;

COMMIT;