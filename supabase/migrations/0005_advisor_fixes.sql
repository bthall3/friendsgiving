-- 0005: security advisor fixes
-- Pin search_path on the remaining helper (lint 0011).
alter function private.assert_open() set search_path = public, extensions;

-- Nobody signs in, so the RPCs only need anon.
revoke execute on function public.claim_slot(uuid, text, text, text[], text[])         from authenticated;
revoke execute on function public.update_claim(uuid, text, text, text, text[], text[]) from authenticated;
revoke execute on function public.release_slot(uuid, text)                             from authenticated;
revoke execute on function public.submit_rsvp(text, boolean, int, text)                from authenticated;
