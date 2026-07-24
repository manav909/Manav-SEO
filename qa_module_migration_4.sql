-- QA Desk, traceability. Safe to run more than once.
-- Run in the Supabase SQL editor BEFORE deploying the code.

-- A finding must be traceable back to the exact cell it came from, so a disputed
-- result can be settled by looking, not by arguing. sheet_row is the row number
-- as seen in the spreadsheet (header included), row_ref is the sheet's own
-- identifier column if it has one, and source_column records which column the URL
-- was actually read from.
alter table qa_findings add column if not exists sheet_row     int;
alter table qa_findings add column if not exists row_ref       text;
alter table qa_findings add column if not exists source_column text;
