-- Server-side waitlist enforcement: block signups for non-approved emails
-- This trigger runs BEFORE INSERT on auth.users and rejects unapproved emails.

CREATE OR REPLACE FUNCTION public.check_waitlist_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow if email is on the waitlist and approved
  IF EXISTS (
    SELECT 1 FROM public.waitlist
    WHERE LOWER(email) = LOWER(NEW.email) AND status = 'approved'
  ) THEN
    RETURN NEW;
  END IF;

  -- Reject signup for unapproved emails
  RAISE EXCEPTION 'Signup is currently invite-only. Please join the waitlist first.'
    USING ERRCODE = 'P0001';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any (idempotent)
DROP TRIGGER IF EXISTS enforce_waitlist ON auth.users;

CREATE TRIGGER enforce_waitlist
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.check_waitlist_on_signup();
