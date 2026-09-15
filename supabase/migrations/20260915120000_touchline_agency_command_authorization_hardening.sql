-- Replace legacy role-blind tenant mutation policies with command-specific,
-- least-privilege authorization. Reads remain available to agency members.
-- Global (agency_id IS NULL) feed rows remain readable but are service-written.

begin;
set local lock_timeout = '5s';

-- Migration 005 granted every current and future table to authenticated users.
-- Remove that mutation default before narrowing the existing tables below.
alter default privileges in schema public
  revoke insert, update, delete on tables from authenticated;

revoke all privileges on table
  public.agencies,
  public.clubs,
  public.players,
  public.deals,
  public.contracts,
  public.invoices,
  public.player_documents,
  public.player_videos,
  public.player_notes,
  public.player_market_snapshots,
  public.market_radar_links,
  public.club_agent_follows,
  public.player_opportunities,
  public.player_interests,
  public.negotiation_rooms,
  public.negotiation_messages,
  public.negotiation_files,
  public.football_live_items,
  public.community_posts_phase2,
  public.match_predictions
from authenticated;

grant select on table
  public.agencies,
  public.clubs,
  public.players,
  public.deals,
  public.contracts,
  public.invoices,
  public.player_documents,
  public.player_videos,
  public.player_notes,
  public.player_market_snapshots,
  public.market_radar_links,
  public.club_agent_follows,
  public.player_opportunities,
  public.player_interests,
  public.negotiation_rooms,
  public.negotiation_messages,
  public.negotiation_files,
  public.football_live_items,
  public.community_posts_phase2,
  public.match_predictions
to authenticated;

-- RLS supplies the application-role split inside the authenticated DB role.
grant update on table public.agencies to authenticated;
grant insert, update, delete on table
  public.clubs,
  public.players,
  public.deals,
  public.contracts,
  public.invoices,
  public.player_documents,
  public.player_videos,
  public.player_notes,
  public.player_market_snapshots,
  public.market_radar_links,
  public.club_agent_follows,
  public.player_opportunities,
  public.player_interests,
  public.negotiation_rooms,
  public.negotiation_messages,
  public.negotiation_files,
  public.football_live_items,
  public.community_posts_phase2
to authenticated;

-- The legacy prediction table has no authoritative fixture cutoff relation.
-- Keep every write service-owned so a client cannot submit after the result.

-- The server role retains explicit full access for ingestion, moderation,
-- settlement, and administrative workflows.
grant select, insert, update, delete on table
  public.agencies,
  public.clubs,
  public.players,
  public.deals,
  public.contracts,
  public.invoices,
  public.player_documents,
  public.player_videos,
  public.player_notes,
  public.player_market_snapshots,
  public.market_radar_links,
  public.club_agent_follows,
  public.player_opportunities,
  public.player_interests,
  public.negotiation_rooms,
  public.negotiation_messages,
  public.negotiation_files,
  public.football_live_items,
  public.community_posts_phase2,
  public.match_predictions
to service_role;

-- Remove every legacy broad same-agency policy in the covered schemas.
drop policy if exists "agency members access agency" on public.agencies;
drop policy if exists "tenant clubs" on public.clubs;
drop policy if exists "tenant players" on public.players;
drop policy if exists "tenant deals" on public.deals;
drop policy if exists "tenant contracts" on public.contracts;
drop policy if exists "tenant invoices" on public.invoices;
drop policy if exists "tenant documents" on public.player_documents;
drop policy if exists "tenant videos" on public.player_videos;
drop policy if exists "tenant notes" on public.player_notes;
drop policy if exists "tenant market snapshots" on public.player_market_snapshots;
drop policy if exists "tenant market radar links" on public.market_radar_links;
drop policy if exists "tenant club agent follows" on public.club_agent_follows;
drop policy if exists "tenant player opportunities" on public.player_opportunities;
drop policy if exists "tenant player interests" on public.player_interests;
drop policy if exists "tenant negotiation rooms" on public.negotiation_rooms;
drop policy if exists "tenant negotiation messages" on public.negotiation_messages;
drop policy if exists "tenant negotiation files" on public.negotiation_files;
drop policy if exists "tenant football live items" on public.football_live_items;
drop policy if exists "tenant community posts phase2" on public.community_posts_phase2;
drop policy if exists "tenant match predictions" on public.match_predictions;

-- Make the forward migration safe to replay in disposable verification
-- environments. Applied migration history remains immutable.
drop policy if exists "agency members read agency" on public.agencies;
drop policy if exists "agency administrators update agency" on public.agencies;
drop policy if exists "agency members read invoices" on public.invoices;
drop policy if exists "agency finance insert invoices" on public.invoices;
drop policy if exists "agency finance update invoices" on public.invoices;
drop policy if exists "agency finance delete invoices" on public.invoices;
drop policy if exists "agency members read player videos" on public.player_videos;
drop policy if exists "agency administrators insert player videos" on public.player_videos;
drop policy if exists "agency administrators update player videos" on public.player_videos;
drop policy if exists "agency administrators delete player videos" on public.player_videos;
drop policy if exists "agency operators insert player videos" on public.player_videos;
drop policy if exists "agency operators update player videos" on public.player_videos;
drop policy if exists "agency operators delete player videos" on public.player_videos;
drop policy if exists "members read global or agency football_live_items" on public.football_live_items;
drop policy if exists "agency administrators insert tenant football_live_items" on public.football_live_items;
drop policy if exists "agency administrators update tenant football_live_items" on public.football_live_items;
drop policy if exists "agency administrators delete tenant football_live_items" on public.football_live_items;
drop policy if exists "members read global or agency community_posts_phase2" on public.community_posts_phase2;
drop policy if exists "agency operators insert tenant community_posts_phase2" on public.community_posts_phase2;
drop policy if exists "agency operators update tenant community_posts_phase2" on public.community_posts_phase2;
drop policy if exists "agency operators delete tenant community_posts_phase2" on public.community_posts_phase2;
drop policy if exists "agency administrators insert tenant community_posts_phase2" on public.community_posts_phase2;
drop policy if exists "agency administrators update tenant community_posts_phase2" on public.community_posts_phase2;
drop policy if exists "agency administrators delete tenant community_posts_phase2" on public.community_posts_phase2;
drop policy if exists "members read own predictions" on public.match_predictions;
drop policy if exists "members insert own unsettled predictions" on public.match_predictions;
drop policy if exists "members update own unsettled predictions" on public.match_predictions;
drop policy if exists "members delete own unsettled predictions" on public.match_predictions;

-- Scrub a column-level privilege from an earlier local candidate if it was
-- applied manually before this forward migration was finalised.
revoke update (prediction) on table public.match_predictions from authenticated;

-- Tenant roots: all members read; owners/admins update; authenticated users
-- never delete an agency root.
create policy "agency members read agency"
  on public.agencies for select to authenticated
  using (id = public.current_agency_id());

create policy "agency administrators update agency"
  on public.agencies for update to authenticated
  using (
    id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  )
  with check (
    id = public.current_agency_id()
    and public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
  );

-- Owner/admin-only tenant and sensitive contract/provider records.
do $policy$
declare
  table_name text;
begin
  foreach table_name in array array[
    'clubs',
    'contracts',
    'player_market_snapshots'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'agency members read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'agency administrators insert ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'agency administrators update ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I', 'agency administrators delete ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (agency_id = public.current_agency_id())',
      'agency members read ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role))',
      'agency administrators insert ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role)) with check (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role))',
      'agency administrators update ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role))',
      'agency administrators delete ' || table_name, table_name
    );
  end loop;
end
$policy$;

-- Finance is mutation-capable only on invoices. Owners/admins retain the same
-- administrative access; all other agency roles are read-only.
create policy "agency members read invoices"
  on public.invoices for select to authenticated
  using (agency_id = public.current_agency_id());

create policy "agency finance insert invoices"
  on public.invoices for insert to authenticated
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role,
      'finance'::public.agency_role
    )
  );

create policy "agency finance update invoices"
  on public.invoices for update to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role,
      'finance'::public.agency_role
    )
  )
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role,
      'finance'::public.agency_role
    )
  );

create policy "agency finance delete invoices"
  on public.invoices for delete to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role,
      'finance'::public.agency_role
    )
  );

-- Agent operational tables with an authorship/ownership column. Agents may
-- mutate only their own rows; owners/admins may administer the tenant rows.
do $policy$
declare
  item record;
begin
  for item in
    select * from (values
      ('players', 'agent_id'),
      ('deals', 'owner_id'),
      ('player_documents', 'uploaded_by'),
      ('player_notes', 'author_id'),
      ('club_agent_follows', 'followed_by'),
      ('player_opportunities', 'created_by'),
      ('player_interests', 'created_by'),
      ('negotiation_rooms', 'created_by'),
      ('negotiation_messages', 'sender_id'),
      ('negotiation_files', 'uploaded_by'),
      ('market_radar_links', 'created_by')
    ) as operational(table_name, author_column)
  loop
    execute format('drop policy if exists %I on public.%I', 'agency members read ' || item.table_name, item.table_name);
    execute format('drop policy if exists %I on public.%I', 'agency operators insert ' || item.table_name, item.table_name);
    execute format('drop policy if exists %I on public.%I', 'agency operators update ' || item.table_name, item.table_name);
    execute format('drop policy if exists %I on public.%I', 'agency operators delete ' || item.table_name, item.table_name);
    execute format('drop policy if exists %I on public.%I', 'agency administrators insert ' || item.table_name, item.table_name);
    execute format('drop policy if exists %I on public.%I', 'agency administrators update ' || item.table_name, item.table_name);
    execute format('drop policy if exists %I on public.%I', 'agency administrators delete ' || item.table_name, item.table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using (agency_id = public.current_agency_id())',
      'agency members read ' || item.table_name, item.table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (agency_id = public.current_agency_id() and (public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role) or (public.current_agency_role() = ''agent''::public.agency_role and %I = auth.uid())))',
      'agency operators insert ' || item.table_name, item.table_name, item.author_column
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (agency_id = public.current_agency_id() and (public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role) or (public.current_agency_role() = ''agent''::public.agency_role and %I = auth.uid()))) with check (agency_id = public.current_agency_id() and (public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role) or (public.current_agency_role() = ''agent''::public.agency_role and %I = auth.uid())))',
      'agency operators update ' || item.table_name, item.table_name, item.author_column, item.author_column
    );
    if item.table_name in ('players', 'negotiation_rooms') then
      execute format(
        'create policy %I on public.%I for delete to authenticated using (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role))',
        'agency administrators delete ' || item.table_name, item.table_name
      );
    else
      execute format(
        'create policy %I on public.%I for delete to authenticated using (agency_id = public.current_agency_id() and (public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role) or (public.current_agency_role() = ''agent''::public.agency_role and %I = auth.uid())))',
        'agency operators delete ' || item.table_name, item.table_name, item.author_column
      );
    end if;
  end loop;
end
$policy$;

-- Player videos have no authorship column in the historical schema. Without an
-- ownership boundary, mutation remains owner/admin-only.
create policy "agency members read player videos"
  on public.player_videos for select to authenticated
  using (agency_id = public.current_agency_id());

create policy "agency administrators insert player videos"
  on public.player_videos for insert to authenticated
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role
    )
  );

create policy "agency administrators update player videos"
  on public.player_videos for update to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role
    )
  )
  with check (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role
    )
  );

create policy "agency administrators delete player videos"
  on public.player_videos for delete to authenticated
  using (
    agency_id = public.current_agency_id()
    and public.current_agency_role() in (
      'owner'::public.agency_role,
      'admin'::public.agency_role
    )
  );

-- Global feed rows are readable by every authenticated member but can only be
-- changed through the service role. Tenant rows remain owner/admin-managed.
do $policy$
declare
  table_name text;
begin
  foreach table_name in array array['football_live_items']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (agency_id is null or agency_id = public.current_agency_id())',
      'members read global or agency ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role))',
      'agency administrators insert tenant ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role)) with check (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role))',
      'agency administrators update tenant ' || table_name, table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (agency_id = public.current_agency_id() and public.current_agency_role() in (''owner''::public.agency_role, ''admin''::public.agency_role))',
      'agency administrators delete tenant ' || table_name, table_name
    );
  end loop;
end
$policy$;

-- Community posts preserve the author workflow for agents while global rows
-- remain service-written and immutable to authenticated clients.
create policy "members read global or agency community_posts_phase2"
  on public.community_posts_phase2 for select to authenticated
  using (agency_id is null or agency_id = public.current_agency_id());

create policy "agency operators insert tenant community_posts_phase2"
  on public.community_posts_phase2 for insert to authenticated
  with check (
    agency_id = public.current_agency_id()
    and (
      public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
      or (public.current_agency_role() = 'agent'::public.agency_role and author_id = auth.uid())
    )
  );

create policy "agency operators update tenant community_posts_phase2"
  on public.community_posts_phase2 for update to authenticated
  using (
    agency_id = public.current_agency_id()
    and (
      public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
      or (public.current_agency_role() = 'agent'::public.agency_role and author_id = auth.uid())
    )
  )
  with check (
    agency_id = public.current_agency_id()
    and (
      public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
      or (public.current_agency_role() = 'agent'::public.agency_role and author_id = auth.uid())
    )
  );

create policy "agency operators delete tenant community_posts_phase2"
  on public.community_posts_phase2 for delete to authenticated
  using (
    agency_id = public.current_agency_id()
    and (
      public.current_agency_role() in ('owner'::public.agency_role, 'admin'::public.agency_role)
      or (public.current_agency_role() = 'agent'::public.agency_role and author_id = auth.uid())
    )
  );

-- Predictions are personal rather than tenant-administered. The historical
-- schema has no authoritative fixture cutoff relation, so clients receive
-- read-only access. A future server command may add pre-kickoff submission
-- only after binding fixture_key to an authoritative start time.
create policy "members read own predictions"
  on public.match_predictions for select to authenticated
  using (user_id = auth.uid());

comment on table public.match_predictions is
  'Clients have own-row read access only. Submission and settlement are service-owned until fixture_key has an authoritative cutoff relation.';

commit;
