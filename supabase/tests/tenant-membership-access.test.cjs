const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const migration=fs.readFileSync(path.join(__dirname,'../migrations/20261113134500_xrmovi_tenant_membership_access_helpers.sql'),'utf8');

test('tenant access guard validates authenticated caller and membership before payment',()=>{
 const guard=migration.split('create or replace function public.xrmovi_assert_company_access')[1].split('create or replace function public.xrmovi_client_account_allowed')[0];
 assert.match(guard,/caller is null or cid is null/);
 assert.match(guard,/xrmovi\.platform_admins/);
 assert.match(guard,/xrmovi\.memberships/);
 assert.match(guard,/m\.company_id\s*=\s*cid and m\.user_id\s*=\s*caller/);
 assert.ok(guard.indexOf('xrmovi.memberships')<guard.indexOf('xrmovi.company_is_paid(cid)'));
 assert.match(guard,/errcode\s*=\s*'42501'/);
});
test('client status helper does not reveal a foreign paid subscription',()=>{
 const helper=migration.split('create or replace function public.xrmovi_client_account_allowed')[1];
 assert.match(helper,/\(select auth\.uid\(\)\) is not null/);
 assert.match(helper,/xrmovi\.platform_admins/);
 assert.match(helper,/xrmovi\.memberships/);
 assert.match(helper,/m\.company_id\s*=\s*cid and m\.user_id\s*=\s*\(select auth\.uid\(\)\)/);
 assert.match(helper,/xrmovi\.company_is_paid\(cid\)/);
});
