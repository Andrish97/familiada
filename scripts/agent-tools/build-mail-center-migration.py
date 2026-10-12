"""Build the final atomic SQL from the reviewed local source modules."""
from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
files=['draft-mail-center-'+x+'-360.sql' for x in ['access','resignation','lists','source-guards','confirmation','delivery','preferences','cleanup']]
files+=['draft-mail-notification-'+x+'-361.sql' for x in ['sources','allocations','rpc','bind','revocation','delivery']]
output=root/(sys.argv[1] if len(sys.argv)>1 else 'docs/sql/draft-mail-center-final-360.sql')
header='''-- E19: private mail center and notification source lifecycle.
-- Auth email stays direct and independent of every notification flag/queue.
BEGIN;
-- Acquire all existing parents and children together. A legacy child-first
-- writer must be able to finish; retry releases every root acquired so far.
DO $$ BEGIN
 FOR attempt IN 1..1000 LOOP
  BEGIN
   LOCK TABLE auth.users,public.profiles,public.user_flags,public.email_unsub_tokens,
    public.games,public.question_bases,public.control_runtime_sessions,
    public.poll_subscriptions,public.friendships,public.poll_tasks,public.base_share_tasks,
    public.control_device_shares,public.reports,public.messages,public.mail_queue,
    public.mail_cooldowns,public.poll_mail_budget_events IN ACCESS EXCLUSIVE MODE NOWAIT;
   RETURN;
  EXCEPTION WHEN lock_not_available THEN IF attempt=1000 THEN RAISE; END IF; END;
  PERFORM pg_sleep(.01);
 END LOOP;
END $$;
'''
parts=[header]
for name in files:
 text=(root/'docs/sql'/name).read_text().replace('_prototype','')
 text='\n'.join(line for line in text.splitlines() if not line.startswith('-- LOCAL DRAFT'))+'\n'
 text=text.replace('-- Ordinary invitation source bindings are the next graph layer, not covered here.', '-- The notification source graph follows in the same transaction.')
 parts.append('-- Consolidated source: '+name+'\n'+text)
parts.append('COMMIT;\n')
output.write_text('\n'.join(parts))
print(output.relative_to(root))
