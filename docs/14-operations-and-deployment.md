# Operations and deployment

## Environments

Development: synthetic data, localhost, no real funds. Staging: isolated credentials/database/devices, controlled fixtures and approved provider tests only. Production: approved central accounts, managed phones, HTTPS, private data services and monitored finance operations.

Promote immutable tested builds. Never use prototype terminal login keys, demo merchant IDs or SQLite file as production authorization/accounting.

## Deployment

Deploy web, API and worker as independently restartable services. PostgreSQL with automated encrypted backup and point-in-time recovery; Redis for scheduling only. Secrets managed outside Git. Migrations are versioned and reviewed; zero/low-downtime strategy preserves active ingestion and matching.

Android releases signed by controlled release key. Verify update signature/origin, stage rollout on one phone, confirm capture and queue behavior before expanding. Do not force an update that discards pending evidence.

## Monitoring

Measure request failures/latency, receipt ingestion rate, parse failure rate by template version, duplicates/conflicts, device heartbeat age, queue count/oldest age, match latency, outstanding review amounts, ledger invariant failures, settlement reservations and webhook backlog.

Alerts route to authorized operators. Proposed thresholds: device stale >30 minutes; online unsynced evidence >15 minutes; template failure spike over baseline; any unbalanced posting or duplicate consumption attempt; settlement uncertainty unresolved >1 business day. Adjust thresholds from pilot results rather than assuming perfect background Android delivery.

## Runbooks

### Offline device

Pause new allocation to affected account. Check network, permissions, binding, app health and local backlog. Restore connection, ingest queued events with original IDs, then reconcile missing messages. Resume only after health and evidence checks.

### Format changed

Keep new SMS evidence unparsed. Admin clones template, tests real redacted samples and negatives, publishes new version, reparses affected unmatched events and monitors results. No mass rewrite of consumed receipts.

### Suspected compromised phone/account

Quarantine account and unmatched evidence; revoke device; suspend new allocation. Preserve audit/evidence, reconcile statements, rotate affected credentials and approve replacement binding. Existing verified history receives finance investigation, not automatic deletion.

### Failed merchant webhook

Payment remains verified. Review endpoint errors, apply validated configuration fix and retry same event ID. Merchant can poll status. No second ledger credit.

### Uncertain payout

Keep reserved funds. Check external statement/evidence before repeating or releasing. Record resolution through authorized finance operation. Never retry blindly after a timeout.

### Backup restore

Restore in isolated environment first. Validate ledger balances, unique receipt consumption and pending outbox state. Replays preserve financial/event IDs. Reconcile externally completed payouts that occurred after restored checkpoint before resuming settlement execution.

## Operational ownership

Operations owns phones/templates/review queues; finance owns reconciliation and settlements; security owns credentials/access/incidents; engineering owns migrations/builds and reliability. Assign actual people before pilot. Record emergency contacts, incident severity and escalation in private operations configuration.

## Launch checklist

- [ ] Approved accounts, operations and fund-holding arrangement.
- [ ] Tested signed app distribution and supported phone/SIM matrix.
- [ ] Real message fixtures for each enabled combination.
- [ ] Auth/tenant/finance acceptance tests pass.
- [ ] HTTPS, secrets, backups and restore drill complete.
- [ ] Alerts, queues and finance reconciliation staffed.
- [ ] Pilot caps and stop-collection control tested.
- [ ] Settlement evidence and uncertainty workflow tested.
