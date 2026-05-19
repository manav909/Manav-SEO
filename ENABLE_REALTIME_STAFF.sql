-- Run this once in Supabase SQL Editor to enable Realtime on staff_members:
-- (Required for live permission sync to work)

alter publication supabase_realtime add table public.staff_members;
