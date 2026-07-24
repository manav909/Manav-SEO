-- QA Desk, structural additions. Safe to run more than once.
-- Run this in the Supabase SQL editor BEFORE deploying the code.

-- A client has a unique handle (a Fiverr username or account id, always unique)
-- AND a human or business name. They are different things and both are needed.
alter table qa_reviews add column if not exists client_id text;

-- Two different people touch a delivery and they are not interchangeable:
--   BDE  the business development executive who spoke to the client. Findable in
--        the chat and the mail, because they are in the conversation.
--   DME  the digital marketing executive who did the work. Never named in client
--        conversations, so it is set once by hand and then remembered.
alter table qa_reviews add column if not exists bde_name text;

-- executive_name on qa_reviews continues to hold the DME, which is who the QA
-- record is actually about.
alter table qa_executives add column if not exists role text default 'dme';

create index if not exists qa_reviews_client_id_idx on qa_reviews (client_id);
create index if not exists qa_reviews_bde_idx       on qa_reviews (bde_name);
create index if not exists qa_executives_role_idx   on qa_executives (role, name);
