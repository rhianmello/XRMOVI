-- Operational lookups only; no blanket indexing of low-cardinality catalog FKs.
-- These tables were inspected before preparing this migration (small relations).
-- Abort quickly rather than holding up live fleet writes if a table is busy.
set local lock_timeout = '2s';
set local statement_timeout = '30s';
create index if not exists fuel_entries_company_date_idx on xrmovi.fuel_entries(company_id, fueled_on desc);
create index if not exists fuel_entries_vehicle_idx on xrmovi.fuel_entries(vehicle_id);
create index if not exists fuel_receipts_company_idx on xrmovi.fuel_receipts(company_id);
create index if not exists fuel_receipts_fuel_idx on xrmovi.fuel_receipts(fuel_id);
create index if not exists maintenance_tasks_company_due_idx on xrmovi.maintenance_tasks(company_id, due_date);
create index if not exists maintenance_tasks_vehicle_idx on xrmovi.maintenance_tasks(vehicle_id);
create index if not exists maintenance_attachments_company_idx on xrmovi.maintenance_attachments(company_id);
create index if not exists maintenance_attachments_task_idx on xrmovi.maintenance_attachments(task_id);
create index if not exists memberships_user_idx on xrmovi.memberships(user_id);
