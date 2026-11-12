-- CI ONLY: exercise 24h authorization and fleet limits against the isolated
-- structural fixture, not against the hosted production database.
BEGIN;
CREATE TRIGGER ci_validate_vehicle_cap
  BEFORE INSERT ON xrmovi.vehicles FOR EACH ROW
  EXECUTE FUNCTION xrmovi.enforce_account_quota();
SET LOCAL request.jwt.claim.sub = '11111111-1111-4111-8111-111111111111';
SET LOCAL request.jwt.claim.role = 'authenticated';

INSERT INTO xrmovi.plans
  (code,title,vehicle_limit,seat_limit,company_limit,contract_limit,monthly_brl)
VALUES ('start','Legacy Start',5,1,1,1,19.90);

DO $$
DECLARE
  quote jsonb;
  trial jsonb;
  owner_id constant uuid:='11111111-1111-4111-8111-111111111111';
  ci_company constant uuid:='22222222-2222-4222-8222-222222222222';
  account_id constant uuid:='33333333-3333-4333-8333-333333333333';
  i int;
BEGIN
  IF auth.uid() IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'Local test JWT not available';
  END IF;
  quote:=public.xrmovi_vehicle_quote(5);
  IF quote->>'code'<>'fleet_5' OR (quote->>'monthly_brl')::numeric<>29.90
  THEN RAISE EXCEPTION 'Incorrect price for 5 vehicles: %',quote; END IF;
  quote:=public.xrmovi_vehicle_quote(10);
  IF quote->>'code'<>'fleet_10' OR (quote->>'monthly_brl')::numeric<>59.40
  THEN RAISE EXCEPTION 'Incorrect price for 10 vehicles: %',quote; END IF;
  IF (SELECT monthly_brl FROM xrmovi.plans WHERE code='start')<>19.90
  THEN RAISE EXCEPTION 'Legacy price changed'; END IF;
  INSERT INTO xrmovi.companies(id,name) VALUES(ci_company,'Frota de teste CI');
  INSERT INTO xrmovi.billing_accounts(id,owner_id,plan_code,status)
    VALUES(account_id,owner_id,'fleet_10','pending');
  INSERT INTO xrmovi.account_companies(account_id,company_id)
    VALUES(account_id,ci_company);
  INSERT INTO xrmovi.memberships(company_id,user_id,role)
    VALUES(ci_company,owner_id,'owner');
  INSERT INTO xrmovi.subscriptions(company_id,plan_code,status)
    VALUES(ci_company,'fleet_10','pending');

  IF xrmovi.company_is_paid(ci_company)
  THEN RAISE EXCEPTION 'Unpaid account was granted access'; END IF;

  trial:=public.xrmovi_start_trial(ci_company);
  IF trial->>'status'<>'trial'
     OR (trial->>'trial_expires_at')::timestamptz <= now()+interval '23 hours'
  THEN RAISE EXCEPTION '24-hour trial was not granted correctly: %',trial; END IF;
  IF NOT xrmovi.company_is_paid(ci_company)
  THEN RAISE EXCEPTION 'Trial access was not granted'; END IF;

  FOR i IN 1..5 LOOP
    INSERT INTO xrmovi.vehicles(company_id,plate,model)
      VALUES(ci_company,'CI-000'||i,'Mock vehicle');
  END LOOP;

  BEGIN
    INSERT INTO xrmovi.vehicles(company_id,plate,model)
      VALUES(ci_company,'CI-0006','Mock vehicle');
    RAISE EXCEPTION 'Sixth vehicle was incorrectly accepted';
  EXCEPTION WHEN sqlstate '23514' THEN
    NULL; -- expected: temporary trial cap is five
  END;

  UPDATE xrmovi.billing_accounts SET trial_end=now()-interval '1 minute' WHERE id=account_id;
  UPDATE xrmovi.subscriptions SET trial_end=now()-interval '1 minute' WHERE company_id=ci_company;
  IF xrmovi.company_is_paid(ci_company)
  THEN RAISE EXCEPTION 'Expired trial was incorrectly granted access'; END IF;

  BEGIN
    PERFORM public.xrmovi_start_trial(ci_company);
    RAISE EXCEPTION 'Second trial was incorrectly granted';
  EXCEPTION WHEN sqlstate '23514' THEN
    NULL;
  END;

  RAISE NOTICE 'PASS: pricing, legacy price, 24h access, trial cap, expiration, and no restart';
END
$$;
ROLLBACK;
