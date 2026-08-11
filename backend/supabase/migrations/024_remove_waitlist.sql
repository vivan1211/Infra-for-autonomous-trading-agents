-- Remove waitlist feature: drop enforcement trigger, function, and table
DROP TRIGGER IF EXISTS enforce_waitlist ON auth.users;
DROP FUNCTION IF EXISTS public.check_waitlist_on_signup();
DROP TABLE IF EXISTS public.waitlist;
