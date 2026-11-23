\set ON_ERROR_STOP 1
-- People: Olivia (owner), Adam (admin), Omar (operator), Vera (viewer), Xavier (other company), Eve (invited by mistake).
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000001', 'Olivia@Villas.tc', '{"full_name":"Olivia Owner","locale":"en"}'),
  ('a0000000-0000-0000-0000-000000000002', 'adam@villas.tc', '{"full_name":"Adam Admin"}'),
  ('a0000000-0000-0000-0000-000000000003', 'omar@villas.tc', '{"full_name":"Omar Ops"}'),
  ('a0000000-0000-0000-0000-000000000004', 'vera@villas.tc', '{"full_name":"Vera Viewer"}'),
  ('a0000000-0000-0000-0000-000000000005', 'xavier@other.tc', '{"full_name":"Xavier Outsider"}'),
  ('a0000000-0000-0000-0000-000000000006', 'eve@evil.tc', '{"full_name":"Eve"}');

do $$ begin
  assert (select email from public.profiles where id = 'a0000000-0000-0000-0000-000000000001') = 'olivia@villas.tc', 'profile email lowercased';
  assert (select locale from public.profiles where id = 'a0000000-0000-0000-0000-000000000001') = 'en', 'locale from signup';
end $$;

create function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
  select null::void;
$$;
create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

set role authenticated;

-- Not signed in: nothing works.
select set_config('request.jwt.claims', '', false);
do $$ begin
  begin perform public.create_organization('Ghost Co'); raise exception 'anonymous created an organisation';
  exception when invalid_authorization_specification then null; end;
end $$;

-- Olivia creates her company and becomes owner.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
insert into t values ('org', public.create_organization('  Island Villas  '));
do $$ declare v_org uuid := (select v::uuid from t where k = 'org'); begin
  assert (select name from public.organizations where id = v_org) = 'Island Villas', 'name trimmed';
  assert public.my_role(v_org) = 'owner', 'creator is owner';
  assert (select count(*) from public.audit_log where tenant_id = v_org and action = 'organization.created') = 1, 'creation audited';
  begin perform public.create_organization('x'); raise exception 'short name accepted';
  exception when invalid_parameter_value then null; end;
  -- Direct writes are blocked: only the functions may change memberships, invitations or the audit log.
  begin insert into public.memberships values (v_org, 'a0000000-0000-0000-0000-000000000006', 'owner', now()); raise exception 'direct membership insert';
  exception when insufficient_privilege then null; end;
  begin insert into public.audit_log (tenant_id, action, entity) values (v_org, 'fake', 'x'); raise exception 'direct audit insert';
  exception when insufficient_privilege then null; end;
  begin update public.organizations set name = 'Hacked' where id = v_org; raise exception 'direct organisation update';
  exception when insufficient_privilege then null; end;
end $$;

-- Olivia invites Adam (admin), Omar (operator), Vera (viewer).
insert into t select 'inv_adam', public.invite_member((select v::uuid from t where k = 'org'), ' ADAM@villas.tc ', 'admin');
insert into t select 'inv_omar', public.invite_member((select v::uuid from t where k = 'org'), 'omar@villas.tc', 'operator');
insert into t select 'inv_vera', public.invite_member((select v::uuid from t where k = 'org'), 'vera@villas.tc', 'viewer');
do $$ begin
  assert (select count(*) from public.invitations where token_hash = (select v from t where k = 'inv_adam')) = 0, 'raw token not stored';
  assert (select count(*) from public.invitations where email = 'adam@villas.tc') = 1, 'email normalised';
  assert (select organization_name from public.invitation_preview((select v from t where k = 'inv_adam'))) = 'Island Villas', 'preview works';
  assert (select count(*) from public.invitation_preview('not-a-token')) = 0, 'bad token previews nothing';
end $$;

-- Eve (another account) tries to use Adam's link: refused.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000006');
do $$ begin
  begin perform public.accept_invitation((select v from t where k = 'inv_adam')); raise exception 'wrong email accepted invitation';
  exception when insufficient_privilege then null; end;
  begin perform public.accept_invitation('guess'); raise exception 'guessed token accepted';
  exception when invalid_parameter_value then null; end;
end $$;

-- Each invitee accepts their own link.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002'); select public.accept_invitation((select v from t where k = 'inv_adam'));
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003'); select public.accept_invitation((select v from t where k = 'inv_omar'));
select pg_temp.as_user('a0000000-0000-0000-0000-000000000004'); select public.accept_invitation((select v from t where k = 'inv_vera'));
do $$ begin
  begin perform public.accept_invitation((select v from t where k = 'inv_vera')); raise exception 'invitation reused';
  exception when invalid_parameter_value then null; end;
end $$;

-- Vera (viewer) sees the organisation and its members but cannot invite, rename, change roles or read the audit log.
do $$ declare v_org uuid := (select v::uuid from t where k = 'org'); begin
  assert (select count(*) from public.memberships where tenant_id = v_org) = 4, 'viewer sees members';
  assert (select count(*) from public.profiles) = 4, 'viewer sees teammates profiles only';
  assert (select count(*) from public.audit_log) = 0, 'viewer cannot read audit log';
  assert (select count(*) from public.invitations) = 0, 'viewer cannot read invitations';
  begin perform public.invite_member(v_org, 'x@y.tc', 'viewer'); raise exception 'viewer invited';
  exception when insufficient_privilege then null; end;
  begin perform public.rename_organization(v_org, 'Mine now'); raise exception 'viewer renamed';
  exception when insufficient_privilege then null; end;
  begin perform public.change_member_role(v_org, auth.uid(), 'owner'); raise exception 'viewer promoted self';
  exception when insufficient_privilege then null; end;
  begin update public.profiles set email = 'x@y.tc' where id = auth.uid(); raise exception 'email editable';
  exception when insufficient_privilege then null; end;
  update public.profiles set full_name = 'Vera V.' where id = auth.uid();
end $$;

-- Omar (operator) cannot manage the team either.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
do $$ declare v_org uuid := (select v::uuid from t where k = 'org'); begin
  begin perform public.invite_member(v_org, 'x@y.tc', 'viewer'); raise exception 'operator invited';
  exception when insufficient_privilege then null; end;
  begin perform public.remove_member(v_org, 'a0000000-0000-0000-0000-000000000004'); raise exception 'operator removed someone';
  exception when insufficient_privilege then null; end;
end $$;

-- Adam (admin) manages non-owners but cannot create or touch owners.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
do $$ declare v_org uuid := (select v::uuid from t where k = 'org'); begin
  assert (select count(*) from public.audit_log where tenant_id = v_org) >= 7, 'admin reads audit log';
  perform public.change_member_role(v_org, 'a0000000-0000-0000-0000-000000000004', 'operator');
  assert (select role from public.memberships where user_id = 'a0000000-0000-0000-0000-000000000004') = 'operator', 'admin changed role';
  begin perform public.change_member_role(v_org, auth.uid(), 'owner'); raise exception 'admin made self owner';
  exception when insufficient_privilege then null; end;
  begin perform public.change_member_role(v_org, 'a0000000-0000-0000-0000-000000000001', 'viewer'); raise exception 'admin demoted owner';
  exception when insufficient_privilege then null; end;
  begin perform public.invite_member(v_org, 'new@villas.tc', 'owner'); raise exception 'admin invited an owner';
  exception when insufficient_privilege then null; end;
  begin perform public.remove_member(v_org, 'a0000000-0000-0000-0000-000000000001'); raise exception 'admin removed owner';
  exception when insufficient_privilege then null; end;
  perform public.rename_organization(v_org, 'Island Villas Ltd');
  insert into t select 'inv_new', public.invite_member(v_org, 'new@villas.tc', 'viewer');
  perform public.revoke_invitation((select id from public.invitations where email = 'new@villas.tc' and revoked_at is null));
  assert (select count(*) from public.invitation_preview((select v from t where k = 'inv_new'))) = 0, 'revoked link is dead';
end $$;

-- Xavier (other company) sees nothing of Island Villas and cannot act on it.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000005');
insert into t values ('org2', public.create_organization('Other Co'));
do $$ declare v_org uuid := (select v::uuid from t where k = 'org'); begin
  assert (select count(*) from public.organizations) = 1, 'outsider sees only own organisation';
  assert (select count(*) from public.memberships) = 1, 'outsider sees only own memberships';
  assert (select count(*) from public.profiles) = 1, 'outsider sees only own profile';
  assert (select count(*) from public.audit_log where tenant_id = v_org) = 0, 'outsider reads no audit';
  assert public.my_role(v_org) is null, 'outsider has no role';
  begin perform public.invite_member(v_org, 'x@other.tc', 'admin'); raise exception 'outsider invited';
  exception when insufficient_privilege then null; end;
  begin perform public.remove_member(v_org, 'a0000000-0000-0000-0000-000000000003'); raise exception 'outsider removed';
  exception when no_data_found then null; end;
  begin perform public.rename_organization(v_org, 'pwned'); raise exception 'outsider renamed';
  exception when insufficient_privilege then null; end;
end $$;

-- Olivia: the last owner can neither leave nor demote herself; after promoting Adam she can.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
do $$ declare v_org uuid := (select v::uuid from t where k = 'org'); begin
  assert (select count(*) from public.my_organizations()) = 1, 'switcher lists own organisations';
  begin perform public.remove_member(v_org, auth.uid()); raise exception 'last owner left';
  exception when check_violation then null; end;
  begin perform public.change_member_role(v_org, auth.uid(), 'admin'); raise exception 'last owner demoted';
  exception when check_violation then null; end;
  perform public.change_member_role(v_org, 'a0000000-0000-0000-0000-000000000002', 'owner');
  perform public.remove_member(v_org, 'a0000000-0000-0000-0000-000000000003');
  perform public.remove_member(v_org, auth.uid());
  assert public.my_role(v_org) is null, 'Olivia left';
end $$;

-- Omar was removed: he no longer sees anything of the organisation.
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
do $$ begin
  assert (select count(*) from public.organizations) = 0, 'removed member sees nothing';
end $$;

reset role;
do $$ declare v_org uuid := (select v::uuid from t where k = 'org'); begin
  assert (select count(*) from public.audit_log where tenant_id = v_org and action in
    ('member.invited','member.joined','member.role_changed','member.removed','member.left','organization.renamed','member.invitation_revoked')) >= 10,
    'sensitive actions audited';
end $$;

-- Visitors without a session cannot call any function of the API.
set role anon;
select set_config('request.jwt.claims', '', false);
do $$ begin
  begin perform public.is_member(gen_random_uuid()); raise exception 'anon called is_member';
  exception when insufficient_privilege then null; end;
  begin perform public.my_role(gen_random_uuid()); raise exception 'anon called my_role';
  exception when insufficient_privilege then null; end;
  begin perform public.create_organization('Anon Co'); raise exception 'anon called create_organization';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
